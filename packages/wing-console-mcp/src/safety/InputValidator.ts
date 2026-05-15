/**
 * Per-tool JSON Schema runtime validation v2.
 *
 * Validates tool arguments against their declared inputSchema.
 * - Rejects unknown/extra fields
 * - Deep-validates WingValue objects (discriminated union)
 * - Required fields, type checking, enum validation, numeric ranges
 */

interface JsonSchema {
  type: string;
  properties?: Record<string, JsonSchemaProperty>;
  required?: string[];
  additionalProperties?: boolean;
}

interface JsonSchemaProperty {
  type?: string;
  description?: string;
  enum?: string[];
  default?: unknown;
  items?: JsonSchemaProperty;
  properties?: Record<string, JsonSchemaProperty>;
  required?: string[];
  minimum?: number;
  maximum?: number;
}

export interface ValidationError {
  path: string;
  message: string;
}

/** Validate a WingValue object deeply */
function validateWingValue(value: unknown, path: string): ValidationError[] {
  const errors: ValidationError[] = [];
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    errors.push({ path, message: `WingValue must be an object, got ${typeof value}` });
    return errors;
  }
  const v = value as Record<string, unknown>;
  // Must have a valid type field
  const validTypes = ["bool", "int", "float", "string", "node"];
  if (!validTypes.includes(v.type as string)) {
    errors.push({ path: `${path}.type`, message: `WingValue type must be one of [${validTypes.join(", ")}], got '${v.type}'` });
  }
  // Must have a value field
  if (!("value" in v)) {
    errors.push({ path: `${path}.value`, message: "WingValue requires 'value' field" });
  } else {
    const t = v.type as string;
    const val = v.value;
    if (t === "bool" && typeof val !== "boolean") {
      errors.push({ path: `${path}.value`, message: `bool WingValue requires boolean value, got ${typeof val}` });
    }
    if (t === "int" && (typeof val !== "number" || !Number.isInteger(val))) {
      errors.push({ path: `${path}.value`, message: `int WingValue requires integer value, got ${typeof val}` });
    }
    if (t === "float" && (typeof val !== "number" || !Number.isFinite(val))) {
      errors.push({ path: `${path}.value`, message: `float WingValue requires finite numeric value, got ${typeof val}${typeof val === "number" && !Number.isFinite(val) ? " (NaN/Infinity)" : ""}` });
    }
    if (t === "string" && typeof val !== "string") {
      errors.push({ path: `${path}.value`, message: `string WingValue requires string value, got ${typeof val}` });
    }
    if (t === "node" && (typeof val !== "object" || val === null)) {
      errors.push({ path: `${path}.value`, message: `node WingValue requires object value, got ${typeof val}` });
    }
  }
  // Reject extra properties
  for (const key of Object.keys(v)) {
    if (!["type", "value", "unit"].includes(key)) {
      errors.push({ path: `${path}.${key}`, message: `Unknown property '${key}' in WingValue` });
    }
  }
  return errors;
}

export function validateAgainstSchema(
  schema: JsonSchema | undefined,
  args: Record<string, unknown>,
  toolName: string,
): ValidationError[] {
  const errors: ValidationError[] = [];
  if (!schema || schema.type !== "object" || !schema.properties) return errors;

  const props = schema.properties;

  // Reject unknown fields
  for (const key of Object.keys(args)) {
    if (!(key in props)) {
      errors.push({ path: key, message: `Unknown field '${key}' is not allowed for tool '${toolName}'` });
    }
  }

  // Check required fields
  if (schema.required) {
    for (const field of schema.required) {
      if (args[field] === undefined || args[field] === null) {
        errors.push({ path: field, message: `Required field '${field}' is missing for tool '${toolName}'` });
      }
    }
  }

  // Validate each property
  for (const [key, prop] of Object.entries(props)) {
    const value = args[key];
    if (value === undefined) continue;

    // Type validation
    if (prop.type) {
      const actualType = Array.isArray(value) ? "array" : typeof value;
      const expectedType = prop.type;
      let typeOk = actualType === expectedType;
      if (expectedType === "number" && actualType === "number") typeOk = true;
      if (expectedType === "integer" && typeof value === "number" && Number.isInteger(value)) typeOk = true;

      if (!typeOk) {
        errors.push({ path: key, message: `Field '${key}' should be ${expectedType}, got ${actualType}` });
        continue;
      }
    }

    // WingValue deep validation for object-type params named "value" or "requested_value"
    if (prop.type === "object" && (key === "value" || key === "requested_value" || key === "osc_value" || key === "native_value")) {
      errors.push(...validateWingValue(value, key));
    }

    // Enum validation
    if (prop.enum && !prop.enum.includes(value as string)) {
      errors.push({ path: key, message: `Field '${key}' must be one of [${prop.enum.join(", ")}], got '${value}'` });
    }

    // Numeric range
    if ((prop.type === "number" || prop.type === "integer") && typeof value === "number") {
      if (prop.minimum !== undefined && value < prop.minimum) {
        errors.push({ path: key, message: `Field '${key}' must be >= ${prop.minimum}, got ${value}` });
      }
      if (prop.maximum !== undefined && value > prop.maximum) {
        errors.push({ path: key, message: `Field '${key}' must be <= ${prop.maximum}, got ${value}` });
      }
    }

    // String length limits (global safety caps)
    if (prop.type === "string" && typeof value === "string") {
      const v = value as string;
      if (v.length > 500) {
        errors.push({ path: key, message: `Field '${key}' exceeds max length 500 (got ${v.length})` });
      }
      // Path safety checks
      if ((key === "path" || key === "target" || key === "target_path" || key.includes("path")) && v.length > 0) {
        if (!v.startsWith("/")) errors.push({ path: key, message: `Path must start with '/': ${v}` });
        if (v.includes("..")) errors.push({ path: key, message: `Path contains '..' which is not allowed: ${v}` });
        if (v.includes("\0")) errors.push({ path: key, message: `Path contains null byte: ${v}` });
      }
    }

    // Array items + size limits
    if (prop.type === "array" && Array.isArray(value)) {
      const maxItems = key === "targets" || key === "paths" ? 128 : 64;
      if (value.length > maxItems) {
        errors.push({ path: key, message: `Array '${key}' exceeds max ${maxItems} items (got ${value.length})` });
      }
      if (prop.items) {
        for (let i = 0; i < value.length; i++) {
          const item = value[i];
          const itemType = typeof item;
          const expected = prop.items.type;
          // Integer check: allow number values for "integer" type
          const typeOk = expected === "integer" ? itemType === "number" && Number.isInteger(item)
            : expected ? itemType === expected : true;
          if (!typeOk) {
            errors.push({ path: `${key}[${i}]`, message: `Should be ${expected}, got ${itemType}` });
          }
          if (prop.items.enum && !prop.items.enum.includes(item as string)) {
            errors.push({ path: `${key}[${i}]`, message: `Must be one of [${prop.items.enum.join(", ")}]` });
          }
        }
      }
    }
  }

  return errors;
}

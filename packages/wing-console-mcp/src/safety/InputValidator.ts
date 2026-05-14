/**
 * Per-tool JSON Schema runtime validation.
 *
 * Validates tool arguments against their declared inputSchema BEFORE
 * the handler executes. This is a server-side hard enforcement, not a hint.
 *
 * Covers: required fields, type checking, enum validation, numeric ranges.
 * Extends the manual validateArgs() with schema-driven validation.
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

export function validateAgainstSchema(
  schema: JsonSchema | undefined,
  args: Record<string, unknown>,
  toolName: string,
): ValidationError[] {
  const errors: ValidationError[] = [];
  if (!schema || schema.type !== "object" || !schema.properties) return errors;

  // Check required fields
  if (schema.required) {
    for (const field of schema.required) {
      if (args[field] === undefined || args[field] === null) {
        errors.push({ path: field, message: `Required field '${field}' is missing for tool '${toolName}'` });
      }
    }
  }

  // Validate each property
  for (const [key, prop] of Object.entries(schema.properties)) {
    const value = args[key];
    if (value === undefined) continue; // optional field

    // Type validation
    if (prop.type) {
      const actualType = Array.isArray(value) ? "array" : typeof value;
      const expectedType = prop.type;
      let typeOk = actualType === expectedType;
      // JSON Schema "number" accepts both integers and floats
      if (expectedType === "number" && (actualType === "number")) typeOk = true;
      if (expectedType === "integer" && Number.isInteger(value as number)) typeOk = true;

      if (!typeOk) {
        errors.push({
          path: key,
          message: `Field '${key}' should be ${expectedType}, got ${actualType} (${JSON.stringify(value)})`,
        });
        continue;
      }
    }

    // Enum validation
    if (prop.enum && !prop.enum.includes(value as string)) {
      errors.push({
        path: key,
        message: `Field '${key}' must be one of [${prop.enum.join(", ")}], got '${value}'`,
      });
    }

    // Numeric range validation
    if ((prop.type === "number" || prop.type === "integer") && typeof value === "number") {
      if (prop.minimum !== undefined && value < prop.minimum) {
        errors.push({ path: key, message: `Field '${key}' must be >= ${prop.minimum}, got ${value}` });
      }
      if (prop.maximum !== undefined && value > prop.maximum) {
        errors.push({ path: key, message: `Field '${key}' must be <= ${prop.maximum}, got ${value}` });
      }
    }

    // Array items validation
    if (prop.type === "array" && Array.isArray(value) && prop.items) {
      for (let i = 0; i < value.length; i++) {
        const item = value[i];
        if (prop.items.type && typeof item !== prop.items.type) {
          errors.push({
            path: `${key}[${i}]`,
            message: `Array item should be ${prop.items.type}, got ${typeof item}`,
          });
        }
        if (prop.items.enum && !prop.items.enum.includes(item as string)) {
          errors.push({
            path: `${key}[${i}]`,
            message: `Array item must be one of [${prop.items.enum.join(", ")}], got '${item}'`,
          });
        }
      }
    }
  }

  return errors;
}

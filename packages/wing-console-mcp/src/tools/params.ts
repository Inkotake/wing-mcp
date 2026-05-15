import { WingDriver } from "../drivers/WingDriver.js";
import { ToolResult, WingValue } from "../types.js";
import { ChangePlanner } from "../safety/ChangePlanner.js";

export function registerParamTools(driver: WingDriver, changePlanner: ChangePlanner) {
  return {
    wing_param_get: {
      description:
        "Use this to read the current value of a WING parameter by its canonical path (e.g. /ch/1/fader, /main/lr/mute). Risk: none. Read-only.",
      inputSchema: {
        type: "object" as const,
        properties: {
          path: {
            type: "string",
            description: "Canonical WING parameter path (e.g. /ch/1/fader, /main/lr/mute).",
          },
        },
        required: ["path"],
      },
      handler: async (args: { path: string }): Promise<ToolResult> => {
        try {
          const value = await driver.getParam(args.path);
          return {
            ok: true,
            data: value,
            human_summary: `${args.path} = ${formatWingValue(value)}`,
          };
        } catch (e: any) {
          return {
            ok: false,
            errors: [{ code: "PARAM_NOT_FOUND", message: e.message }],
            human_summary: `读取失败：${e.message}`,
          };
        }
      },
    },

    wing_param_set_prepare: {
      description:
        "Use this to prepare a WING parameter write. Returns a confirmation ticket if required by safety policy. Then use wing_param_set_apply with the ticket to apply. Risk: dynamic (medium/critical). Write: prepare/apply/readback/audit.",
      inputSchema: {
        type: "object" as const,
        properties: {
          path: { type: "string", description: "Canonical WING parameter path." },
          value: { type: "object", description: "WING value object with type and value fields." },
          reason: { type: "string", description: "Why this change is being made." },
        },
        required: ["path", "value", "reason"],
      },
      handler: async (args: {
        path: string;
        value: WingValue;
        reason: string;
      }): Promise<ToolResult> => {
        return changePlanner.prepareWrite(
          "wing_param_set_prepare",
          args.path,
          args.value as WingValue,
          args.reason
        );
      },
    },

    wing_param_set_apply: {
      description:
        "Use this to apply a prepared WING parameter write. Requires the confirmationId from wing_param_set_prepare. Risk: dynamic. Write: prepare/apply/readback/audit.",
      inputSchema: {
        type: "object" as const,
        properties: {
          path: { type: "string", description: "Canonical WING parameter path (must match prepare)." },
          value: { type: "object", description: "WING value object (must match prepare)." },
          reason: { type: "string", description: "Why this change is being made." },
          confirmation_id: { type: "string", description: "Confirmation ID from wing_param_set_prepare." },
          confirmation_text: { type: "string", description: "Exact confirmation text from the user." },
        },
        required: ["path", "value", "reason", "confirmation_id"],
      },
      handler: async (args: {
        path: string;
        value: WingValue;
        reason: string;
        confirmation_id: string;
        confirmation_text?: string;
      }): Promise<ToolResult> => {
        return changePlanner.applyWrite(
          "wing_param_set_apply",
          args.path,
          args.value as WingValue,
          args.reason,
          args.confirmation_id, args.confirmation_text
        );
      },
    },
  };
}

function formatWingValue(v: WingValue): string {
  switch (v.type) {
    case "float":
      return v.unit ? `${v.value.toFixed(1)} ${v.unit}` : `${v.value}`;
    case "int":
      return `${v.value}`;
    case "bool":
      return v.value ? "ON" : "OFF";
    case "string":
      return v.value;
    case "node":
      return JSON.stringify(v.value);
  }
}

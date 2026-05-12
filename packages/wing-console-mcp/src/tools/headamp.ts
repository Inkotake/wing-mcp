import { WingDriver } from "../drivers/WingDriver.js";
import { ToolResult, WingValue } from "../types.js";
import { ChangePlanner } from "../safety/ChangePlanner.js";

export function registerHeadampTools(driver: WingDriver, changePlanner: ChangePlanner) {
  return {
    wing_headamp_get: {
      description:
        "Use this to read headamp settings for a local input: gain and phantom power status. Risk: none. Read-only.",
      inputSchema: {
        type: "object" as const,
        properties: {
          input: { type: "number", description: "Local input number (1-48)." },
        },
        required: ["input"],
      },
      handler: async (args: { input: number }): Promise<ToolResult> => {
        try {
          const gain = await driver.getParam(`/headamp/local/${args.input}/gain`);
          const phantom = await driver.getParam(`/headamp/local/${args.input}/phantom`);
          return {
            ok: true,
            data: {
              input: args.input,
              gain: gain.type === "float" ? `${gain.value.toFixed(1)} ${gain.unit ?? "dB"}` : gain,
              phantom: phantom.type === "bool" ? (phantom.value ? "ON (48V)" : "OFF") : phantom,
            },
            human_summary: `Input ${args.input}: Gain ${gain.type === "float" ? gain.value.toFixed(1) + " dB" : "N/A"}, Phantom ${phantom.type === "bool" ? (phantom.value ? "ON" : "OFF") : "N/A"}`,
          };
        } catch (e: any) {
          return {
            ok: false,
            errors: [{ code: "PARAM_NOT_FOUND", message: e.message }],
            human_summary: `读取 headamp 失败：${e.message}`,
          };
        }
      },
    },

    wing_headamp_set_prepare: {
      description:
        "Use this to prepare a headamp gain change. HIGH risk — large gain changes can cause feedback or damage. Risk: high. Write: prepare/apply/readback/audit.",
      inputSchema: {
        type: "object" as const,
        properties: {
          input: { type: "number", description: "Local input number (1-48)." },
          gain_db: { type: "number", description: "Target headamp gain in dB (typically 0-60)." },
          reason: { type: "string", description: "Why this gain change is needed." },
        },
        required: ["input", "gain_db", "reason"],
      },
      handler: async (args: {
        input: number;
        gain_db: number;
        reason: string;
      }): Promise<ToolResult> => {
        const path = `/headamp/local/${args.input}/gain`;
        const newVal: WingValue = { type: "float", value: args.gain_db, unit: "dB" };
        return changePlanner.prepareWrite("wing_headamp_set_prepare", path, newVal, args.reason);
      },
    },

    wing_headamp_set_apply: {
      description:
        "Use this to apply a prepared headamp gain change. HIGH risk. Requires confirmation. Risk: high. Write: prepare/apply/readback/audit.",
      inputSchema: {
        type: "object" as const,
        properties: {
          input: { type: "number", description: "Local input number (must match prepare)." },
          gain_db: { type: "number", description: "Target gain (must match prepare)." },
          reason: { type: "string", description: "Why this gain change is needed." },
          confirmation_id: { type: "string", description: "Confirmation ID from prepare step." },
        },
        required: ["input", "gain_db", "reason", "confirmation_id"],
      },
      handler: async (args: {
        input: number;
        gain_db: number;
        reason: string;
        confirmation_id: string;
      }): Promise<ToolResult> => {
        const path = `/headamp/local/${args.input}/gain`;
        const newVal: WingValue = { type: "float", value: args.gain_db, unit: "dB" };
        return changePlanner.applyWrite(
          "wing_headamp_set_apply",
          path,
          newVal,
          args.reason,
          args.confirmation_id
        );
      },
    },

    wing_phantom_set_prepare: {
      description:
        "Use this to prepare turning phantom power (48V) on/off for a local input. CRITICAL risk — can damage non-phantom equipment. Risk: critical. Write: prepare/apply/readback/audit.",
      inputSchema: {
        type: "object" as const,
        properties: {
          input: { type: "number", description: "Local input number (1-48)." },
          enable: { type: "boolean", description: "True to turn ON 48V phantom power." },
          reason: { type: "string", description: "Why phantom power change is needed. Must acknowledge risk." },
        },
        required: ["input", "enable", "reason"],
      },
      handler: async (args: {
        input: number;
        enable: boolean;
        reason: string;
      }): Promise<ToolResult> => {
        const path = `/headamp/local/${args.input}/phantom`;
        const newVal: WingValue = { type: "bool", value: args.enable };
        return changePlanner.prepareWrite("wing_phantom_set_prepare", path, newVal, args.reason);
      },
    },

    wing_phantom_set_apply: {
      description:
        "Use this to apply a prepared phantom power change. CRITICAL risk. Requires exact confirmation with risk acknowledgment. Risk: critical. Write: prepare/apply/readback/audit.",
      inputSchema: {
        type: "object" as const,
        properties: {
          input: { type: "number", description: "Local input number (must match prepare)." },
          enable: { type: "boolean", description: "True to turn ON 48V (must match prepare)." },
          reason: { type: "string", description: "Why phantom power change is needed." },
          confirmation_id: { type: "string", description: "Confirmation ID from prepare step." },
        },
        required: ["input", "enable", "reason", "confirmation_id"],
      },
      handler: async (args: {
        input: number;
        enable: boolean;
        reason: string;
        confirmation_id: string;
      }): Promise<ToolResult> => {
        const path = `/headamp/local/${args.input}/phantom`;
        const newVal: WingValue = { type: "bool", value: args.enable };
        return changePlanner.applyWrite(
          "wing_phantom_set_apply",
          path,
          newVal,
          args.reason,
          args.confirmation_id
        );
      },
    },
  };
}

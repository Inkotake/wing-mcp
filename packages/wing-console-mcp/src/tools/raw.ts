import { WingDriver } from "../drivers/WingDriver.js";
import { ToolResult, WingValue } from "../types.js";
import { ChangePlanner } from "../safety/ChangePlanner.js";

export function registerRawTools(driver: WingDriver, changePlanner: ChangePlanner) {
  return {
    wing_raw_osc_prepare: {
      description:
        "Use this to prepare a raw OSC command. CRITICAL risk. Disabled by default. Only allowed in developer_raw mode. Risk: critical. Write: prepare/apply/readback/audit.",
      inputSchema: {
        type: "object" as const,
        properties: {
          osc_path: { type: "string", description: "Raw OSC path." },
          osc_value: { type: "object", description: "Raw OSC value." },
          reason: { type: "string", description: "Why a raw OSC command is needed instead of high-level tools." },
        },
        required: ["osc_path", "osc_value", "reason"],
      },
      handler: async (args: {
        osc_path: string;
        osc_value: WingValue;
        reason: string;
      }): Promise<ToolResult> => {
        const path = `/raw/osc${args.osc_path}`;
        return changePlanner.prepareWrite(
          "wing_raw_osc_prepare",
          path,
          args.osc_value as WingValue,
          `[RAW OSC] ${args.reason}`
        );
      },
    },

    wing_raw_osc_apply: {
      description:
        "Use this to apply a prepared raw OSC command. CRITICAL risk. Disabled by default. Risk: critical. Write: prepare/apply/readback/audit.",
      inputSchema: {
        type: "object" as const,
        properties: {
          osc_path: { type: "string", description: "Raw OSC path (must match prepare)." },
          osc_value: { type: "object", description: "Raw OSC value (must match prepare)." },
          reason: { type: "string", description: "Why a raw command is needed." },
          confirmation_id: { type: "string", description: "Confirmation ID from prepare step." },
        },
        required: ["osc_path", "osc_value", "reason", "confirmation_id"],
      },
      handler: async (args: {
        osc_path: string;
        osc_value: WingValue;
        reason: string;
        confirmation_id: string;
        confirmation_text?: string;
      }): Promise<ToolResult> => {
        const path = `/raw/osc${args.osc_path}`;
        return changePlanner.applyWrite(
          "wing_raw_osc_apply",
          path,
          args.osc_value as WingValue,
          `[RAW OSC] ${args.reason}`,
          args.confirmation_id, args.confirmation_text
        );
      },
    },

    wing_raw_native_prepare: {
      description:
        "Use this to prepare a raw Native protocol command. CRITICAL risk. Disabled by default. Risk: critical. Write: prepare/apply/readback/audit.",
      inputSchema: {
        type: "object" as const,
        properties: {
          native_path: { type: "string", description: "Raw Native protocol path." },
          native_value: { type: "object", description: "Raw Native value." },
          reason: { type: "string", description: "Why a raw Native command is needed." },
        },
        required: ["native_path", "native_value", "reason"],
      },
      handler: async (args: {
        native_path: string;
        native_value: WingValue;
        reason: string;
      }): Promise<ToolResult> => {
        const path = `/raw/native${args.native_path}`;
        return changePlanner.prepareWrite(
          "wing_raw_native_prepare",
          path,
          args.native_value as WingValue,
          `[RAW NATIVE] ${args.reason}`
        );
      },
    },

    wing_raw_native_apply: {
      description:
        "Use this to apply a prepared raw Native protocol command. CRITICAL risk. Disabled by default. Risk: critical. Write: prepare/apply/readback/audit.",
      inputSchema: {
        type: "object" as const,
        properties: {
          native_path: { type: "string", description: "Raw Native path (must match prepare)." },
          native_value: { type: "object", description: "Raw Native value (must match prepare)." },
          reason: { type: "string", description: "Why a raw command is needed." },
          confirmation_id: { type: "string", description: "Confirmation ID from prepare step." },
        },
        required: ["native_path", "native_value", "reason", "confirmation_id"],
      },
      handler: async (args: {
        native_path: string;
        native_value: WingValue;
        reason: string;
        confirmation_id: string;
        confirmation_text?: string;
      }): Promise<ToolResult> => {
        const path = `/raw/native${args.native_path}`;
        return changePlanner.applyWrite(
          "wing_raw_native_apply",
          path,
          args.native_value as WingValue,
          `[RAW NATIVE] ${args.reason}`,
          args.confirmation_id, args.confirmation_text
        );
      },
    },
  };
}

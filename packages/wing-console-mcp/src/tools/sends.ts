import { WingDriver } from "../drivers/WingDriver.js";
import { ToolResult, WingValue } from "../types.js";
import { ChangePlanner } from "../safety/ChangePlanner.js";

export function registerSendTools(driver: WingDriver, changePlanner: ChangePlanner) {
  return {
    wing_send_get: {
      description:
        "Use this to read the send level from a channel to a bus (monitor/aux send). Risk: none. Read-only.",
      inputSchema: {
        type: "object" as const,
        properties: {
          channel: { type: "number", description: "Source channel number." },
          bus: { type: "number", description: "Destination bus number (1-16)." },
        },
        required: ["channel", "bus"],
      },
      handler: async (args: { channel: number; bus: number }): Promise<ToolResult> => {
        try {
          const path = `/ch/${args.channel}/send/${args.bus}/level`;
          const value = await driver.getParam(path);
          return {
            ok: true,
            data: value,
            human_summary: `CH ${args.channel} -> Bus ${args.bus} 发送量: ${value.type === "float" ? value.value.toFixed(1) + " " + (value.unit ?? "dB") : JSON.stringify(value)}`,
          };
        } catch (e: any) {
          return {
            ok: false,
            errors: [{ code: "PARAM_NOT_FOUND", message: e.message }],
            human_summary: `读取发送量失败：${e.message}`,
          };
        }
      },
    },

    wing_send_adjust_prepare: {
      description:
        "Use this to prepare adjusting a monitor/aux send level. Risk: medium. Write: prepare/apply/readback/audit.",
      inputSchema: {
        type: "object" as const,
        properties: {
          channel: { type: "number", description: "Source channel number." },
          bus: { type: "number", description: "Destination bus number (1-16)." },
          delta_db: { type: "number", description: "Send level change in dB. Capped at 6dB in rehearsal mode." },
          reason: { type: "string", description: "Why this send adjustment is needed." },
        },
        required: ["channel", "bus", "delta_db", "reason"],
      },
      handler: async (args: {
        channel: number;
        bus: number;
        delta_db: number;
        reason: string;
      }): Promise<ToolResult> => {
        const path = `/ch/${args.channel}/send/${args.bus}/level`;
        try {
          const oldVal = await driver.getParam(path);
          const oldDb = oldVal.type === "float" ? oldVal.value : -99;
          const newVal: WingValue = { type: "float", value: oldDb + args.delta_db, unit: "dB" };
          return changePlanner.prepareWrite("wing_send_adjust_prepare", path, newVal, args.reason);
        } catch (e: any) {
          return {
            ok: false,
            errors: [{ code: "PARAM_NOT_FOUND", message: e.message }],
            human_summary: `准备失败：${e.message}`,
          };
        }
      },
    },

    wing_send_adjust_apply: {
      description:
        "Use this to apply a prepared monitor/aux send adjustment. Requires confirmationId. Risk: medium. Write: prepare/apply/readback/audit.",
      inputSchema: {
        type: "object" as const,
        properties: {
          channel: { type: "number", description: "Source channel (must match prepare)." },
          bus: { type: "number", description: "Destination bus (must match prepare)." },
          delta_db: { type: "number", description: "Send level change (must match prepare)." },
          reason: { type: "string", description: "Why this adjustment is needed." },
          confirmation_id: { type: "string", description: "Confirmation ID from prepare step." },
        },
        required: ["channel", "bus", "delta_db", "reason", "confirmation_id"],
      },
      handler: async (args: {
        channel: number;
        bus: number;
        delta_db: number;
        reason: string;
        confirmation_id: string;
      }): Promise<ToolResult> => {
        const path = `/ch/${args.channel}/send/${args.bus}/level`;
        const oldVal = await driver.getParam(path);
        const oldDb = oldVal.type === "float" ? oldVal.value : -99;
        const newVal: WingValue = { type: "float", value: oldDb + args.delta_db, unit: "dB" };
        return changePlanner.applyWrite(
          "wing_send_adjust_apply",
          path,
          newVal,
          args.reason,
          args.confirmation_id
        );
      },
    },
  };
}

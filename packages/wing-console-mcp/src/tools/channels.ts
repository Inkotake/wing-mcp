import { WingDriver } from "../drivers/WingDriver.js";
import { ToolResult, WingValue } from "../types.js";
import { ChangePlanner } from "../safety/ChangePlanner.js";

export function registerChannelTools(driver: WingDriver, changePlanner: ChangePlanner) {
  return {
    wing_channel_list: {
      description:
        "Use this to list all channels on the WING console with their current names, mute status, and fader levels. Risk: none. Read-only.",
      inputSchema: {
        type: "object" as const,
        properties: {},
      },
      handler: async (): Promise<ToolResult> => {
        try {
          const channels: Array<{ ch: number; name: string; mute: boolean; fader: number }> = [];
          for (let i = 1; i <= 48; i++) {
            try {
              const name = await driver.getParam(`/ch/${i}/name`);
              const mute = await driver.getParam(`/ch/${i}/mute`);
              const fader = await driver.getParam(`/ch/${i}/fader`);
              channels.push({
                ch: i,
                name: name.type === "string" ? name.value : `CH ${i}`,
                mute: mute.type === "bool" ? mute.value : false,
                fader: fader.type === "float" ? fader.value : 0,
              });
            } catch {
              // Channel may not exist — skip
            }
          }
          return {
            ok: true,
            data: channels,
            human_summary: `${channels.length} 个通道：${channels
              .filter((c) => c.name !== `CH ${c.ch}`)
              .map((c) => `${c.name || `CH${c.ch}`}(${c.mute ? "MUTE" : ` ${c.fader.toFixed(1)}dB`})`)
              .join(", ")}`,
          };
        } catch (e: any) {
          return {
            ok: false,
            errors: [{ code: "PROTOCOL_ERROR" as const, message: e.message }],
            human_summary: `获取通道列表失败：${e.message}`,
          };
        }
      },
    },

    wing_channel_get: {
      description:
        "Use this to get full state of a specific channel: name, mute, fader, pan, source, EQ, dynamics, sends. Risk: none. Read-only.",
      inputSchema: {
        type: "object" as const,
        properties: {
          channel: {
            type: "number",
            description: "Channel number (1-48).",
          },
        },
        required: ["channel"],
      },
      handler: async (args: { channel: number }): Promise<ToolResult> => {
        try {
          const node = await driver.getNode(`/ch/${args.channel}`);
          const name = node[`/ch/${args.channel}/name`] as WingValue | undefined;
          const mute = node[`/ch/${args.channel}/mute`] as WingValue | undefined;
          const fader = node[`/ch/${args.channel}/fader`] as WingValue | undefined;
          return {
            ok: true,
            data: {
              channel: args.channel,
              name: name?.type === "string" ? name.value : `CH ${args.channel}`,
              mute: mute?.type === "bool" ? mute.value : false,
              fader: fader?.type === "float" ? fader.value : 0,
              raw: node,
            },
            human_summary: `CH ${args.channel} (${name?.type === "string" ? name.value : "未命名"}): ${mute?.type === "bool" && mute.value ? "MUTE" : `Fader ${fader?.type === "float" ? fader.value.toFixed(1) + " dB" : "N/A"}`}`,
          };
        } catch (e: any) {
          return {
            ok: false,
            errors: [{ code: "PARAM_NOT_FOUND", message: e.message }],
            human_summary: `获取通道 ${args.channel} 失败：${e.message}`,
          };
        }
      },
    },

    wing_channel_adjust_fader_prepare: {
      description:
        "Use this to prepare a channel fader adjustment. Returns confirmation ticket for medium risk. Risk: medium. Write: prepare/apply/readback/audit.",
      inputSchema: {
        type: "object" as const,
        properties: {
          channel: { type: "number", description: "Channel number (1-48)." },
          delta_db: { type: "number", description: "Fader change in dB (positive = louder). Capped at 3dB in rehearsal mode." },
          reason: { type: "string", description: "Why this adjustment is needed." },
        },
        required: ["channel", "delta_db", "reason"],
      },
      handler: async (args: {
        channel: number;
        delta_db: number;
        reason: string;
      }): Promise<ToolResult> => {
        const path = `/ch/${args.channel}/fader`;
        try {
          const oldVal = await driver.getParam(path);
          const oldDb = oldVal.type === "float" ? oldVal.value : 0;
          const newVal: WingValue = { type: "float", value: oldDb + args.delta_db, unit: "dB" };
          return changePlanner.prepareWrite(
            "wing_channel_adjust_fader_prepare",
            path,
            newVal,
            args.reason
          );
        } catch (e: any) {
          return {
            ok: false,
            errors: [{ code: "PARAM_NOT_FOUND", message: e.message }],
            human_summary: `准备失败：${e.message}`,
          };
        }
      },
    },

    wing_channel_adjust_fader_apply: {
      description:
        "Use this to apply a prepared channel fader adjustment. Requires confirmationId. Risk: medium. Write: prepare/apply/readback/audit.",
      inputSchema: {
        type: "object" as const,
        properties: {
          channel: { type: "number", description: "Channel number (must match prepare)." },
          delta_db: { type: "number", description: "Fader change (must match prepare)." },
          reason: { type: "string", description: "Why this adjustment is needed." },
          confirmation_id: { type: "string", description: "Confirmation ID from prepare step." },
          confirmation_text: { type: "string", description: "Exact confirmation text spoken/typed by the user. Required for high/critical risk actions." },
        },
        required: ["channel", "delta_db", "reason", "confirmation_id"],
      },
      handler: async (args: {
        channel: number;
        delta_db: number;
        reason: string;
        confirmation_id: string;
        confirmation_text?: string;
      }): Promise<ToolResult> => {
        const path = `/ch/${args.channel}/fader`;
        const oldVal = await driver.getParam(path);
        const oldDb = oldVal.type === "float" ? oldVal.value : 0;
        const newVal: WingValue = { type: "float", value: oldDb + args.delta_db, unit: "dB" };
        return changePlanner.applyWrite(
          "wing_channel_adjust_fader_apply",
          path,
          newVal,
          args.reason,
          args.confirmation_id,
          args.confirmation_text
        );
      },
    },

    wing_channel_set_mute_prepare: {
      description:
        "Use this to prepare setting a channel mute/unmute. Risk: medium. Write: prepare/apply/readback/audit.",
      inputSchema: {
        type: "object" as const,
        properties: {
          channel: { type: "number", description: "Channel number (1-48)." },
          mute: { type: "boolean", description: "True to mute, false to unmute." },
          reason: { type: "string", description: "Why this mute change is needed." },
        },
        required: ["channel", "mute", "reason"],
      },
      handler: async (args: {
        channel: number;
        mute: boolean;
        reason: string;
      }): Promise<ToolResult> => {
        const path = `/ch/${args.channel}/mute`;
        const newVal: WingValue = { type: "bool", value: args.mute };
        return changePlanner.prepareWrite(
          "wing_channel_set_mute_prepare",
          path,
          newVal,
          args.reason
        );
      },
    },

    wing_channel_set_mute_apply: {
      description:
        "Use this to apply a prepared channel mute change. Requires confirmationId. Risk: medium. Write: prepare/apply/readback/audit.",
      inputSchema: {
        type: "object" as const,
        properties: {
          channel: { type: "number", description: "Channel number (must match prepare)." },
          mute: { type: "boolean", description: "True to mute (must match prepare)." },
          reason: { type: "string", description: "Why this mute change is needed." },
          confirmation_id: { type: "string", description: "Confirmation ID from prepare step." },
          confirmation_text: { type: "string", description: "Exact confirmation text spoken/typed by the user. Required for high/critical risk actions." },
        },
        required: ["channel", "mute", "reason", "confirmation_id"],
      },
      handler: async (args: {
        channel: number;
        mute: boolean;
        reason: string;
        confirmation_id: string;
        confirmation_text?: string;
      }): Promise<ToolResult> => {
        const path = `/ch/${args.channel}/mute`;
        const newVal: WingValue = { type: "bool", value: args.mute };
        return changePlanner.applyWrite(
          "wing_channel_set_mute_apply",
          path,
          newVal,
          args.reason,
          args.confirmation_id,
          args.confirmation_text
        );
      },
    },
  };
}

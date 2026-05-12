import { WingDriver } from "../drivers/WingDriver.js";
import { ToolResult, WingValue } from "../types.js";
import { ChangePlanner } from "../safety/ChangePlanner.js";

/**
 * Group Tools — DCA, Mute Groups, Main LR, Matrix
 *
 * DCA (Digitally Controlled Amplifier): remote control for groups of channels.
 * Mute Groups: mute multiple channels/buses with one button.
 * Main LR: the stereo master output.
 * Matrix: additional output mixes fed from groups/main.
 *
 * Safety:
 * - DCA mute/fader: HIGH risk (affects multiple channels at once)
 * - Mute group toggle: HIGH risk
 * - Main LR mute/fader: HIGH risk (affects entire PA)
 * - Matrix changes: medium/high
 */

export function registerGroupTools(driver: WingDriver, changePlanner: ChangePlanner) {
  return {
    // ── DCA ─────────────────────────────────────────────

    wing_dca_list: {
      description:
        "List all 8 DCA groups with their names, mute status, and fader levels. Risk: none. Read-only.",
      inputSchema: { type: "object" as const, properties: {} },
      handler: async (): Promise<ToolResult> => {
        try {
          const dcas: Array<{ dca: number; name: string; mute: boolean; fader: number }> = [];
          for (let i = 1; i <= 8; i++) {
            try {
              const name = await driver.getParam(`/dca/${i}/name`);
              const mute = await driver.getParam(`/dca/${i}/mute`);
              const fader = await driver.getParam(`/dca/${i}/fader`);
              dcas.push({
                dca: i,
                name: name.type === "string" ? name.value : `DCA ${i}`,
                mute: mute.type === "bool" ? mute.value : false,
                fader: fader.type === "float" ? fader.value : 0,
              });
            } catch { break; }
          }
          return {
            ok: true,
            data: dcas,
            human_summary: `${dcas.length} DCA: ${dcas.map(d => `${d.name}(${d.mute ? "MUTE" : `${d.fader.toFixed(1)}dB`})`).join(", ")}`,
          };
        } catch (e: any) {
          return { ok: false, errors: [{ code: "PROTOCOL_ERROR", message: e.message }], human_summary: `DCA列表获取失败: ${e.message}` };
        }
      },
    },

    wing_dca_get: {
      description: "Get details for a specific DCA group. Risk: none. Read-only.",
      inputSchema: {
        type: "object" as const,
        properties: { dca: { type: "number", description: "DCA number (1-8)." } },
        required: ["dca"],
      },
      handler: async (args: { dca: number }): Promise<ToolResult> => {
        try {
          const node = await driver.getNode(`/dca/${args.dca}`);
          const dca: Record<string, unknown> = {};
          for (const [key, val] of Object.entries(node)) {
            const short = key.split(`/dca/${args.dca}/`)[1] || key;
            if (val.type === "float") dca[short] = { value: val.value, unit: val.unit };
            else dca[short] = val.value;
          }
          return { ok: true, data: { dca: args.dca, ...dca }, human_summary: `DCA ${args.dca}: ${JSON.stringify(dca)}` };
        } catch (e: any) {
          return { ok: false, errors: [{ code: "PARAM_NOT_FOUND", message: e.message }], human_summary: `DCA读取失败: ${e.message}` };
        }
      },
    },

    wing_dca_set_mute_prepare: {
      description:
        "Prepare muting/unmuting a DCA group. HIGH risk — affects all channels assigned to this DCA. Write: prepare/apply/readback/audit.",
      inputSchema: {
        type: "object" as const,
        properties: {
          dca: { type: "number" },
          mute: { type: "boolean", description: "True to mute all channels in this DCA." },
          reason: { type: "string" },
        },
        required: ["dca", "mute", "reason"],
      },
      handler: async (args: { dca: number; mute: boolean; reason: string }): Promise<ToolResult> => {
        const newVal: WingValue = { type: "bool", value: args.mute };
        return changePlanner.prepareWrite("wing_dca_set_mute_prepare", `/dca/${args.dca}/mute`, newVal, args.reason);
      },
    },

    wing_dca_set_mute_apply: {
      description: "Apply a prepared DCA mute change. HIGH risk. Requires confirmation. Write: prepare/apply/readback/audit.",
      inputSchema: {
        type: "object" as const,
        properties: {
          dca: { type: "number" },
          mute: { type: "boolean" },
          reason: { type: "string" },
          confirmation_id: { type: "string" },
        },
        required: ["dca", "mute", "reason", "confirmation_id"],
      },
      handler: async (args: {
        dca: number; mute: boolean; reason: string; confirmation_id: string;
        confirmation_text?: string;
      }): Promise<ToolResult> => {
        const newVal: WingValue = { type: "bool", value: args.mute };
        return changePlanner.applyWrite("wing_dca_set_mute_apply", `/dca/${args.dca}/mute`, newVal, args.reason, args.confirmation_id, args.confirmation_text);
      },
    },

    wing_dca_adjust_fader_prepare: {
      description:
        "Prepare adjusting a DCA fader. HIGH risk — affects all assigned channels. Write: prepare/apply/readback/audit.",
      inputSchema: {
        type: "object" as const,
        properties: {
          dca: { type: "number" },
          delta_db: { type: "number", description: "Fader change in dB." },
          reason: { type: "string" },
        },
        required: ["dca", "delta_db", "reason"],
      },
      handler: async (args: { dca: number; delta_db: number; reason: string }): Promise<ToolResult> => {
        const oldVal = await driver.getParam(`/dca/${args.dca}/fader`);
        const oldDb = oldVal.type === "float" ? oldVal.value : 0;
        const newVal: WingValue = { type: "float", value: oldDb + args.delta_db, unit: "dB" };
        return changePlanner.prepareWrite("wing_dca_adjust_fader_prepare", `/dca/${args.dca}/fader`, newVal, args.reason);
      },
    },

    wing_dca_adjust_fader_apply: {
      description: "Apply a prepared DCA fader change. HIGH risk. Requires confirmation. Write: prepare/apply/readback/audit.",
      inputSchema: {
        type: "object" as const,
        properties: {
          dca: { type: "number" },
          delta_db: { type: "number" },
          reason: { type: "string" },
          confirmation_id: { type: "string" },
        },
        required: ["dca", "delta_db", "reason", "confirmation_id"],
      },
      handler: async (args: {
        dca: number; delta_db: number; reason: string; confirmation_id: string;
        confirmation_text?: string;
      }): Promise<ToolResult> => {
        const oldVal = await driver.getParam(`/dca/${args.dca}/fader`);
        const oldDb = oldVal.type === "float" ? oldVal.value : 0;
        const newVal: WingValue = { type: "float", value: oldDb + args.delta_db, unit: "dB" };
        return changePlanner.applyWrite("wing_dca_adjust_fader_apply", `/dca/${args.dca}/fader`, newVal, args.reason, args.confirmation_id, args.confirmation_text);
      },
    },

    // ── Mute Groups ─────────────────────────────────────

    wing_mute_group_list: {
      description:
        "List all 6 mute groups and their current mute/unmute state. Risk: none. Read-only.",
      inputSchema: { type: "object" as const, properties: {} },
      handler: async (): Promise<ToolResult> => {
        try {
          const groups: Array<{ group: number; muted: boolean }> = [];
          for (let i = 1; i <= 6; i++) {
            try {
              const mute = await driver.getParam(`/mutegroup/${i}/mute`);
              groups.push({ group: i, muted: mute.type === "bool" ? mute.value : false });
            } catch { break; }
          }
          return {
            ok: true,
            data: groups,
            human_summary: `${groups.length} Mute Groups: ${groups.map(g => `${g.group}: ${g.muted ? "MUTED" : "off"}`).join(", ")}`,
          };
        } catch (e: any) {
          return { ok: false, errors: [{ code: "PROTOCOL_ERROR", message: e.message }], human_summary: `Mute Group读取失败: ${e.message}` };
        }
      },
    },

    wing_mute_group_set_prepare: {
      description:
        "Prepare toggling a mute group. HIGH risk — mutes multiple channels/buses at once. Write: prepare/apply/readback/audit.",
      inputSchema: {
        type: "object" as const,
        properties: {
          group: { type: "number", description: "Mute group number (1-6)." },
          mute: { type: "boolean" },
          reason: { type: "string" },
        },
        required: ["group", "mute", "reason"],
      },
      handler: async (args: { group: number; mute: boolean; reason: string }): Promise<ToolResult> => {
        const newVal: WingValue = { type: "bool", value: args.mute };
        return changePlanner.prepareWrite("wing_mute_group_set_prepare", `/mutegroup/${args.group}/mute`, newVal, args.reason);
      },
    },

    wing_mute_group_set_apply: {
      description: "Apply a prepared mute group change. HIGH risk. Requires confirmation. Write: prepare/apply/readback/audit.",
      inputSchema: {
        type: "object" as const,
        properties: {
          group: { type: "number" },
          mute: { type: "boolean" },
          reason: { type: "string" },
          confirmation_id: { type: "string" },
        },
        required: ["group", "mute", "reason", "confirmation_id"],
      },
      handler: async (args: {
        group: number; mute: boolean; reason: string; confirmation_id: string;
        confirmation_text?: string;
      }): Promise<ToolResult> => {
        const newVal: WingValue = { type: "bool", value: args.mute };
        return changePlanner.applyWrite("wing_mute_group_set_apply", `/mutegroup/${args.group}/mute`, newVal, args.reason, args.confirmation_id, args.confirmation_text);
      },
    },

    // ── Main LR ─────────────────────────────────────────

    wing_main_get: {
      description:
        "Read the Main LR master status: mute, fader level, name, and meter if available. This is THE master output — changes affect everything going to the PA. Risk: none. Read-only.",
      inputSchema: { type: "object" as const, properties: {} },
      handler: async (): Promise<ToolResult> => {
        try {
          const mute = await driver.getParam("/main/lr/mute");
          const fader = await driver.getParam("/main/lr/fader");
          const name = await driver.getParam("/main/lr/name");
          return {
            ok: true,
            data: {
              name: name.type === "string" ? name.value : "Main LR",
              mute: mute.type === "bool" ? mute.value : false,
              fader: fader.type === "float" ? fader.value : 0,
            },
            human_summary: `Main LR: ${mute.type === "bool" && mute.value ? "MUTED ⚠️" : `Fader ${fader.type === "float" ? fader.value.toFixed(1) + " dB" : "?"}`}`,
          };
        } catch (e: any) {
          return { ok: false, errors: [{ code: "PROTOCOL_ERROR", message: e.message }], human_summary: `Main LR读取失败: ${e.message}` };
        }
      },
    },

    wing_main_adjust_fader_prepare: {
      description:
        "Prepare adjusting the Main LR fader. HIGH risk — affects the entire PA. Capped at 1.5dB delta in rehearsal mode. Write: prepare/apply/readback/audit.",
      inputSchema: {
        type: "object" as const,
        properties: {
          delta_db: { type: "number", description: "Fader change in dB (positive = louder)." },
          reason: { type: "string" },
        },
        required: ["delta_db", "reason"],
      },
      handler: async (args: { delta_db: number; reason: string }): Promise<ToolResult> => {
        const oldVal = await driver.getParam("/main/lr/fader");
        const oldDb = oldVal.type === "float" ? oldVal.value : 0;
        const newVal: WingValue = { type: "float", value: oldDb + args.delta_db, unit: "dB" };
        return changePlanner.prepareWrite("wing_main_adjust_fader_prepare", "/main/lr/fader", newVal, args.reason);
      },
    },

    wing_main_adjust_fader_apply: {
      description: "Apply a prepared Main LR fader change. HIGH risk. Requires confirmation. Write: prepare/apply/readback/audit.",
      inputSchema: {
        type: "object" as const,
        properties: {
          delta_db: { type: "number" },
          reason: { type: "string" },
          confirmation_id: { type: "string" },
        },
        required: ["delta_db", "reason", "confirmation_id"],
      },
      handler: async (args: {
        delta_db: number; reason: string; confirmation_id: string;
        confirmation_text?: string;
      }): Promise<ToolResult> => {
        const oldVal = await driver.getParam("/main/lr/fader");
        const oldDb = oldVal.type === "float" ? oldVal.value : 0;
        const newVal: WingValue = { type: "float", value: oldDb + args.delta_db, unit: "dB" };
        return changePlanner.applyWrite("wing_main_adjust_fader_apply", "/main/lr/fader", newVal, args.reason, args.confirmation_id, args.confirmation_text);
      },
    },

    wing_main_set_mute_prepare: {
      description:
        "Prepare muting/unmuting the Main LR. HIGH risk — will mute the entire PA system. Write: prepare/apply/readback/audit.",
      inputSchema: {
        type: "object" as const,
        properties: {
          mute: { type: "boolean", description: "True to mute Main LR (silence PA)." },
          reason: { type: "string" },
        },
        required: ["mute", "reason"],
      },
      handler: async (args: { mute: boolean; reason: string }): Promise<ToolResult> => {
        const newVal: WingValue = { type: "bool", value: args.mute };
        return changePlanner.prepareWrite("wing_main_set_mute_prepare", "/main/lr/mute", newVal, args.reason);
      },
    },

    wing_main_set_mute_apply: {
      description: "Apply a prepared Main LR mute change. HIGH risk. Requires exact confirmation. Write: prepare/apply/readback/audit.",
      inputSchema: {
        type: "object" as const,
        properties: {
          mute: { type: "boolean" },
          reason: { type: "string" },
          confirmation_id: { type: "string" },
        },
        required: ["mute", "reason", "confirmation_id"],
      },
      handler: async (args: {
        mute: boolean; reason: string; confirmation_id: string;
        confirmation_text?: string;
      }): Promise<ToolResult> => {
        const newVal: WingValue = { type: "bool", value: args.mute };
        return changePlanner.applyWrite("wing_main_set_mute_apply", "/main/lr/mute", newVal, args.reason, args.confirmation_id, args.confirmation_text);
      },
    },

    // ── Matrix ──────────────────────────────────────────

    wing_matrix_list: {
      description:
        "List all 8 matrix outputs with names, mute, and fader. Matrix mixes are typically used for front fills, delays, recording, and broadcast. Risk: none. Read-only.",
      inputSchema: { type: "object" as const, properties: {} },
      handler: async (): Promise<ToolResult> => {
        try {
          const matrices: Array<{ matrix: number; name: string; mute: boolean; fader: number }> = [];
          for (let i = 1; i <= 8; i++) {
            try {
              const name = await driver.getParam(`/mtx/${i}/name`);
              const mute = await driver.getParam(`/mtx/${i}/mute`);
              const fader = await driver.getParam(`/mtx/${i}/fader`);
              matrices.push({
                matrix: i,
                name: name.type === "string" ? name.value : `Matrix ${i}`,
                mute: mute.type === "bool" ? mute.value : false,
                fader: fader.type === "float" ? fader.value : 0,
              });
            } catch { break; }
          }
          return {
            ok: true,
            data: matrices,
            human_summary: `${matrices.length} Matrix: ${matrices.map(m => `${m.name}(${m.mute ? "MUTE" : `${m.fader.toFixed(1)}dB`})`).join(", ")}`,
          };
        } catch (e: any) {
          return { ok: false, errors: [{ code: "PROTOCOL_ERROR", message: e.message }], human_summary: `Matrix列表获取失败: ${e.message}` };
        }
      },
    },
  };
}

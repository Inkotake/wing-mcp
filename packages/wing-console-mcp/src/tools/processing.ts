import { WingDriver } from "../drivers/WingDriver.js";
import { ToolResult, WingValue } from "../types.js";
import { ChangePlanner } from "../safety/ChangePlanner.js";

/**
 * Processing Tools — EQ, Gate, Compressor, FX
 *
 * These tools provide access to channel and bus processing:
 * - 4-band parametric EQ (high/hi-mid/lo-mid/low)
 * - Noise gate (threshold, range, attack, hold, release)
 * - Compressor (threshold, ratio, attack, release, gain)
 * - FX rack (slot model, parameters, insert/bypass)
 *
 * Safety: EQ gain changes are medium risk (capped at 3dB delta).
 * Gate/compressor that can silence signal are high risk.
 * FX model changes are high risk.
 */

export function registerProcessingTools(driver: WingDriver, changePlanner: ChangePlanner) {
  return {
    // ── EQ ──────────────────────────────────────────────

    wing_eq_get: {
      description:
        "Read all EQ settings for a channel or bus. Returns 4-band EQ: high, hi-mid, lo-mid, low — each with frequency, gain, Q. Also returns the EQ on/off state. Risk: none. Read-only.",
      inputSchema: {
        type: "object" as const,
        properties: {
          target: { type: "string", description: "Canonical path prefix, e.g. 'ch/1' or 'bus/2'." },
        },
        required: ["target"],
      },
      handler: async (args: { target: string }): Promise<ToolResult> => {
        try {
          const target = args.target.startsWith("/") ? args.target.slice(1) : args.target;
          const node = await driver.getNode(`/${target}/eq`);
          const bands: Record<string, unknown> = {};
          for (const [key, val] of Object.entries(node)) {
            const short = key.split("/eq/")[1] || key;
            if (val.type === "float") bands[short] = { value: val.value, unit: val.unit };
            else bands[short] = val.value;
          }

          // Also get EQ on/off
          let eqOn = true;
          try {
            const eqOnVal = await driver.getParam(`/${target}/eq/on`);
            eqOn = eqOnVal.type === "bool" ? eqOnVal.value : true;
          } catch {}

          return {
            ok: true,
            data: { target, eqOn, bands },
            human_summary: `${target} EQ: ${eqOn ? "ON" : "OFF"} — ${Object.entries(bands).map(([k, v]) => `${k}: ${typeof v === "object" && v !== null ? (v as any).value + " " + (v as any).unit : v}`).join(", ")}`,
          };
        } catch (e: any) {
          return { ok: false, errors: [{ code: "PARAM_NOT_FOUND", message: e.message }], human_summary: `读取EQ失败: ${e.message}` };
        }
      },
    },

    wing_eq_set_band_prepare: {
      description:
        "Prepare an EQ band adjustment. Medium risk for gain changes (capped at 3dB in rehearsal). High risk for large Q or frequency shifts. Write: prepare/apply/readback/audit.",
      inputSchema: {
        type: "object" as const,
        properties: {
          target: { type: "string", description: "Target: 'ch/{n}' or 'bus/{n}'." },
          band: { type: "string", enum: ["high", "hi_mid", "lo_mid", "low"], description: "Which EQ band." },
          parameter: { type: "string", enum: ["gain", "freq", "q"], description: "Which parameter to change." },
          value: { type: "number", description: "New value. gain in dB (-15 to +15), freq in Hz, q (0.1 to 10)." },
          reason: { type: "string", description: "Why this EQ change is needed." },
        },
        required: ["target", "band", "parameter", "value", "reason"],
      },
      handler: async (args: {
        target: string; band: string; parameter: string; value: number; reason: string;
      }): Promise<ToolResult> => {
        const path = `/${args.target}/eq/${args.band}/${args.parameter}`;
        const unit = args.parameter === "gain" ? "dB" : args.parameter === "freq" ? "Hz" : "";
        const newVal: WingValue = unit ? { type: "float", value: args.value, unit } : { type: "float", value: args.value };
        return changePlanner.prepareWrite("wing_eq_set_band_prepare", path, newVal, args.reason);
      },
    },

    wing_eq_set_band_apply: {
      description:
        "Apply a prepared EQ band adjustment. Requires confirmation. Write: prepare/apply/readback/audit.",
      inputSchema: {
        type: "object" as const,
        properties: {
          target: { type: "string" },
          band: { type: "string", enum: ["high", "hi_mid", "lo_mid", "low"] },
          parameter: { type: "string", enum: ["gain", "freq", "q"] },
          value: { type: "number" },
          reason: { type: "string" },
          confirmation_id: { type: "string" },
          confirmation_text: { type: "string", description: "Exact confirmation text from the user." },
        },
        required: ["target", "band", "parameter", "value", "reason", "confirmation_id"],
      },
      handler: async (args: {
        target: string; band: string; parameter: string; value: number; reason: string; confirmation_id: string;
        confirmation_text?: string;
      }): Promise<ToolResult> => {
        const path = `/${args.target}/eq/${args.band}/${args.parameter}`;
        const unit = args.parameter === "gain" ? "dB" : args.parameter === "freq" ? "Hz" : "";
        const newVal: WingValue = unit ? { type: "float", value: args.value, unit } : { type: "float", value: args.value };
        return changePlanner.applyWrite("wing_eq_set_band_apply", path, newVal, args.reason, args.confirmation_id, args.confirmation_text);
      },
    },

    // ── Gate ────────────────────────────────────────────

    wing_gate_get: {
      description:
        "Read noise gate settings for a channel. Returns threshold, range, attack, hold, release, and gate on/off. Important for no-sound diagnosis: if gate is clamping, it can completely silence a channel. Risk: none. Read-only.",
      inputSchema: {
        type: "object" as const,
        properties: {
          channel: { type: "number", description: "Channel number." },
        },
        required: ["channel"],
      },
      handler: async (args: { channel: number }): Promise<ToolResult> => {
        try {
          const node = await driver.getNode(`/ch/${args.channel}/gate`);
          const gate: Record<string, unknown> = {};
          for (const [key, val] of Object.entries(node)) {
            const short = key.split("/gate/")[1] || key;
            if (val.type === "float") gate[short] = { value: val.value, unit: val.unit };
            else gate[short] = val.value;
          }
          return {
            ok: true,
            data: { channel: args.channel, gate },
            human_summary: `CH ${args.channel} Gate: ${JSON.stringify(gate)}`,
          };
        } catch (e: any) {
          return { ok: false, errors: [{ code: "PARAM_NOT_FOUND", message: e.message }], human_summary: `读取Gate失败: ${e.message}` };
        }
      },
    },

    wing_gate_set_prepare: {
      description:
        "Prepare a gate parameter change. HIGH risk — changing gate threshold can silence a channel. Use with caution during no-sound diagnosis. Write: prepare/apply/readback/audit.",
      inputSchema: {
        type: "object" as const,
        properties: {
          channel: { type: "number" },
          parameter: { type: "string", enum: ["threshold", "range", "attack", "hold", "release"], description: "Gate parameter." },
          value: { type: "number", description: "New value in dB (threshold/range) or ms (attack/hold/release)." },
          reason: { type: "string", description: "Why this gate change is needed." },
        },
        required: ["channel", "parameter", "value", "reason"],
      },
      handler: async (args: {
        channel: number; parameter: string; value: number; reason: string;
      }): Promise<ToolResult> => {
        const path = `/ch/${args.channel}/gate/${args.parameter}`;
        const unit = ["threshold", "range"].includes(args.parameter) ? "dB" : "ms";
        const newVal: WingValue = { type: "float", value: args.value, unit };
        return changePlanner.prepareWrite("wing_gate_set_prepare", path, newVal, args.reason);
      },
    },

    wing_gate_set_apply: {
      description: "Apply a prepared gate change. HIGH risk. Requires confirmation. Write: prepare/apply/readback/audit.",
      inputSchema: {
        type: "object" as const,
        properties: {
          channel: { type: "number" },
          parameter: { type: "string", enum: ["threshold", "range", "attack", "hold", "release"] },
          value: { type: "number" },
          reason: { type: "string" },
          confirmation_id: { type: "string" },
          confirmation_text: { type: "string", description: "Exact confirmation text from the user." },
        },
        required: ["channel", "parameter", "value", "reason", "confirmation_id"],
      },
      handler: async (args: {
        channel: number; parameter: string; value: number; reason: string; confirmation_id: string;
        confirmation_text?: string;
      }): Promise<ToolResult> => {
        const path = `/ch/${args.channel}/gate/${args.parameter}`;
        const unit = ["threshold", "range"].includes(args.parameter) ? "dB" : "ms";
        const newVal: WingValue = { type: "float", value: args.value, unit };
        return changePlanner.applyWrite("wing_gate_set_apply", path, newVal, args.reason, args.confirmation_id, args.confirmation_text);
      },
    },

    // ── Compressor ──────────────────────────────────────

    wing_comp_get: {
      description:
        "Read compressor settings for a channel or bus. Returns threshold, ratio, attack, release, gain, and comp on/off. Risk: none. Read-only.",
      inputSchema: {
        type: "object" as const,
        properties: {
          target: { type: "string", description: "Target: 'ch/{n}' or 'bus/{n}'." },
        },
        required: ["target"],
      },
      handler: async (args: { target: string }): Promise<ToolResult> => {
        try {
          const node = await driver.getNode(`/${args.target}/comp`);
          const comp: Record<string, unknown> = {};
          for (const [key, val] of Object.entries(node)) {
            const short = key.split("/comp/")[1] || key;
            if (val.type === "float") comp[short] = { value: val.value, unit: val.unit };
            else comp[short] = val.value;
          }
          return {
            ok: true,
            data: { target: args.target, comp },
            human_summary: `${args.target} Compressor: ${JSON.stringify(comp)}`,
          };
        } catch (e: any) {
          return { ok: false, errors: [{ code: "PARAM_NOT_FOUND", message: e.message }], human_summary: `读取Comp失败: ${e.message}` };
        }
      },
    },

    wing_comp_set_prepare: {
      description:
        "Prepare a compressor parameter change. Medium/high risk depending on parameter. Write: prepare/apply/readback/audit.",
      inputSchema: {
        type: "object" as const,
        properties: {
          target: { type: "string", description: "Target: 'ch/{n}' or 'bus/{n}'." },
          parameter: { type: "string", enum: ["threshold", "ratio", "attack", "release", "gain"], description: "Compressor parameter." },
          value: { type: "number" },
          reason: { type: "string" },
        },
        required: ["target", "parameter", "value", "reason"],
      },
      handler: async (args: {
        target: string; parameter: string; value: number; reason: string;
      }): Promise<ToolResult> => {
        const path = `/${args.target}/comp/${args.parameter}`;
        const unit = args.parameter === "threshold" ? "dB" : args.parameter === "ratio" ? ":1" : args.parameter === "gain" ? "dB" : "ms";
        const newVal: WingValue = { type: "float", value: args.value, unit };
        return changePlanner.prepareWrite("wing_comp_set_prepare", path, newVal, args.reason);
      },
    },

    wing_comp_set_apply: {
      description: "Apply a prepared compressor change. Requires confirmation. Write: prepare/apply/readback/audit.",
      inputSchema: {
        type: "object" as const,
        properties: {
          target: { type: "string" },
          parameter: { type: "string", enum: ["threshold", "ratio", "attack", "release", "gain"] },
          value: { type: "number" },
          reason: { type: "string" },
          confirmation_id: { type: "string" },
          confirmation_text: { type: "string", description: "Exact confirmation text from the user." },
        },
        required: ["target", "parameter", "value", "reason", "confirmation_id"],
      },
      handler: async (args: {
        target: string; parameter: string; value: number; reason: string; confirmation_id: string;
        confirmation_text?: string;
      }): Promise<ToolResult> => {
        const path = `/${args.target}/comp/${args.parameter}`;
        const unit = args.parameter === "threshold" ? "dB" : args.parameter === "ratio" ? ":1" : args.parameter === "gain" ? "dB" : "ms";
        const newVal: WingValue = { type: "float", value: args.value, unit };
        return changePlanner.applyWrite("wing_comp_set_apply", path, newVal, args.reason, args.confirmation_id, args.confirmation_text);
      },
    },

    // ── FX ──────────────────────────────────────────────

    wing_fx_slot_list: {
      description:
        "List all FX slots and their current models. WING has 8 premium FX slots (1-4) and 8 standard FX slots (5-8), plus 16 insert slots. Risk: none. Read-only.",
      inputSchema: { type: "object" as const, properties: {} },
      handler: async (): Promise<ToolResult> => {
        try {
          const slots: Array<{ slot: number; model: string; inserted: boolean }> = [];
          for (let i = 1; i <= 8; i++) {
            try {
              const node = await driver.getNode(`/fx/${i}`);
              const modelVal = node[`/fx/${i}/model`];
              slots.push({
                slot: i,
                model: modelVal?.type === "string" ? modelVal.value : "Unknown",
                inserted: false,
              });
            } catch { continue; }
          }
          return {
            ok: true,
            data: slots,
            human_summary: `${slots.length} FX 槽位: ${slots.map(s => `${s.slot}: ${s.model}`).join(", ")}`,
          };
        } catch (e: any) {
          return { ok: false, errors: [{ code: "PROTOCOL_ERROR", message: e.message }], human_summary: `读取FX列表失败: ${e.message}` };
        }
      },
    },

    wing_fx_slot_get: {
      description: "Get detailed info about a specific FX slot. Risk: none. Read-only.",
      inputSchema: {
        type: "object" as const,
        properties: { slot: { type: "number", description: "FX slot number (1-8)." } },
        required: ["slot"],
      },
      handler: async (args: { slot: number }): Promise<ToolResult> => {
        try {
          const node = await driver.getNode(`/fx/${args.slot}`);
          const fx: Record<string, unknown> = {};
          for (const [key, val] of Object.entries(node)) {
            const short = key.split(`/fx/${args.slot}/`)[1] || key;
            if (val.type === "float") fx[short] = { value: val.value, unit: val.unit };
            else fx[short] = val.value;
          }
          return {
            ok: true,
            data: { slot: args.slot, ...fx },
            human_summary: `FX ${args.slot}: ${fx.model ?? "Unknown"}`,
          };
        } catch (e: any) {
          return { ok: false, errors: [{ code: "PARAM_NOT_FOUND", message: e.message }], human_summary: `读取FX失败: ${e.message}` };
        }
      },
    },

    wing_fx_slot_set_model_prepare: {
      description:
        "Prepare changing an FX slot model. HIGH risk — changes effect type and audio character. Write: prepare/apply/readback/audit.",
      inputSchema: {
        type: "object" as const,
        properties: {
          slot: { type: "number" },
          model: { type: "string", description: "FX model name (e.g. 'Hall Reverb', 'Stereo Delay', 'Vintage Compressor')." },
          reason: { type: "string" },
        },
        required: ["slot", "model", "reason"],
      },
      handler: async (args: { slot: number; model: string; reason: string }): Promise<ToolResult> => {
        const path = `/fx/${args.slot}/model`;
        const newVal: WingValue = { type: "string", value: args.model };
        return changePlanner.prepareWrite("wing_fx_slot_set_model_prepare", path, newVal, args.reason);
      },
    },

    wing_fx_slot_set_model_apply: {
      description: "Apply a prepared FX model change. HIGH risk. Requires confirmation. Write: prepare/apply/readback/audit.",
      inputSchema: {
        type: "object" as const,
        properties: {
          slot: { type: "number" },
          model: { type: "string" },
          reason: { type: "string" },
          confirmation_id: { type: "string" },
          confirmation_text: { type: "string", description: "Exact confirmation text from the user." },
        },
        required: ["slot", "model", "reason", "confirmation_id"],
      },
      handler: async (args: {
        slot: number; model: string; reason: string; confirmation_id: string;
        confirmation_text?: string;
      }): Promise<ToolResult> => {
        const path = `/fx/${args.slot}/model`;
        const newVal: WingValue = { type: "string", value: args.model };
        return changePlanner.applyWrite("wing_fx_slot_set_model_apply", path, newVal, args.reason, args.confirmation_id, args.confirmation_text);
      },
    },
  };
}

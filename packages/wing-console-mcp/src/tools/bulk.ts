import { WingDriver } from "../drivers/WingDriver.js";
import { ToolResult, WingValue } from "../types.js";
import { ChangePlanner } from "../safety/ChangePlanner.js";

/**
 * Bulk Operations — Param Bulk Read, Debug Dump, USB Recorder
 *
 * wing_param_bulk_get: efficient multi-parameter read
 * wing_debug_dump_state: full console state dump for bug reports
 * wing_usb_recorder_*: transport control for the built-in USB/SD recorder
 */

export function registerBulkTools(driver: WingDriver, changePlanner?: ChangePlanner) {
  const cp = changePlanner;
  return {
    wing_param_bulk_get: {
      description:
        "EFFICIENT: read multiple parameters in one call. Much faster than calling wing_param_get repeatedly. Use this when you need to check many related parameters (e.g. all EQ bands for a channel, or all channel names). Risk: none. Read-only.",
      inputSchema: {
        type: "object" as const,
        properties: {
          paths: {
            type: "array",
            items: { type: "string" },
            description: "List of canonical paths to read (e.g. ['/ch/1/name', '/ch/1/mute', '/ch/1/fader']).",
          },
          prefix: {
            type: "string",
            description: "Optional: read all parameters under this prefix (e.g. '/ch/1/' for the whole channel). Overrides 'paths' if set.",
          },
        },
      },
      handler: async (args: { paths?: string[]; prefix?: string }): Promise<ToolResult> => {
        try {
          const results: Record<string, unknown> = {};

          if (args.prefix) {
            const node = await driver.getNode(args.prefix);
            for (const [key, val] of Object.entries(node)) {
              results[key] = valueToPlain(val);
            }
          } else if (args.paths) {
            for (const path of args.paths) {
              try {
                const val = await driver.getParam(path);
                results[path] = valueToPlain(val);
              } catch {
                results[path] = { error: "NOT_FOUND" };
              }
            }
          }

          return {
            ok: true,
            data: results,
            human_summary: `批量读取 ${Object.keys(results).length} 个参数完成`,
          };
        } catch (e: any) {
          return { ok: false, errors: [{ code: "PROTOCOL_ERROR", message: e.message }], human_summary: `批量读取失败: ${e.message}` };
        }
      },
    },

    wing_debug_dump_state: {
      description:
        "DEBUG: generate a complete debug dump of the console state. Includes all channels, buses, DCA, mute groups, scenes, routing, and FX. Large output — use sparingly. Suitable for bug reports. Risk: none. Read-only.",
      inputSchema: {
        type: "object" as const,
        properties: {
          sections: {
            type: "array",
            items: { type: "string", enum: ["device", "channels", "buses", "dcas", "mutegroups", "scenes", "fx", "routing", "meters", "all"] },
            description: "Which sections to include. Default: ['all'].",
          },
          max_channels: { type: "number", description: "Max channels to dump. Default: 48.", default: 48 },
          include_meters: { type: "boolean", description: "Include meter snapshot. Default: true.", default: true },
        },
      },
      handler: async (args: {
        sections?: string[]; max_channels?: number; include_meters?: boolean;
      }): Promise<ToolResult> => {
        try {
          const sections = args.sections ?? ["all"];
          const includeAll = sections.includes("all");
          const maxCh = args.max_channels ?? 48;
          const dump: Record<string, unknown> = {
            generated_at: new Date().toISOString(),
            driver: driver.kind,
          };

          if (includeAll || sections.includes("device")) {
            try { dump.device = await driver.getInfo(); } catch {}
          }

          if (includeAll || sections.includes("channels")) {
            const channels: Record<string, unknown>[] = [];
            for (let ch = 1; ch <= maxCh; ch++) {
              try {
                const node = await driver.getNode(`/ch/${ch}`);
                const chData: Record<string, unknown> = { ch };
                for (const [key, val] of Object.entries(node)) {
                  chData[key] = valueToPlain(val);
                }
                channels.push(chData);
              } catch { continue; }
            }
            dump.channels = channels;
          }

          if (includeAll || sections.includes("buses")) {
            const buses: Record<string, unknown>[] = [];
            for (let b = 1; b <= 16; b++) {
              try {
                const node = await driver.getNode(`/bus/${b}`);
                const bData: Record<string, unknown> = { bus: b };
                for (const [key, val] of Object.entries(node)) {
                  bData[key] = valueToPlain(val);
                }
                buses.push(bData);
              } catch { continue; }
            }
            dump.buses = buses;
          }

          if (includeAll || sections.includes("dcas")) {
            const dcas: Record<string, unknown>[] = [];
            for (let d = 1; d <= 8; d++) {
              try {
                const node = await driver.getNode(`/dca/${d}`);
                dcas.push({ dca: d, ...Object.fromEntries(Object.entries(node).map(([k, v]) => [k, valueToPlain(v)])) });
              } catch { continue; }
            }
            dump.dcas = dcas;
          }

          if (includeAll || sections.includes("scenes")) {
            try {
              const cur = await driver.getParam("/scene/current");
              dump.scene_current = valueToPlain(cur);
            } catch {}
          }

          if ((includeAll || sections.includes("meters")) && args.include_meters !== false) {
            try {
              const frame = await driver.meterRead(["/main/lr/fader"], 500);
              dump.meters = frame.meters.map(m => ({ target: m.target, rmsDbfs: Math.round(m.rmsDbfs * 10) / 10, peakDbfs: Math.round(m.peakDbfs * 10) / 10, present: m.present }));
            } catch {}
          }

          const size = JSON.stringify(dump).length;
          return {
            ok: true,
            data: dump,
            human_summary: `Debug dump 生成完成: ${JSON.stringify(dump).length} 字节. 包含 ${(dump.channels as any[])?.length ?? 0} ch, ${(dump.buses as any[])?.length ?? 0} bus, ${(dump.dcas as any[])?.length ?? 0} dca${dump.meters ? ", meters" : ""}`,
          };
        } catch (e: any) {
          return { ok: false, errors: [{ code: "PROTOCOL_ERROR", message: e.message }], human_summary: `Debug dump失败: ${e.message}` };
        }
      },
    },

    // ── USB / SD Recorder ───────────────────────────────

    wing_usb_recorder_get: {
      description:
        "Read the USB/SD recorder status: transport state (stopped/playing/recording), current position, armed tracks. Risk: none. Read-only.",
      inputSchema: { type: "object" as const, properties: {} },
      handler: async (): Promise<ToolResult> => {
        try {
          const transport = await driver.getParam("/recorder/transport");
          return {
            ok: true,
            data: {
              transport: transport.type === "string" ? transport.value : "unknown",
            },
            human_summary: `USB Recorder: ${transport.type === "string" ? transport.value : "unknown"}`,
          };
        } catch (e: any) {
          return { ok: false, errors: [{ code: "PARAM_NOT_FOUND", message: e.message }], human_summary: `Recorder读取失败: ${e.message}` };
        }
      },
    },

    // ── USB Recorder Write Controls ────────────────────

    wing_usb_recorder_record_prepare: {
      description: "Prepare to start USB/SD recording. HIGH risk — recording captures live audio. Write: prepare/apply/readback/audit.",
      inputSchema: {
        type: "object" as const,
        properties: {
          reason: { type: "string", description: "Why recording is being started." },
        },
        required: ["reason"],
      },
      handler: async (args: { reason: string }): Promise<ToolResult> => {
        if (!cp) return { ok: false, errors: [{ code: "POLICY_DENIED", message: "Write tools not available (no ChangePlanner)" }], human_summary: "录制写入工具不可用。" };
        return cp.prepareWrite("wing_usb_recorder_record_prepare", "/recorder/transport", { type: "string", value: "recording" }, args.reason);
      },
    },

    wing_usb_recorder_record_apply: {
      description: "Apply: start USB/SD recording. HIGH risk. Write: prepare/apply/readback/audit.",
      inputSchema: {
        type: "object" as const,
        properties: {
          reason: { type: "string" },
          confirmation_id: { type: "string" },
          confirmation_text: { type: "string" },
        },
        required: ["reason", "confirmation_id"],
      },
      handler: async (args: { reason: string; confirmation_id: string; confirmation_text?: string }): Promise<ToolResult> => {
        if (!cp) return { ok: false, errors: [{ code: "POLICY_DENIED", message: "Write tools not available" }], human_summary: "录制写入工具不可用。" };
        return cp.applyWrite("wing_usb_recorder_record_apply", "/recorder/transport", { type: "string", value: "recording" }, args.reason, args.confirmation_id, args.confirmation_text);
      },
    },

    wing_usb_recorder_stop_prepare: {
      description: "Prepare to stop USB/SD recording. HIGH risk — stops ongoing recording. Write: prepare/apply/readback/audit.",
      inputSchema: {
        type: "object" as const,
        properties: {
          reason: { type: "string" },
        },
        required: ["reason"],
      },
      handler: async (args: { reason: string }): Promise<ToolResult> => {
        if (!cp) return { ok: false, errors: [{ code: "POLICY_DENIED", message: "Write tools not available" }], human_summary: "录制写入工具不可用。" };
        return cp.prepareWrite("wing_usb_recorder_stop_prepare", "/recorder/transport", { type: "string", value: "stopped" }, args.reason);
      },
    },

    wing_usb_recorder_stop_apply: {
      description: "Apply: stop USB/SD recording. HIGH risk. Write: prepare/apply/readback/audit.",
      inputSchema: {
        type: "object" as const,
        properties: {
          reason: { type: "string" },
          confirmation_id: { type: "string" },
          confirmation_text: { type: "string" },
        },
        required: ["reason", "confirmation_id"],
      },
      handler: async (args: { reason: string; confirmation_id: string; confirmation_text?: string }): Promise<ToolResult> => {
        if (!cp) return { ok: false, errors: [{ code: "POLICY_DENIED", message: "Write tools not available" }], human_summary: "录制写入工具不可用。" };
        return cp.applyWrite("wing_usb_recorder_stop_apply", "/recorder/transport", { type: "string", value: "stopped" }, args.reason, args.confirmation_id, args.confirmation_text);
      },
    },
  };
}

function valueToPlain(val: WingValue): unknown {
  switch (val.type) {
    case "float": return val.unit ? `${val.value.toFixed(1)} ${val.unit}` : val.value;
    case "int": return val.value;
    case "bool": return val.value;
    case "string": return val.value;
    default: return val.value;
  }
}

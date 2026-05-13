import { WingDriver } from "../drivers/WingDriver.js";
import { ToolResult, WingValue, SuggestedAction } from "../types.js";

/**
 * Multi-Level View Tools
 *
 * These tools provide AI with different detail levels for consuming WING state:
 * - quick_check: "any problems?" — 1-line verdict with toggles
 * - summary: "what's going on?" — overview of channels, buses, meters
 * - snapshot: "give me everything" — full state dump
 * - focus: "tell me about CH X" — deep dive on one target
 *
 * Design principle: AI should never have to guess how to read the mixer.
 * Each level provides exactly the right amount of detail for the task.
 */

export function registerViewTools(driver: WingDriver) {
  return {
    wing_quick_check: {
      description:
        "FAST overview: run this FIRST to see if there are any obvious issues. Returns a compact health report: connection status, muted channels, clipped inputs, silent channels. Use when you need a quick 'is everything OK?' answer. Risk: none. Read-only. Output: compact health record.",
      inputSchema: {
        type: "object" as const,
        properties: {
          include_meters: { type: "boolean", description: "Also do a quick meter sweep. Default: false (faster).", default: false },
        },
      },
      handler: async (args: { include_meters?: boolean }): Promise<ToolResult> => {
        try {
          const info = await driver.getInfo();
          const issues: string[] = [];
          const ok: string[] = [];

          // Check channels quickly
          let mutedChannels: number[] = [];
          let lowFaderChannels: number[] = [];
          let clippingChannels: number[] = [];

          for (let ch = 1; ch <= 48; ch++) {
            try {
              const mute = await driver.getParam(`/ch/${ch}/mute`);
              if (mute.type === "bool" && mute.value) {
                mutedChannels.push(ch);
              }
              const fader = await driver.getParam(`/ch/${ch}/fader`);
              if (fader.type === "float" && fader.value < -60) {
                lowFaderChannels.push(ch);
              }
            } catch { continue; }
          }

          if (mutedChannels.length > 0) {
            issues.push(`${mutedChannels.length} 个通道静音: CH ${mutedChannels.slice(0, 5).join(",")}${mutedChannels.length > 5 ? "..." : ""}`);
          } else {
            ok.push("所有活跃通道未静音");
          }

          if (lowFaderChannels.length > 5) {
            issues.push(`${lowFaderChannels.length} 个通道推子极低 (< -60dB)`);
          }

          // Quick meter sweep if requested — check Main LR + first 8 channels
          if (args.include_meters) {
            try {
              const meterTargets = ["/main/lr/fader", ...Array.from({length: Math.min(8, mutedChannels.length + 4)}, (_, i) => `/ch/${i + 1}/fader`)];
              const meters = await driver.meterRead(meterTargets, 500);
              const mainMeter = meters.meters[0];
              if (mainMeter && !mainMeter.present) {
                issues.push("Main LR 无信号");
              } else if (mainMeter) {
                ok.push(`Main LR 有信号 (${mainMeter.rmsDbfs.toFixed(1)} dBFS)`);
              }
            } catch {}
          }

          return {
            ok: true,
            data: {
              device: `${info.name} (${info.model})`,
              connected: true,
              issues,
              ok,
              verdict: issues.length === 0 ? "healthy" : "needs_attention",
            },
            human_summary: issues.length === 0
              ? "✅ 快速检查通过 — 未发现明显问题。" + (ok.length ? ` ${ok.join("; ")}` : "")
              : `⚠️ 发现 ${issues.length} 个问题: ${issues.join("; ")}`,
            next_actions: issues.length > 0
              ? [{ tool: "wing_state_summary", description: "获取完整概览以深入诊断" }]
              : undefined,
          };
        } catch (e: any) {
          return {
            ok: false,
            errors: [{ code: "DEVICE_DISCONNECTED", message: e.message }],
            human_summary: `快速检查失败: ${e.message}`,
          };
        }
      },
    },

    wing_state_summary: {
      description:
        "MEDIUM detail: get a structured overview of the entire mixer state. Returns channel list with names/mutes/faders, bus status, main LR, and any anomalies. THE go-to tool for understanding 'what's happening on the console right now'. Output is organized by section with semantic grouping. Risk: none. Read-only.",
      inputSchema: {
        type: "object" as const,
        properties: {
          detail_level: {
            type: "string",
            enum: ["compact", "normal", "extended"],
            description: "How much detail to return. 'compact' = only anomalies and named channels. 'normal' = all active channels. 'extended' = full dump including EQ/dynamics summary.",
            default: "normal",
          },
          sections: {
            type: "array",
            items: { type: "string", enum: ["channels", "buses", "main", "headamps", "dcas", "scenes", "meters", "all"] },
            description: "Which sections to include. Default: ['all'].",
          },
        },
      },
      handler: async (args: {
        detail_level?: "compact" | "normal" | "extended";
        sections?: string[];
      }): Promise<ToolResult> => {
        try {
          const level = args.detail_level ?? "normal";
          const sections = args.sections ?? ["all"];
          const includeAll = sections.includes("all");
          const info = await driver.getInfo();

          const result: Record<string, unknown> = {
            device: { name: info.name, model: info.model, firmware: info.firmware },
            driver: driver.kind,
          };

          // Channels section
          if (includeAll || sections.includes("channels")) {
            const channels: Array<Record<string, unknown>> = [];
            for (let ch = 1; ch <= 48; ch++) {
              try {
                const name = await driver.getParam(`/ch/${ch}/name`);
                const mute = await driver.getParam(`/ch/${ch}/mute`);
                const fader = await driver.getParam(`/ch/${ch}/fader`);
                const hasName = name.type === "string" && name.value !== `CH ${ch}` && name.value !== "";
                const isMuted = mute.type === "bool" && mute.value;
                const faderDb = fader.type === "float" ? fader.value : 0;

                if (level === "compact" && !hasName && !isMuted && faderDb > -70) continue;

                const chData: Record<string, unknown> = {
                  ch,
                  name: name.type === "string" ? name.value : `CH${ch}`,
                  mute: isMuted,
                  fader: faderDb,
                };

                if (level === "extended") {
                  try {
                    const source = await driver.getParam(`/ch/${ch}/source`);
                    chData.source = source.type === "string" ? source.value : "unknown";
                    const highGain = await driver.getParam(`/ch/${ch}/eq/high/gain`);
                    const lowGain = await driver.getParam(`/ch/${ch}/eq/low/gain`);
                    chData.eqHigh = highGain.type === "float" ? highGain.value : 0;
                    chData.eqLow = lowGain.type === "float" ? lowGain.value : 0;
                  } catch {}
                }

                channels.push(chData);
              } catch { continue; }
            }
            result.channels = channels;
          }

          // Buses section
          if (includeAll || sections.includes("buses")) {
            const buses: Array<Record<string, unknown>> = [];
            for (let b = 1; b <= 16; b++) {
              try {
                const name = await driver.getParam(`/bus/${b}/name`);
                const mute = await driver.getParam(`/bus/${b}/mute`);
                const fader = await driver.getParam(`/bus/${b}/fader`);
                buses.push({
                  bus: b,
                  name: name.type === "string" ? name.value : `Bus ${b}`,
                  mute: mute.type === "bool" ? mute.value : false,
                  fader: fader.type === "float" ? fader.value : 0,
                });
              } catch { continue; }
            }
            result.buses = buses;
          }

          // Main LR
          if (includeAll || sections.includes("main")) {
            try {
              const mainMute = await driver.getParam("/main/lr/mute");
              const mainFader = await driver.getParam("/main/lr/fader");
              result.main = {
                mute: mainMute.type === "bool" ? mainMute.value : false,
                fader: mainFader.type === "float" ? mainFader.value : 0,
              };
            } catch {}
          }

          // Scenes
          if (includeAll || sections.includes("scenes")) {
            try {
              const scene = await driver.getParam("/scene/current");
              result.scene = { current: scene.type === "int" ? scene.value : -1 };
            } catch {}
          }

          // Count anomalies for human summary
          const chData = result.channels as Array<Record<string, unknown>> | undefined;
          const busData = result.buses as Array<Record<string, unknown>> | undefined;
          const mutedChs = chData?.filter(c => c.mute === true).length ?? 0;
          const namedChs = chData?.filter(c => c.name && !/^CH\d+$/.test(c.name as string)).length ?? 0;

          return {
            ok: true,
            data: result,
            human_summary: `${info.name} — ${chData?.length ?? 0} 通道 (${namedChs} 已命名, ${mutedChs} 静音), ${busData?.length ?? 0} 母线, 主输出${result.main ? (result.main as any).mute ? "静音" : ` ${(result.main as any).fader} dB` : "N/A"}`,
            next_actions: mutedChs > 0
              ? [{ tool: "wing_state_snapshot", description: "有静音通道，获取全量快照或用 wing_quick_check" }]
              : undefined,
          };
        } catch (e: any) {
          return {
            ok: false,
            errors: [{ code: "PROTOCOL_ERROR", message: e.message }],
            human_summary: `状态概览获取失败: ${e.message}`,
          };
        }
      },
    },

    wing_state_snapshot: {
      description:
        "FULL detail: complete dump of the entire mixer state including channels, buses, headamps, routing, and meters. Use when you need the most comprehensive picture — but prefer wing_state_summary or wing_quick_check for routine tasks. Output is a structured JSON snapshot. Risk: none. Read-only.",
      inputSchema: {
        type: "object" as const,
        properties: {
          include_meters: { type: "boolean", description: "Include meter readings. Default: true.", default: true },
          max_channels: { type: "number", description: "Limit channel count. Default: all 48.", default: 48 },
        },
      },
      handler: async (args: {
        include_meters?: boolean;
        max_channels?: number;
      }): Promise<ToolResult> => {
        try {
          const info = await driver.getInfo();
          const maxCh = args.max_channels ?? 48;

          const channelsSnap: any[] = [];
          const busesSnap: any[] = [];
          const headampsSnap: any[] = [];
          const mainSnap: Record<string, unknown> = {};
          const snapshot: Record<string, unknown> = {
            meta: {
              captured_at: new Date().toISOString(),
              device: info,
              driver: driver.kind,
            },
            channels: channelsSnap,
            buses: busesSnap,
            main: mainSnap,
            headamps: headampsSnap,
          };

          for (let ch = 1; ch <= maxCh; ch++) {
            try {
              const node = await driver.getNode(`/ch/${ch}`);
              const chData: Record<string, unknown> = { ch };
              for (const [key, val] of Object.entries(node)) {
                const shortKey = key.replace(`/ch/${ch}/`, "");
                if (val.type === "float") chData[shortKey] = `${val.value.toFixed(1)}${val.unit ? " " + val.unit : ""}`;
                else if (val.type === "bool") chData[shortKey] = val.value;
                else if (val.type === "string") chData[shortKey] = val.value;
                else if (val.type === "int") chData[shortKey] = val.value;
              }
              channelsSnap.push(chData);
            } catch { continue; }
          }

          for (let b = 1; b <= 16; b++) {
            try {
              const node = await driver.getNode(`/bus/${b}`);
              const bData: Record<string, unknown> = { bus: b };
              for (const [key, val] of Object.entries(node)) {
                const shortKey = key.replace(`/bus/${b}/`, "");
                if (val.type === "float") bData[shortKey] = `${val.value.toFixed(1)}${val.unit ? " " + val.unit : ""}`;
                else if (val.type === "bool") bData[shortKey] = val.value;
                else if (val.type === "string") bData[shortKey] = val.value;
              }
              busesSnap.push(bData);
            } catch { continue; }
          }

          try {
            const mainNode = await driver.getNode("/main/lr");
            for (const [key, val] of Object.entries(mainNode)) {
              const shortKey = key.replace("/main/lr/", "");
              if (val.type === "float") mainSnap[shortKey] = `${val.value.toFixed(1)}${val.unit ? " " + val.unit : ""}`;
              else if (val.type === "bool") mainSnap[shortKey] = val.value;
              else mainSnap[shortKey] = val.value;
            }
          } catch {}

          for (let i = 1; i <= 8; i++) {
            try {
              const gain = await driver.getParam(`/headamp/local/${i}/gain`);
              const phantom = await driver.getParam(`/headamp/local/${i}/phantom`);
              headampsSnap.push({
                input: i,
                gain: gain.type === "float" ? `${gain.value.toFixed(1)} dB` : "??",
                phantom: phantom.type === "bool" ? phantom.value : false,
              });
            } catch { continue; }
          }

          // Meters if requested
          if (args.include_meters !== false) {
            try {
              const meterTargets = ["/main/lr/fader"];
              for (let ch = 1; ch <= Math.min(maxCh, 8); ch++) {
                meterTargets.push(`/ch/${ch}/fader`);
              }
              const meters = await driver.meterRead(meterTargets, 1000);
              snapshot.meters = meters.meters.map(m => ({
                target: m.target,
                rmsDbfs: Math.round(m.rmsDbfs * 10) / 10,
                peakDbfs: Math.round(m.peakDbfs * 10) / 10,
                present: m.present,
              }));
            } catch {}
          }

          const chCount = channelsSnap.length;
          const busCount = busesSnap.length;

          return {
            ok: true,
            data: snapshot,
            human_summary: `完整快照: ${chCount} 通道, ${busCount} 母线, ${headampsSnap.length} 话放, ${snapshot.meters ? "含 meter 读数" : "无 meter"}`,
          };
        } catch (e: any) {
          return {
            ok: false,
            errors: [{ code: "PROTOCOL_ERROR", message: e.message }],
            human_summary: `快照获取失败: ${e.message}`,
          };
        }
      },
    },

    wing_channel_strip: {
      description:
        "FOCUSED detail: deep-dive on a single channel. Returns everything about one channel — name, source, mute, fader, pan, EQ bands, gate, compressor, all sends. Use when you need to understand a specific channel in detail. Risk: none. Read-only.",
      inputSchema: {
        type: "object" as const,
        properties: {
          channel: { type: "number", description: "Channel number to inspect." },
          include_sends: { type: "boolean", description: "Include all 16 send levels. Default: false for speed.", default: false },
        },
        required: ["channel"],
      },
      handler: async (args: {
        channel: number;
        include_sends?: boolean;
      }): Promise<ToolResult> => {
        try {
          const node = await driver.getNode(`/ch/${args.channel}`);
          const strip: Record<string, unknown> = { channel: args.channel };

          // Organize by category
          const identity: Record<string, unknown> = {};
          const eq: Record<string, unknown> = {};
          const dynamics: Record<string, unknown> = {};
          const sends: Record<string, unknown> = {};

          for (const [key, val] of Object.entries(node)) {
            const shortKey = key.replace(`/ch/${args.channel}/`, "");
            const formatted = formatWingValue(val);

            if (shortKey === "name" || shortKey === "source" || shortKey === "mute" || shortKey === "fader" || shortKey === "pan") {
              identity[shortKey] = formatted;
            } else if (shortKey.startsWith("eq/")) {
              eq[shortKey.replace("eq/", "")] = formatted;
            } else if (shortKey.startsWith("gate/") || shortKey.startsWith("comp/")) {
              dynamics[shortKey] = formatted;
            } else if (shortKey.startsWith("send/")) {
              if (args.include_sends !== false) {
                sends[shortKey] = formatted;
              }
            }
          }

          strip.identity = identity;
          strip.eq = eq;
          strip.dynamics = dynamics;
          if (args.include_sends !== false) strip.sends = sends;

          const name = identity.name ?? `CH ${args.channel}`;
          const muted = identity.mute === true || identity.mute === "ON";
          const fader = identity.fader ?? "?";

          return {
            ok: true,
            data: strip,
            human_summary: `CH ${args.channel} (${name}): ${muted ? "MUTED" : "active"}, Fader: ${fader}${Object.keys(eq).length ? `, EQ: ${Object.keys(eq).length} bands` : ""}${Object.keys(sends).length ? `, Sends: ${Object.keys(sends).length}` : ""}`,
          };
        } catch (e: any) {
          return {
            ok: false,
            errors: [{ code: "PARAM_NOT_FOUND", message: e.message }],
            human_summary: `获取通道 ${args.channel} 详情失败: ${e.message}`,
          };
        }
      },
    },

    wing_signal_path_trace: {
      description:
        "TRACE: follow a signal from source through the entire mixer path. Identifies every point where signal could be lost. Returns a structured path trace with status at each node. Use for 'no sound' diagnosis — tells you exactly where the signal stops. Risk: none. Read-only.",
      inputSchema: {
        type: "object" as const,
        properties: {
          channel: { type: "number", description: "Channel to trace." },
          include_meters: { type: "boolean", description: "Include meter readings at each stage.", default: true },
        },
        required: ["channel"],
      },
      handler: async (args: {
        channel: number;
        include_meters?: boolean;
      }): Promise<ToolResult> => {
        try {
          const trace: Array<{ stage: string; path: string; status: string; detail: string }> = [];
          const warnings: string[] = [];

          // Stage 1: Headamp / Source
          try {
            const source = await driver.getParam(`/ch/${args.channel}/source`);
            const sourceName = source.type === "string" ? source.value : "unknown";
            let headampOk = true;
            try {
              // Try to find headamp for this source
              const inputMatch = sourceName.match(/Local (\d+)/i);
              if (inputMatch) {
                const inputNum = parseInt(inputMatch[1]);
                const gain = await driver.getParam(`/headamp/local/${inputNum}/gain`);
                const phantom = await driver.getParam(`/headamp/local/${inputNum}/phantom`);
                trace.push({
                  stage: "1_headamp",
                  path: `/headamp/local/${inputNum}/gain`,
                  status: "ok",
                  detail: `Gain: ${gain.type === "float" ? gain.value.toFixed(1) + " dB" : "?"}, Phantom: ${phantom.type === "bool" && phantom.value ? "ON" : "OFF"}`,
                });
              } else {
                trace.push({ stage: "1_headamp", path: "—", status: "info", detail: `Source: ${sourceName} (not local input)` });
              }
            } catch {
              trace.push({ stage: "1_headamp", path: "—", status: "unknown", detail: `Source: ${sourceName}` });
            }
          } catch {
            trace.push({ stage: "1_headamp", path: "—", status: "unknown", detail: "Could not read source" });
          }

          // Stage 2: Channel strip
          try {
            const name = await driver.getParam(`/ch/${args.channel}/name`);
            const mute = await driver.getParam(`/ch/${args.channel}/mute`);
            const fader = await driver.getParam(`/ch/${args.channel}/fader`);
            const gate = await driver.getParam(`/ch/${args.channel}/gate/threshold`);

            const isMuted = mute.type === "bool" && mute.value;
            const faderDb = fader.type === "float" ? fader.value : 0;
            const gateDb = gate.type === "float" ? gate.value : -80;

            const channelIssues: string[] = [];
            if (isMuted) channelIssues.push("通道静音");
            if (faderDb < -70) channelIssues.push("推子极低");
            if (gateDb > 0) channelIssues.push("噪声门可能阻挡信号");

            trace.push({
              stage: "2_channel",
              path: `/ch/${args.channel}`,
              status: channelIssues.length ? "warning" : "ok",
              detail: `${name.type === "string" ? name.value : `CH ${args.channel}`}: ${isMuted ? "MUTE" : "unmuted"}, Fader ${faderDb.toFixed(1)} dB, Gate ${gateDb.toFixed(1)} dB${channelIssues.length ? " ⚠️ " + channelIssues.join(", ") : ""}`,
            });

            if (channelIssues.length) warnings.push(...channelIssues);
          } catch {
            trace.push({ stage: "2_channel", path: `/ch/${args.channel}`, status: "error", detail: "Could not read channel" });
          }

          // Stage 3: Send to Bus 1 (if relevant)
          try {
            const send1 = await driver.getParam(`/ch/${args.channel}/send/1/level`);
            const sendDb = send1.type === "float" ? send1.value : -99;
            trace.push({
              stage: "3_send_bus1",
              path: `/ch/${args.channel}/send/1/level`,
              status: sendDb > -90 ? "ok" : "info",
              detail: `Send to Bus 1: ${sendDb.toFixed(1)} dB${sendDb < -80 ? " (very low)" : ""}`,
            });
          } catch {
            trace.push({ stage: "3_send_bus1", path: "—", status: "unknown", detail: "Could not read send" });
          }

          // Stage 4: Main LR
          try {
            const mainMute = await driver.getParam("/main/lr/mute");
            const mainFader = await driver.getParam("/main/lr/fader");
            const isMainMuted = mainMute.type === "bool" && mainMute.value;
            trace.push({
              stage: "4_main_lr",
              path: "/main/lr",
              status: isMainMuted ? "warning" : "ok",
              detail: `Main LR: ${isMainMuted ? "MUTED ⚠️" : "unmuted"}, Fader ${mainFader.type === "float" ? mainFader.value.toFixed(1) + " dB" : "?"}`,
            });
            if (isMainMuted) warnings.push("Main LR 静音");
          } catch {
            trace.push({ stage: "4_main_lr", path: "/main/lr", status: "unknown", detail: "Could not read main LR" });
          }

          // Meter reading at each stage
          if (args.include_meters !== false) {
            try {
              const meterTargets = [`/ch/${args.channel}/fader`, "/main/lr/fader"];
              const meters = await driver.meterRead(meterTargets, 1000);
              for (const m of meters.meters) {
                const existing = trace.find(t => t.path === m.target);
                const signalNote = m.present ? `Signal: RMS ${m.rmsDbfs.toFixed(1)} dBFS` : "No signal";
                if (existing) {
                  existing.detail += ` | ${signalNote}`;
                  if (!m.present) warnings.push(`${m.target}: 无信号`);
                }
              }
            } catch {}
          }

          return {
            ok: true,
            data: { channel: args.channel, trace, warnings },
            human_summary: `CH ${args.channel} 信号路径追踪:\n${trace.map(t => `  [${t.status}] ${t.stage}: ${t.detail}`).join("\n")}`,
            warnings: warnings.length ? warnings.map(w => ({ code: "VALUE_OUT_OF_RANGE" as const, message: w })) : undefined,
          };
        } catch (e: any) {
          return {
            ok: false,
            errors: [{ code: "PROTOCOL_ERROR" as const, message: e.message }],
            human_summary: `路径追踪失败: ${e.message}`,
          };
        }
      },
    },
  };
}

function formatWingValue(val: WingValue): string | number | boolean {
  switch (val.type) {
    case "float": return val.value.toFixed(2);
    case "int": return val.value;
    case "bool": return val.value;
    case "string": return val.value;
    default: return JSON.stringify(val);
  }
}

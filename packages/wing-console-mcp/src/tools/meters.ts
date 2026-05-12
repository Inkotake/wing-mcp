import { WingDriver } from "../drivers/WingDriver.js";
import { ToolResult } from "../types.js";

export function registerMeterTools(driver: WingDriver) {
  return {
    wing_meter_catalog: {
      description:
        "Use this to list available meter sources on the WING console (inputs, channels, buses, main, etc.). Risk: none. Read-only.",
      inputSchema: {
        type: "object" as const,
        properties: {},
      },
      handler: async (): Promise<ToolResult> => {
        const catalog = [
          { category: "inputs", paths: Array.from({ length: 48 }, (_, i) => `/ch/${i + 1}/fader`), description: "Channel faders" },
          { category: "buses", paths: Array.from({ length: 16 }, (_, i) => `/bus/${i + 1}/fader`), description: "Bus faders" },
          { category: "main", paths: ["/main/lr/fader"], description: "Main LR" },
          { category: "headamps", paths: Array.from({ length: 48 }, (_, i) => `/headamp/local/${i + 1}/gain`), description: "Headamp gains" },
        ];
        return {
          ok: true,
          data: catalog,
          human_summary: `可用的 meter 源：输入通道(48), 母线(16), 主输出(1), 话放(48)`,
        };
      },
    },

    wing_meter_read: {
      description:
        "Use this to read meter levels for specified targets. Returns RMS dBFS, peak dBFS, and signal presence. Risk: none. Read-only.",
      inputSchema: {
        type: "object" as const,
        properties: {
          targets: {
            type: "array",
            items: { type: "string" },
            description: "List of meter target paths to read (e.g. ['/ch/1/fader', '/main/lr/fader']).",
          },
          window_ms: {
            type: "number",
            description: "Meter window in milliseconds. Default 500.",
            default: 500,
          },
        },
        required: ["targets"],
      },
      handler: async (args: { targets: string[]; window_ms?: number }): Promise<ToolResult> => {
        try {
          const frame = await driver.meterRead(args.targets, args.window_ms ?? 500);
          return {
            ok: true,
            data: frame,
            human_summary: frame.meters
              .map(
                (m) =>
                  `${m.target}: ${m.present ? `RMS ${m.rmsDbfs.toFixed(1)} dBFS, Peak ${m.peakDbfs.toFixed(1)} dBFS` : "无信号"}`
              )
              .join("\n"),
          };
        } catch (e: any) {
          return {
            ok: false,
            errors: [{ code: "PROTOCOL_ERROR" as const, message: e.message }],
            human_summary: `读取 meter 失败：${e.message}`,
          };
        }
      },
    },

    wing_signal_check: {
      description:
        "Use this to check whether specific targets have signal present. Returns confidence assessment (0-100). Use this BEFORE making changes in 'no sound' scenarios. Risk: none. Read-only.",
      inputSchema: {
        type: "object" as const,
        properties: {
          targets: {
            type: "array",
            items: { type: "string" },
            description: "List of paths to check for signal presence.",
          },
          window_ms: {
            type: "number",
            description: "Check window in milliseconds. Default 3000 for reliable detection.",
            default: 3000,
          },
        },
        required: ["targets"],
      },
      handler: async (args: { targets: string[]; window_ms?: number }): Promise<ToolResult> => {
        try {
          const frame = await driver.meterRead(args.targets, args.window_ms ?? 3000);
          const checks = frame.meters.map((m) => ({
            target: m.target,
            present: m.present,
            confidence: m.present ? Math.min(100, Math.round(80 + (m.peakDbfs + 60) * 2)) : 0,
            rmsDbfs: m.rmsDbfs,
            peakDbfs: m.peakDbfs,
          }));
          const hasAnySignal = checks.some((c) => c.present);
          return {
            ok: true,
            data: { checks, hasAnySignal },
            human_summary: hasAnySignal
              ? `检测到信号：${checks.filter((c) => c.present).map((c) => `${c.target} (${c.confidence}%)`).join(", ")}`
              : `所有目标均无信号`,
            next_actions: !hasAnySignal
              ? [{ tool: "sound_diagnosis_start", description: "No signal detected. Start diagnosis?" }]
              : undefined,
          };
        } catch (e: any) {
          return {
            ok: false,
            errors: [{ code: "PROTOCOL_ERROR" as const, message: e.message }],
            human_summary: `信号检测失败：${e.message}`,
          };
        }
      },
    },
  };
}

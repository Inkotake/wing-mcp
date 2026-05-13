import { WingDriver } from "../drivers/WingDriver.js";
import { ToolResult, WingDeviceSchema } from "../types.js";

export function registerDeviceTools(driver: WingDriver) {
  return {
    wing_discover: {
      description:
        "Use this to discover WING family consoles on the control network. Sends UDP broadcast on port 2222 and listens for responses. Risk: none. Read-only.",
      inputSchema: {
        type: "object" as const,
        properties: {
          timeout_ms: {
            type: "number",
            description: "Discovery timeout in milliseconds. Default 3000.",
            default: 3000,
          },
          direct_ips: {
            type: "array",
            items: { type: "string" },
            description: "Optional list of IP addresses to probe directly.",
          },
        },
      },
      handler: async (args: { timeout_ms?: number; direct_ips?: string[] }): Promise<ToolResult> => {
        try {
          const devices = await driver.discover({
            timeoutMs: args.timeout_ms ?? 3000,
            directIps: args.direct_ips,
          });
          return {
            ok: true,
            data: devices,
            human_summary: `发现 ${devices.length} 台 WING 设备：${devices.map((d) => `${d.name ?? d.ip} (${d.model})`).join(", ") || "无设备"}`,
          };
        } catch (e: any) {
          return {
            ok: false,
            errors: [{ code: "DEVICE_NOT_FOUND", message: e.message }],
            human_summary: `发现失败：${e.message}`,
          };
        }
      },
    },

    wing_connect: {
      description:
        "Use this to establish a driver session with a selected WING console. Risk: none. Read-only.",
      inputSchema: {
        type: "object" as const,
        properties: {
          device: {
            type: "object",
            description: "Device descriptor from wing_discover.",
            properties: {
              id: { type: "string" },
              ip: { type: "string" },
              name: { type: "string" },
              model: { type: "string" },
              serial: { type: "string" },
              firmware: { type: "string" },
            },
            required: ["id", "ip"],
          },
        },
        required: ["device"],
      },
      handler: async (args: { device: { id: string; ip: string; name?: string; model?: string; serial?: string; firmware?: string } }): Promise<ToolResult> => {
        try {
          const parsed = WingDeviceSchema.safeParse(args.device);
          if (!parsed.success) {
            return {
              ok: false,
              errors: [{ code: "VALUE_OUT_OF_RANGE", message: `Invalid device: ${parsed.error.message}` }],
              human_summary: `设备参数无效：${parsed.error.message}`,
            };
          }
          const device = parsed.data;
          await driver.connect(device);
          const info = await driver.getInfo();
          return {
            ok: true,
            data: info,
            human_summary: `已连接到 ${info.name ?? info.ip} (${info.model}, firmware ${info.firmware})`,
          };
        } catch (e: any) {
          return {
            ok: false,
            errors: [{ code: "PROTOCOL_ERROR", message: e.message }],
            human_summary: `连接失败：${e.message}`,
          };
        }
      },
    },

    wing_get_status: {
      description:
        "Use this to inspect connection, driver, policy, live mode, and device status. Risk: none. Read-only.",
      inputSchema: {
        type: "object" as const,
        properties: {},
      },
      handler: async (_args: any, context?: { mode?: string; liveMode?: boolean; stateCache?: any }): Promise<ToolResult> => {
        try {
          const info = await driver.getInfo();
          // Cache device info for 30s
          context?.stateCache?.set?.("__wing_status", { type: "node", value: info });
          return {
            ok: true,
            data: {
              device: info,
              driver: driver.kind,
              connected: true,
              mode: context?.mode ?? "unknown",
              liveMode: context?.liveMode ?? false,
            },
            human_summary: `WING ${info.name} (${info.model}) — 已连接，驱动: ${driver.kind}，模式: ${context?.mode ?? "?"}`,
          };
        } catch (e: any) {
          return {
            ok: false, // explicitly mark as not ok so AI knows to check
            data: {
              connected: false,
              driver: driver.kind,
              mode: context?.mode ?? "unknown",
              liveMode: context?.liveMode ?? false,
              error: e.message,
            },
            warnings: [{ code: "DEVICE_DISCONNECTED", message: e.message }],
            human_summary: "⚠️ 未连接 WING 设备。请先运行 wing_discover + wing_connect。",
            next_actions: [{ tool: "wing_discover", description: "搜索可用WING设备" }],
          };
        }
      },
    },
  };
}

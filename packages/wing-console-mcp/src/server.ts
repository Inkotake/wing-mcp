#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { FakeWingDriver, WingDriver } from "./drivers/WingDriver.js";
import { NativeDriver } from "./drivers/NativeDriver.js";
import { OscDriver } from "./drivers/OscDriver.js";
import { RiskEngine } from "./safety/RiskEngine.js";
import { PolicyEngine } from "./safety/PolicyEngine.js";
import { ConfirmationManager } from "./safety/ConfirmationManager.js";
import { AuditLogger } from "./safety/AuditLogger.js";
import { ChangePlanner } from "./safety/ChangePlanner.js";
import { RateLimiter } from "./safety/RateLimiter.js";
import { StateCache, AliasResolver } from "./state/StateCache.js";
import { registerDeviceTools } from "./tools/device.js";
import { registerSchemaTools } from "./tools/schema.js";
import { registerParamTools } from "./tools/params.js";
import { registerChannelTools } from "./tools/channels.js";
import { registerSendTools } from "./tools/sends.js";
import { registerRoutingTools } from "./tools/routing.js";
import { registerHeadampTools } from "./tools/headamp.js";
import { registerSceneTools } from "./tools/scenes.js";
import { registerMeterTools } from "./tools/meters.js";
import { registerDiagnosisTools } from "./tools/diagnosis.js";
import { registerViewTools } from "./tools/views.js";
import { registerProcessingTools } from "./tools/processing.js";
import { registerGroupTools } from "./tools/groups.js";
import { registerBulkTools } from "./tools/bulk.js";
import { registerEmergencyTools } from "./tools/emergency.js";
import { registerRawTools } from "./tools/raw.js";
import { Mode, ToolResult, RISK_MAP, validateMode, VALID_MODES } from "./types.js";

/** Runtime input validation for common numeric ranges and enums */
function validateArgs(toolName: string, args: Record<string, unknown>): string | null {
  const ch = args.channel as number | undefined;
  const bus = args.bus as number | undefined;
  const dca = args.dca as number | undefined;
  const group = args.group as number | undefined;
  const slot = args.slot as number | undefined;
  const input = args.input as number | undefined;
  const matrix = args.matrix as number | undefined;
  const scene_index = args.scene_index as number | undefined;
  const scope = args.scope as string | undefined;
  const band = args.band as string | undefined;
  const parameter = args.parameter as string | undefined;

  if (ch !== undefined && (!Number.isInteger(ch) || ch < 1 || ch > 48)) return `channel must be 1-48, got ${ch}`;
  if (bus !== undefined && (!Number.isInteger(bus) || bus < 1 || bus > 16)) return `bus must be 1-16, got ${bus}`;
  if (dca !== undefined && (!Number.isInteger(dca) || dca < 1 || dca > 8)) return `dca must be 1-8, got ${dca}`;
  if (group !== undefined && (!Number.isInteger(group) || group < 1 || group > 6)) return `group must be 1-6, got ${group}`;
  if (slot !== undefined && (!Number.isInteger(slot) || slot < 1 || slot > 8)) return `slot must be 1-8, got ${slot}`;
  if (input !== undefined && (!Number.isInteger(input) || input < 1 || input > 48)) return `input must be 1-48, got ${input}`;
  if (matrix !== undefined && (!Number.isInteger(matrix) || matrix < 1 || matrix > 8)) return `matrix must be 1-8, got ${matrix}`;
  if (scene_index !== undefined && (!Number.isInteger(scene_index) || scene_index < 0 || scene_index > 99)) return `scene_index must be 0-99, got ${scene_index}`;
  if (scope !== undefined && !["all", "main_only", "channels_only"].includes(scope)) return `scope must be all/main_only/channels_only, got ${scope}`;
  if (band !== undefined && !["high", "hi_mid", "lo_mid", "low"].includes(band)) return `band must be high/hi_mid/lo_mid/low, got ${band}`;
  if (parameter !== undefined) {
    const validParams = ["gain", "freq", "q", "threshold", "range", "attack", "hold", "release", "ratio"];
    if (!validParams.includes(parameter)) return `parameter must be one of: ${validParams.join(", ")}, got ${parameter}`;
  }

  return null; // valid
}

// Configuration from environment
// Validate mode at startup — invalid mode kills the server with clear error
let mode: Mode;
try {
  mode = validateMode(process.env.WING_MODE ?? "rehearsal_safe");
} catch (e: any) {
  console.error(`[wing-console-mcp] ${e.message}`);
  process.exit(1);
}

const config = {
  mode,
  liveMode: process.env.WING_LIVE_MODE === "1",
  driver: process.env.WING_DRIVER ?? "fake",
  enableRaw: process.env.WING_ENABLE_RAW === "1",
};

// Initialize driver based on config
// Priority: native (libwing via Rust sidecar) > osc (UDP fallback) > fake (dev/testing)
let driver: WingDriver;
if (config.driver === "native") {
  driver = new NativeDriver();
} else if (config.driver === "osc") {
  driver = new OscDriver();
} else {
  driver = new FakeWingDriver();
}
const riskEngine = new RiskEngine();
const policyEngine = new PolicyEngine(config.mode, config.liveMode);
const confirmationManager = new ConfirmationManager();
const auditLogger = new AuditLogger();
const stateCache = new StateCache();
const aliasResolver = new AliasResolver();

const changePlanner = new ChangePlanner(
  driver,
  policyEngine,
  riskEngine,
  confirmationManager,
  auditLogger,
  config.mode
);

// Register all tool groups
const deviceTools = registerDeviceTools(driver);
const schemaTools = registerSchemaTools(driver);
const paramTools = registerParamTools(driver, changePlanner);
const channelTools = registerChannelTools(driver, changePlanner);
const sendTools = registerSendTools(driver, changePlanner);
const routingTools = registerRoutingTools(driver, changePlanner);
const headampTools = registerHeadampTools(driver, changePlanner);
const sceneTools = registerSceneTools(driver, changePlanner);
const meterTools = registerMeterTools(driver);
const diagnosisTools = registerDiagnosisTools(driver, changePlanner);
const viewTools = registerViewTools(driver);
const processingTools = registerProcessingTools(driver, changePlanner);
const groupTools = registerGroupTools(driver, changePlanner);
const bulkTools = registerBulkTools(driver, changePlanner);
const emergencyTools = registerEmergencyTools(driver, changePlanner);
const rawTools = registerRawTools(driver, changePlanner);

// Rate limiter: max 12 writes/min, 2s interval, 10s critical cooldown
const rateLimiter = new RateLimiter(12, 2000, 10000);

const allTools: Record<string, any> = {
  ...deviceTools,
  ...schemaTools,
  ...paramTools,
  ...channelTools,
  ...sendTools,
  ...routingTools,
  ...headampTools,
  ...sceneTools,
  ...meterTools,
  ...diagnosisTools,
  ...viewTools,
  ...processingTools,
  ...groupTools,
  ...bulkTools,
  ...emergencyTools,
  // Raw tools only if enabled
  ...(config.enableRaw ? rawTools : {}),
};

// Shared context passed to tool handlers
const toolContext = {
  mode: config.mode,
  liveMode: config.liveMode,
  driver: driver.kind,
  stateCache,
  aliasResolver,
};

// Create MCP server
const server = new Server(
  {
    name: "wing-console-mcp",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
      resources: {},
      prompts: {},
    },
  }
);

// Register tool listing
server.setRequestHandler(ListToolsRequestSchema, async () => {
  const toolList = Object.entries(allTools)
    .filter(([name]) => {
      // Filter out disabled raw tools
      if (!config.enableRaw && name.includes("raw_")) return false;
      return true;
    })
    .map(([name, tool]) => ({
      name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    }));

  return { tools: toolList };
});

// Register tool execution
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const toolName = request.params.name;
  const toolArgs = request.params.arguments ?? {};

  const tool = allTools[toolName];
  if (!tool) {
    return {
      content: [{ type: "text", text: JSON.stringify({ ok: false, errors: [{ code: "PARAM_NOT_FOUND", message: `Tool ${toolName} not found.` }], human_summary: `工具 ${toolName} 未找到。` }) }],
      isError: true,
    };
  }

  // Runtime input validation
  const validationError = validateArgs(toolName, toolArgs);
  if (validationError) {
    return {
      content: [{ type: "text", text: JSON.stringify({ ok: false, errors: [{ code: "VALUE_OUT_OF_RANGE", message: validationError }], human_summary: `参数校验失败：${validationError}` }) }],
      isError: true,
    };
  }

  // Rate limiting: only count actual apply writes, not prepare/read ops
  const isEmergency = toolName.startsWith("wing_emergency");
  const isApplyWrite = toolName.endsWith("_apply");
  if (isApplyWrite && !isEmergency) {
    const rateCheck = rateLimiter.check(toolName, false);
    if (!rateCheck.allowed) {
      return {
        content: [{ type: "text", text: JSON.stringify({
          ok: false,
          errors: [{ code: "POLICY_DENIED", message: rateCheck.reason ?? "Rate limit exceeded" }],
          human_summary: `速率限制：${rateCheck.reason ?? "too many requests"}`,
          data: { retryAfterMs: rateCheck.retryAfterMs },
        } satisfies ToolResult) }],
        isError: true,
      };
    }
  }

  try {
    const result: ToolResult = await tool.handler(toolArgs, toolContext);

    // Record write for rate limiting
    if (isApplyWrite) {
      const risk = RISK_MAP[toolName] ?? "none";
      if (result.ok) rateLimiter.record(toolName, risk);
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result),
        },
      ],
      isError: !result.ok,
    };
  } catch (e: any) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            ok: false,
            errors: [{ code: "PROTOCOL_ERROR", message: e.message }],
            human_summary: `工具执行错误：${e.message}`,
          }),
        },
      ],
      isError: true,
    };
  }
});

// Register resources
server.setRequestHandler(ListResourcesRequestSchema, async () => ({
  resources: [
    {
      uri: "wing://status",
      name: "WING Console Status",
      description: "Current connection and device status",
      mimeType: "application/json",
    },
    {
      uri: "wing://audit/recent",
      name: "Recent Audit Records",
      description: "Last 20 audit records",
      mimeType: "application/json",
    },
    {
      uri: "wing://policy/current",
      name: "Current Safety Policy",
      description: "Active mode, risk policy, and configuration",
      mimeType: "application/json",
    },
    {
      uri: "wing://snapshot",
      name: "Full Console Snapshot",
      description: "Complete current mixer state snapshot",
      mimeType: "application/json",
    },
  ],
}));

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const uri = request.params.uri;

  switch (uri) {
    case "wing://status": {
      let deviceInfo = null;
      try {
        deviceInfo = await driver.getInfo();
      } catch {}
      return {
        contents: [
          {
            uri,
            mimeType: "application/json",
            text: JSON.stringify({ connected: !!deviceInfo, device: deviceInfo, driver: driver.kind, mode: config.mode, liveMode: config.liveMode }),
          },
        ],
      };
    }
    case "wing://audit/recent": {
      return {
        contents: [
          {
            uri,
            mimeType: "application/json",
            text: JSON.stringify(auditLogger.getRecent(20)),
          },
        ],
      };
    }
    case "wing://policy/current": {
      return {
        contents: [
          {
            uri,
            mimeType: "application/json",
            text: JSON.stringify({ mode: config.mode, liveMode: config.liveMode, enableRaw: config.enableRaw }),
          },
        ],
      };
    }
    case "wing://snapshot": {
      // Return a compact snapshot via resource
      let snapshot: Record<string, unknown> = {};
      try {
        const info = await driver.getInfo();
        snapshot.device = info;
        const channels: Record<string, unknown>[] = [];
        for (let ch = 1; ch <= 48; ch++) {
          try {
            const name = await driver.getParam(`/ch/${ch}/name`);
            const mute = await driver.getParam(`/ch/${ch}/mute`);
            const fader = await driver.getParam(`/ch/${ch}/fader`);
            channels.push({
              ch,
              name: name.type === "string" ? name.value : "",
              mute: mute.type === "bool" ? mute.value : false,
              fader: fader.type === "float" ? fader.value : 0,
            });
          } catch { continue; }
        }
        snapshot.channels = channels;
      } catch {}
      return {
        contents: [{ uri, mimeType: "application/json", text: JSON.stringify(snapshot) }],
      };
    }
    default:
      throw new Error(`Resource ${uri} not found`);
  }
});

// Register prompts
server.setRequestHandler(ListPromptsRequestSchema, async () => ({
  prompts: [
    {
      name: "no_sound_diagnosis",
      description: "Start a no-sound diagnosis for a target",
      arguments: [
        { name: "target", description: "What/who has no sound", required: true },
        { name: "room_id", description: "Room identifier", required: false },
      ],
    },
    {
      name: "line_check",
      description: "Perform a line check",
      arguments: [
        { name: "room_id", description: "Room identifier", required: false },
      ],
    },
    {
      name: "monitor_mix_adjustment",
      description: "Adjust a performer's monitor mix",
      arguments: [
        { name: "performer", description: "Performer name (e.g. 'drummer')", required: true },
        { name: "source", description: "Source to adjust in the mix", required: true },
      ],
    },
    {
      name: "feedback_triage",
      description: "Triage a feedback issue",
      arguments: [
        { name: "location", description: "Where feedback is occurring", required: false },
      ],
    },
  ],
}));

server.setRequestHandler(GetPromptRequestSchema, async (request) => {
  const name = request.params.name;
  const args = request.params.arguments ?? {};

  switch (name) {
    case "no_sound_diagnosis":
      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `Start a no-sound diagnosis for ${args.target ?? "unknown"}. Use read-only WING tools first. Use wing_signal_check, wing_channel_get, and wing_routing_trace before suggesting changes. Ask one human action at a time. Never change phantom, routing, main, scenes or snapshots without exact confirmation. Room: ${args.room_id ?? "unknown"}.`,
            },
          },
        ],
      };
    case "line_check":
      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `Perform a line check${args.room_id ? ` for room ${args.room_id}` : ""}. Read all channel names, mute states, and check meters for signal presence. Report any channels with no signal or unexpected mute. Do not change any settings unless explicitly asked.`,
            },
          },
        ],
      };
    case "monitor_mix_adjustment":
      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `Adjust the monitor mix for ${args.performer ?? "performer"}. Target: ${args.source ?? "vocals"}. Use wing_send_get to read current send levels first. Only make small adjustments (max 3dB). Confirm each change.`,
            },
          },
        ],
      };
    case "feedback_triage":
      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `Triage feedback issue${args.location ? ` at ${args.location}` : ""}. Start with read-only tools: check meters, identify the ringing frequency, check monitor send levels. Never push levels up when feedback is happening. Suggest EQ cuts or level reductions.`,
            },
          },
        ],
      };
    default:
      throw new Error(`Prompt ${name} not found`);
  }
});

// Cleanup stale confirmations periodically
setInterval(() => {
  confirmationManager.cleanup();
}, 60000);

// Start server
async function main() {
  // Auto-connect to fake driver for development
  if (config.driver === "fake") {
    try {
      const devices = await driver.discover({ timeoutMs: 1000 });
      if (devices.length > 0) {
        await driver.connect(devices[0]);
        console.error(`[wing-console-mcp] Connected to ${devices[0].name} (fake mode)`);
      }
    } catch (e) {
      console.error(`[wing-console-mcp] Auto-connect failed: ${e}`);
    }
  }

  console.error(`[wing-console-mcp] Starting server in ${config.mode} mode, driver: ${config.driver}`);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error("[wing-console-mcp] Ready");
}

main().catch((err) => {
  console.error("[wing-console-mcp] Fatal error:", err);
  process.exit(1);
});

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
import { RiskEngine } from "./safety/RiskEngine.js";
import { PolicyEngine } from "./safety/PolicyEngine.js";
import { ConfirmationManager } from "./safety/ConfirmationManager.js";
import { AuditLogger } from "./safety/AuditLogger.js";
import { ChangePlanner } from "./safety/ChangePlanner.js";
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
import { registerRawTools } from "./tools/raw.js";
import { Mode, ToolResult } from "./types.js";

// Configuration from environment
const config = {
  mode: (process.env.WING_MODE as Mode) ?? "rehearsal_safe",
  liveMode: process.env.WING_LIVE_MODE === "1",
  driver: process.env.WING_DRIVER ?? "fake",
  enableRaw: process.env.WING_ENABLE_RAW === "1",
};

// Initialize components
const driver: WingDriver = new FakeWingDriver();
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
const bulkTools = registerBulkTools(driver);
const rawTools = registerRawTools(driver, changePlanner);

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
  // Raw tools only if enabled
  ...(config.enableRaw ? rawTools : {}),
};

// Shared context passed to tool handlers
const toolContext = {
  mode: config.mode,
  liveMode: config.liveMode,
  driver: driver.kind,
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

  try {
    const result: ToolResult = await tool.handler(toolArgs, toolContext);

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
          } catch { break; }
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

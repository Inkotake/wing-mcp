import { WingDriver } from "../drivers/WingDriver.js";
import { ToolResult, WingValue } from "../types.js";
import { ChangePlanner } from "../safety/ChangePlanner.js";

export function registerRoutingTools(driver: WingDriver, changePlanner: ChangePlanner) {
  return {
    wing_routing_trace: {
      description:
        "Use this to trace a signal path from source to destination: input patch -> channel -> sends -> bus -> main out. Risk: none. Read-only.",
      inputSchema: {
        type: "object" as const,
        properties: {
          source: { type: "string", description: "Source description: channel number (e.g. 'ch/1'), bus number (e.g. 'bus/1'), or 'main/lr'." },
        },
        required: ["source"],
      },
      handler: async (args: { source: string }): Promise<ToolResult> => {
        try {
          const source = args.source;
          const path = `/${source}`;
          const node = await driver.getNode(path);
          const trace = {
            source: args.source,
            params: node,
            path: path,
          };
          return {
            ok: true,
            data: trace,
            human_summary: `${args.source} 路由路径：${Object.keys(node).join(", ") || "无关联参数"}`,
          };
        } catch (e: any) {
          return {
            ok: false,
            errors: [{ code: "PARAM_NOT_FOUND", message: e.message }],
            human_summary: `路由追踪失败：${e.message}`,
          };
        }
      },
    },

    wing_routing_get: {
      description:
        "Use this to read the current input/output routing patch for a specific source or destination. Risk: none. Read-only.",
      inputSchema: {
        type: "object" as const,
        properties: {
          target: { type: "string", description: "Target: 'ch/{n}/source', 'bus/{n}/out', 'main/lr/out'." },
        },
        required: ["target"],
      },
      handler: async (args: { target: string }): Promise<ToolResult> => {
        try {
          const path = `/${args.target}`;
          const value = await driver.getParam(path);
          return {
            ok: true,
            data: value,
            human_summary: `${args.target} 当前路由: ${value.type === "string" ? value.value : JSON.stringify(value)}`,
          };
        } catch (e: any) {
          return {
            ok: false,
            errors: [{ code: "PARAM_NOT_FOUND", message: e.message }],
            human_summary: `读取路由失败：${e.message}`,
          };
        }
      },
    },

    wing_routing_set_prepare: {
      description:
        "Use this to prepare a routing change. CRITICAL risk — can cause silence on main PA or monitors. Risk: critical. Write: prepare/apply/readback/audit.",
      inputSchema: {
        type: "object" as const,
        properties: {
          target: { type: "string", description: "Routing target to change (e.g. 'ch/1/source')." },
          destination: { type: "string", description: "New routing destination (e.g. 'Local 2')." },
          reason: { type: "string", description: "Why this routing change is needed." },
        },
        required: ["target", "destination", "reason"],
      },
      handler: async (args: {
        target: string;
        destination: string;
        reason: string;
      }): Promise<ToolResult> => {
        const path = `/${args.target}`;
        const newVal: WingValue = { type: "string", value: args.destination };
        return changePlanner.prepareWrite("wing_routing_set_prepare", path, newVal, args.reason);
      },
    },

    wing_routing_set_apply: {
      description:
        "Use this to apply a prepared routing change. CRITICAL risk. Requires exact confirmation. Risk: critical. Write: prepare/apply/readback/audit.",
      inputSchema: {
        type: "object" as const,
        properties: {
          target: { type: "string", description: "Routing target (must match prepare)." },
          destination: { type: "string", description: "New routing destination (must match prepare)." },
          reason: { type: "string", description: "Why this routing change is needed." },
          confirmation_id: { type: "string", description: "Confirmation ID from prepare step." },
        },
        required: ["target", "destination", "reason", "confirmation_id"],
      },
      handler: async (args: {
        target: string;
        destination: string;
        reason: string;
        confirmation_id: string;
      }): Promise<ToolResult> => {
        const path = `/${args.target}`;
        const newVal: WingValue = { type: "string", value: args.destination };
        return changePlanner.applyWrite(
          "wing_routing_set_apply",
          path,
          newVal,
          args.reason,
          args.confirmation_id
        );
      },
    },
  };
}

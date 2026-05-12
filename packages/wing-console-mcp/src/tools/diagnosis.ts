import { WingDriver } from "../drivers/WingDriver.js";
import { ToolResult, WingValue } from "../types.js";
import { ChangePlanner } from "../safety/ChangePlanner.js";

/**
 * Diagnosis Session State Machine
 *
 * States:
 *   idle -> scoping -> signal_check -> breakpoint_classify -> recommend -> fix_prepare -> fix_apply -> verify -> closed
 *
 * Workflows:
 *   - no_sound: "为什么没声音？"
 *   - feedback: "反馈/啸叫"
 *   - monitor_mix: "耳返/监听不对"
 *   - recording_no_signal: "录音没信号"
 *   - livestream_no_signal: "直播没信号"
 */
type DiagnosisState =
  | "idle"
  | "scoping"
  | "signal_check"
  | "breakpoint_classify"
  | "recommend"
  | "fix_prepare"
  | "fix_apply"
  | "verify"
  | "closed";

interface DiagnosisSession {
  id: string;
  state: DiagnosisState;
  workflow: string;
  target: string;
  roomId?: string;
  history: Array<{ state: DiagnosisState; timestamp: string; finding?: string }>;
  breakpoints: Array<{ location: string; status: "unknown" | "pass" | "fail"; detail?: string }>;
  createdAt: string;
}

const sessions: Map<string, DiagnosisSession> = new Map();

export function registerDiagnosisTools(driver: WingDriver, changePlanner: ChangePlanner) {
  return {
    sound_diagnosis_start: {
      description:
        "Use this to start a structured sound diagnosis session for 'no sound', 'feedback', 'monitor mix', or other sound problems. IMPORTANT: Always use diagnosis tools first before making mixer changes. Risk: none. Read-only (creates session).",
      inputSchema: {
        type: "object" as const,
        properties: {
          workflow: {
            type: "string",
            enum: ["no_sound", "feedback", "monitor_mix", "recording_no_signal", "livestream_no_signal"],
            description: "Type of sound problem to diagnose.",
          },
          target: {
            type: "string",
            description: "What/who has the problem. E.g. 'main vocal', '主唱', 'drummer monitor', '鼓手耳返', 'main PA'.",
          },
          room_id: {
            type: "string",
            description: "Optional room identifier for patch sheet lookup.",
          },
          description: {
            type: "string",
            description: "Brief description of the problem as described by the user.",
          },
        },
        required: ["workflow", "target"],
      },
      handler: async (args: {
        workflow: string;
        target: string;
        room_id?: string;
        description?: string;
      }): Promise<ToolResult> => {
        const sessionId = `diag_${Date.now()}`;
        const session: DiagnosisSession = {
          id: sessionId,
          state: "scoping",
          workflow: args.workflow,
          target: args.target,
          roomId: args.room_id,
          history: [{ state: "scoping", timestamp: new Date().toISOString(), finding: `Started ${args.workflow} diagnosis for ${args.target}` }],
          breakpoints: [],
          createdAt: new Date().toISOString(),
        };

        // Initialize breakpoints based on workflow
        if (args.workflow === "no_sound") {
          session.breakpoints = [
            { location: "source", status: "unknown", detail: "Is the source producing signal?" },
            { location: "input_patch", status: "unknown", detail: "Is the input patched to the correct channel?" },
            { location: "channel", status: "unknown", detail: "Is the channel muted? Fader down? Gate clamped?" },
            { location: "bus_send", status: "unknown", detail: "Is the channel being sent to the required bus?" },
            { location: "bus_main", status: "unknown", detail: "Is the bus/main muted? Fader down?" },
            { location: "output", status: "unknown", detail: "Is output routing correct? External amp/speaker on?" },
          ];
        } else if (args.workflow === "feedback") {
          session.breakpoints = [
            { location: "monitor_level", status: "unknown", detail: "Monitor level too high?" },
            { location: "mic_placement", status: "unknown", detail: "Mic too close to speaker?" },
            { location: "eq_ringing", status: "unknown", detail: "EQ frequencies causing resonance?" },
            { location: "gain_staging", status: "unknown", detail: "Gain structure too hot?" },
          ];
        } else if (args.workflow === "monitor_mix") {
          session.breakpoints = [
            { location: "send_level", status: "unknown", detail: "Send level to monitor bus correct?" },
            { location: "bus_routing", status: "unknown", detail: "Bus routed to correct monitor output?" },
            { location: "bus_mute", status: "unknown", detail: "Monitor bus muted?" },
            { location: "pre_post", status: "unknown", detail: "Send pre/post fader setting correct?" },
          ];
        }

        sessions.set(sessionId, session);

        const nextStep = getNextStep(session);
        return {
          ok: true,
          data: { session, nextStep },
          human_summary: `开始诊断: ${args.workflow} — ${args.target}\n\n${nextStep}`,
          next_actions: getNextActions(session),
        };
      },
    },

    sound_diagnosis_next_step: {
      description:
        "Use this to get the next step in an active diagnosis session. Risk: none. Read-only.",
      inputSchema: {
        type: "object" as const,
        properties: {
          session_id: { type: "string", description: "Diagnosis session ID from sound_diagnosis_start." },
          finding: { type: "string", description: "Optional: what was found in the previous step." },
          breakpoint_status: {
            type: "string",
            enum: ["pass", "fail"],
            description: "Optional: status of the current breakpoint being checked.",
          },
        },
        required: ["session_id"],
      },
      handler: async (args: {
        session_id: string;
        finding?: string;
        breakpoint_status?: "pass" | "fail";
      }): Promise<ToolResult> => {
        const session = sessions.get(args.session_id);
        if (!session) {
          return {
            ok: false,
            errors: [{ code: "PARAM_NOT_FOUND", message: `Session ${args.session_id} not found.` }],
            human_summary: `诊断会话 ${args.session_id} 未找到，请重新开始诊断。`,
          };
        }

        // Update current breakpoint if status provided
        const current = session.breakpoints.find((b) => b.status === "unknown");
        if (current && args.breakpoint_status) {
          current.status = args.breakpoint_status;
          if (args.finding) current.detail = args.finding;
          session.history.push({
            state: session.state,
            timestamp: new Date().toISOString(),
            finding: `${current.location}: ${args.breakpoint_status} — ${args.finding ?? current.detail}`,
          });
        }

        // Advance state
        const nextUnknown = session.breakpoints.find((b) => b.status === "unknown");
        if (!nextUnknown) {
          session.state = "recommend";
        } else {
          session.state = "signal_check";
        }

        const nextStep = getNextStep(session);
        return {
          ok: true,
          data: { session, nextStep },
          human_summary: nextStep,
          next_actions: getNextActions(session),
        };
      },
    },

    sound_diagnosis_prepare_fix: {
      description:
        "Use this to prepare a fix identified by the diagnosis engine. Risk: dynamic. Write: prepare/apply/readback/audit.",
      inputSchema: {
        type: "object" as const,
        properties: {
          session_id: { type: "string", description: "Diagnosis session ID." },
          fix_description: { type: "string", description: "Description of what to fix." },
          tool_to_use: { type: "string", description: "MCP tool to use for the fix." },
          target_path: { type: "string", description: "Target parameter path." },
          target_value: { type: "object", description: "Target value." },
        },
        required: ["session_id", "fix_description", "tool_to_use", "target_path", "target_value"],
      },
      handler: async (args: {
        session_id: string;
        fix_description: string;
        tool_to_use: string;
        target_path: string;
        target_value: any;
      }): Promise<ToolResult> => {
        const session = sessions.get(args.session_id);
        if (!session) {
          return { ok: false, errors: [{ code: "PARAM_NOT_FOUND", message: "Session not found." }], human_summary: "诊断会话未找到。" };
        }
        session.state = "fix_prepare";
        return changePlanner.prepareWrite(
          args.tool_to_use,
          args.target_path,
          args.target_value as WingValue,
          `[Diagnosis ${session.id}] ${args.fix_description}`
        );
      },
    },

    sound_diagnosis_apply_fix: {
      description:
        "Use this to apply a diagnosis fix. Risk: dynamic. Write: prepare/apply/readback/audit.",
      inputSchema: {
        type: "object" as const,
        properties: {
          session_id: { type: "string", description: "Diagnosis session ID." },
          tool_to_use: { type: "string", description: "MCP tool (must match prepare)." },
          target_path: { type: "string", description: "Target path (must match prepare)." },
          target_value: { type: "object", description: "Target value (must match prepare)." },
          fix_description: { type: "string", description: "Fix description." },
          confirmation_id: { type: "string", description: "Confirmation ID from prepare." },
        },
        required: ["session_id", "tool_to_use", "target_path", "target_value", "fix_description", "confirmation_id"],
      },
      handler: async (args: {
        session_id: string;
        tool_to_use: string;
        target_path: string;
        target_value: any;
        fix_description: string;
        confirmation_id: string;
        confirmation_text?: string;
      }): Promise<ToolResult> => {
        const session = sessions.get(args.session_id);
        if (!session) {
          return { ok: false, errors: [{ code: "PARAM_NOT_FOUND", message: "Session not found." }], human_summary: "诊断会话未找到。" };
        }
        session.state = "fix_apply";
        const result = await changePlanner.applyWrite(
          args.tool_to_use,
          args.target_path,
          args.target_value as WingValue,
          `[Diagnosis ${session.id}] ${args.fix_description}`,
          args.confirmation_id, args.confirmation_text
        );
        if (result.ok) {
          session.state = "verify";
          session.history.push({
            state: "verify",
            timestamp: new Date().toISOString(),
            finding: `Applied fix: ${args.fix_description}`,
          });
        }
        return result;
      },
    },
  };
}

function getNextStep(session: DiagnosisSession): string {
  if (session.state === "scoping") {
    return `🔍 诊断工作流: ${session.workflow}\n目标: ${session.target}\n\n首先，让我们确认范围和当前状态。请运行 wing_get_status 确认设备连接状态。`;
  }

  const current = session.breakpoints.find((b) => b.status === "unknown");
  if (current) {
    const stepNum = session.breakpoints.filter((b) => b.status !== "unknown").length + 1;
    const total = session.breakpoints.length;
    return `📋 步骤 ${stepNum}/${total}: 检查 ${current.location}\n${current.detail}\n\n使用 wing_signal_check 或 wing_channel_get 读取相关状态。不要急于修改 mixer 设置。`;
  }

  const allPassed = session.breakpoints.every((b) => b.status === "pass");
  const failed = session.breakpoints.find((b) => b.status === "fail");

  if (failed || !allPassed) {
    return `⚠️ 断点分析完成。问题定位在: ${failed ? failed.location : "未知"}。\n\n建议修复: ${failed ? getFixSuggestion(failed.location) : "请运行更详细的信号检查"}\n\n在应用任何修改前，请先准备修复计划，不要直接执行。`;
  }

  return `✅ 所有检查通过。如果问题仍然存在，可能需要检查外部设备（功放、音箱、连接线、乐器、话筒）。`;
}

function getFixSuggestion(location: string): string {
  switch (location) {
    case "source":
      return "检查音源设备是否在工作（乐器输出、话筒连接、无线接收器）。这不是混音台的问题。";
    case "input_patch":
      return "检查输入路由，可能需要重新 patch source 到正确的 channel。";
    case "channel":
      return "通道可能被 mute 或推子拉下。准备 unmute 或调整 fader。";
    case "bus_send":
      return "发送量可能太低。准备调整 channel 到 bus 的 send level。";
    case "bus_main":
      return "母线或主输出可能被 mute。准备检查 bus/main mute 状态。";
    case "output":
      return "输出路由或外部设备问题。检查输出 patch 和外接功放/音箱的电源与连接。";
    case "monitor_level":
      return "监听音量过高导致反馈。准备降低监听 send level。";
    case "mic_placement":
      return "话筒位置导致反馈。让人调整话筒和音箱的相对位置。";
    case "eq_ringing":
      return "EQ 频率共振。准备调整 EQ 切除反馈频率。";
    default:
      return "运行更详细的 meter 和信号检查来定位问题。";
  }
}

function getNextActions(session: DiagnosisSession) {
  const current = session.breakpoints.find((b) => b.status === "unknown");
  if (current?.location === "channel" || current?.location === "bus_main") {
    return [
      { tool: "wing_meter_read", description: "Read meter levels for target" },
      { tool: "wing_signal_check", description: "Check if signal is present" },
      { tool: "wing_channel_get", description: "Get channel state" },
    ];
  }
  if (current?.location === "bus_send") {
    return [
      { tool: "wing_send_get", description: "Check send levels" },
      { tool: "wing_meter_read", description: "Read bus meter" },
    ];
  }
  return [
    { tool: "wing_meter_read", description: "Read relevant meters" },
    { tool: "wing_signal_check", description: "Check for signal presence" },
    { tool: "wing_channel_get", description: "Get channel/bus state" },
  ];
}

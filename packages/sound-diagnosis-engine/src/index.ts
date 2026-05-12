/**
 * Sound Diagnosis Engine - AI 调音师核心诊断引擎
 *
 * Structured state machine for diagnosing live sound problems:
 * - No sound (没声音)
 * - Feedback / ringing (反馈/啸叫)
 * - Monitor mix issues (耳返/监听问题)
 * - Recording no signal (录音无信号)
 * - Livestream no signal (直播无信号)
 *
 * This engine is used BY the AI agent through MCP tools. It provides
 * structured breakpoint analysis but never blindly modifies mixer state.
 */

export type DiagnosisWorkflow =
  | "no_sound"
  | "feedback"
  | "monitor_mix"
  | "recording_no_signal"
  | "livestream_no_signal";

export type BreakpointStatus = "unknown" | "pass" | "fail";
export type DiagnosisState =
  | "idle"
  | "scoping"
  | "signal_check"
  | "breakpoint_classify"
  | "recommend"
  | "fix_prepare"
  | "fix_apply"
  | "verify"
  | "closed";

export interface Breakpoint {
  location: string;
  status: BreakpointStatus;
  detail: string;
  recommendedTool?: string;
}

export interface DiagnosisSession {
  id: string;
  state: DiagnosisState;
  workflow: DiagnosisWorkflow;
  target: string;
  roomId?: string;
  description?: string;
  breakpoints: Breakpoint[];
  history: Array<{ state: DiagnosisState; timestamp: string; finding?: string }>;
  createdAt: string;
}

const WORKFLOW_BREAKPOINTS: Record<DiagnosisWorkflow, Breakpoint[]> = {
  no_sound: [
    { location: "source", status: "unknown", detail: "音源是否在产生信号？（乐器/话筒/无线接收器）", recommendedTool: "wing_signal_check" },
    { location: "input_patch", status: "unknown", detail: "输入是否 patch 到了正确的通道？", recommendedTool: "wing_routing_get" },
    { location: "channel", status: "unknown", detail: "通道是否静音？推子是否拉下？噪声门是否关得太紧？", recommendedTool: "wing_channel_get" },
    { location: "bus_send", status: "unknown", detail: "通道是否正确发送到目标母线？", recommendedTool: "wing_send_get" },
    { location: "bus_main", status: "unknown", detail: "母线/主输出是否静音或推子拉下？", recommendedTool: "wing_channel_get" },
    { location: "output", status: "unknown", detail: "输出路由是否正确？外部功放/音箱是否开启？", recommendedTool: "wing_routing_trace" },
  ],
  feedback: [
    { location: "monitor_level", status: "unknown", detail: "监听音量是否过高？", recommendedTool: "wing_send_get" },
    { location: "mic_placement", status: "unknown", detail: "话筒是否离音箱太近？" },
    { location: "eq_ringing", status: "unknown", detail: "EQ 频率是否引起共振？", recommendedTool: "wing_channel_get" },
    { location: "gain_staging", status: "unknown", detail: "增益结构是否过载？", recommendedTool: "wing_headamp_get" },
  ],
  monitor_mix: [
    { location: "send_level", status: "unknown", detail: "通道到监听母线的发送量是否正确？", recommendedTool: "wing_send_get" },
    { location: "bus_routing", status: "unknown", detail: "母线是否路由到正确的监听输出？", recommendedTool: "wing_routing_get" },
    { location: "bus_mute", status: "unknown", detail: "监听母线是否静音？", recommendedTool: "wing_channel_get" },
    { location: "pre_post", status: "unknown", detail: "发送是 Pre-fader 还是 Post-fader？是否正确？", recommendedTool: "wing_channel_get" },
  ],
  recording_no_signal: [
    { location: "recording_source", status: "unknown", detail: "录音源选择是否正确？（USB/Dante/直接输出）", recommendedTool: "wing_routing_get" },
    { location: "recording_level", status: "unknown", detail: "录音发送量是否足够？", recommendedTool: "wing_meter_read" },
    { location: "usb_routing", status: "unknown", detail: "USB/Dante 路由是否正确？", recommendedTool: "wing_routing_trace" },
  ],
  livestream_no_signal: [
    { location: "stream_source", status: "unknown", detail: "直播音频源选择是否正确？", recommendedTool: "wing_routing_get" },
    { location: "stream_matrix", status: "unknown", detail: "Matrix 混音是否包含所需通道？", recommendedTool: "wing_routing_trace" },
    { location: "output_patch", status: "unknown", detail: "输出是否 patch 到直播设备？", recommendedTool: "wing_routing_get" },
  ],
};

export function createDiagnosisSession(
  workflow: DiagnosisWorkflow,
  target: string,
  roomId?: string,
  description?: string
): DiagnosisSession {
  return {
    id: `diag_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    state: "scoping",
    workflow,
    target,
    roomId,
    description,
    breakpoints: WORKFLOW_BREAKPOINTS[workflow].map((bp) => ({ ...bp, status: "unknown" as const })),
    history: [
      {
        state: "scoping",
        timestamp: new Date().toISOString(),
        finding: `开始 ${workflow} 诊断 — 目标: ${target}`,
      },
    ],
    createdAt: new Date().toISOString(),
  };
}

export function getCurrentBreakpoint(session: DiagnosisSession): Breakpoint | null {
  return session.breakpoints.find((b) => b.status === "unknown") ?? null;
}

export function updateBreakpoint(
  session: DiagnosisSession,
  location: string,
  status: "pass" | "fail",
  detail?: string
): void {
  const bp = session.breakpoints.find((b) => b.location === location);
  if (bp) {
    bp.status = status;
    if (detail) bp.detail = detail;
    session.history.push({
      state: session.state,
      timestamp: new Date().toISOString(),
      finding: `${location}: ${status} — ${bp.detail}`,
    });
  }

  // Auto-advance state
  const nextUnknown = session.breakpoints.find((b) => b.status === "unknown");
  session.state = nextUnknown ? "signal_check" : "recommend";
}

export function classifyBreakpoint(session: DiagnosisSession): {
  breakpoint: Breakpoint | null;
  totalSteps: number;
  currentStep: number;
  message: string;
} {
  const current = getCurrentBreakpoint(session);
  const completedCount = session.breakpoints.filter((b) => b.status !== "unknown").length;
  const total = session.breakpoints.length;

  if (!current && session.state !== "recommend") {
    session.state = "recommend";
  }

  if (!current) {
    const failed = session.breakpoints.find((b) => b.status === "fail");
    const allPassed = session.breakpoints.every((b) => b.status === "pass");

    if (allPassed) {
      return {
        breakpoint: null,
        totalSteps: total,
        currentStep: total,
        message: "✅ 所有检查通过。如果问题仍然存在，请检查外部设备（功放、音箱、连接线、乐器、话筒）。",
      };
    }

    return {
      breakpoint: failed ?? null,
      totalSteps: total,
      currentStep: total,
      message: `⚠️ 断点分析完成。问题定位: ${failed?.location ?? "未知"}。\n\n${getFixSuggestion(failed?.location ?? "")}`,
    };
  }

  return {
    breakpoint: current,
    totalSteps: total,
    currentStep: completedCount + 1,
    message: `📋 步骤 ${completedCount + 1}/${total}: 检查 ${current.location}\n${current.detail}`,
  };
}

function getFixSuggestion(location: string): string {
  switch (location) {
    case "source":
      return "音源设备可能有问题。检查乐器输出、话筒连接、无线接收器。这不是调音台的问题。";
    case "input_patch":
      return "输入路由可能错误。使用 wing_routing_set_prepare 重新 patch source 到正确的 channel。";
    case "channel":
      return "通道被 mute 或推子拉下。使用 wing_channel_set_mute_prepare 或 wing_channel_adjust_fader_prepare 修复。";
    case "bus_send":
      return "发送量太低。使用 wing_send_adjust_prepare 提高 channel 到 bus 的发送量。";
    case "bus_main":
      return "母线或主输出被静音。检查 bus/main mute 状态并按需调整。";
    case "output":
      return "输出路由或外部设备问题。检查输出 patch 和外接功放/音箱的电源与连接。";
    case "monitor_level":
      return "监听音量过高。使用 wing_send_adjust_prepare 降低监听 send level。";
    case "mic_placement":
      return "话筒位置问题。让人调整话筒和音箱的相对位置（两者不要正对）。";
    case "eq_ringing":
      return "EQ 频率共振。使用 wing_param_set_prepare 调整对应通道的 EQ 切除反馈频率。";
    default:
      return "运行更详细的 meter 和信号检查来进一步定位问题。";
  }
}

export function formatDiagnosisSummary(session: DiagnosisSession): string {
  const lines: string[] = [
    `诊断会话: ${session.id}`,
    `工作流: ${session.workflow}`,
    `目标: ${session.target}`,
    `状态: ${session.state}`,
    `房间: ${session.roomId ?? "未指定"}`,
    `创建时间: ${session.createdAt}`,
    ``,
    "断点状态:",
  ];

  for (const bp of session.breakpoints) {
    const icon = bp.status === "pass" ? "✅" : bp.status === "fail" ? "❌" : "⬜";
    lines.push(`  ${icon} ${bp.location}: ${bp.detail}`);
  }

  return lines.join("\n");
}

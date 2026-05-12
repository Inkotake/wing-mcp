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
 *
 * Enhancements:
 * - Bayesian hypothesis scoring with probability updates
 * - Next-best-test scoring for action selection
 * - Breakpoint classification rules based on signal-flow observations
 * - Incident logging and summarization
 */

// ============================================================================
// TYPES
// ============================================================================

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

// ---------------------------------------------------------------------------
// NEW TYPES for enhanced diagnosis engine
// ---------------------------------------------------------------------------

/** A weighted hypothesis explaining a potential root cause. */
export interface Hypothesis {
  /** Unique identifier for this hypothesis (e.g. "hyp_no_input_0"). */
  id: string;
  /** Human-readable name (e.g. "source_or_cable"). */
  name: string;
  /** Bayesian probability estimate, 0.0 – 1.0. */
  probability: number;
  /** Observations that support this hypothesis. */
  evidence: string[];
  /** Observations that contradict this hypothesis. */
  contradicts: string[];
}

/** A single observation about the system state (meter reading, routing status, etc.). */
export interface Observation {
  type: "meter" | "routing" | "mute" | "fader" | "gate" | "phantom" | "external";
  /** Where the observation was taken (e.g. "input_ch1", "main_l"). */
  location: string;
  /** The observed value (number for meters, boolean for mutes, string for routing, etc.). */
  value: unknown;
  timestamp: string;
}

/** A candidate action the diagnosis engine can recommend. */
export interface DiagnosisAction {
  type: "check" | "fix" | "verify" | "consult";
  /** Human-readable description (e.g. "Check if microphone cable is connected"). */
  description: string;
  /** The MCP tool name to use, if applicable. */
  tool?: string;
  /** Parameters for the tool call, if applicable. */
  parameters?: Record<string, unknown>;
  /** Safety risk level of this action. */
  risk: "low" | "medium" | "high" | "critical";
}

/** A logged incident record capturing a complete diagnosis session outcome. */
export interface IncidentLog {
  id: string;
  timestamp: string;
  workflow: DiagnosisWorkflow;
  target: string;
  roomId?: string;
  /** How the incident was resolved, if resolved. */
  resolution?: string;
  /** Duration of the diagnosis session in milliseconds. */
  durationMs?: number;
  /** Hypotheses that were active during this incident. */
  hypotheses: Hypothesis[];
  /** Actions taken during diagnosis. */
  actions: DiagnosisAction[];
  /** Observations collected during the incident. */
  observations: Observation[];
  /** Final outcome classification. */
  outcome: "resolved" | "unresolved" | "partial" | "external";
}

/** The breakpoint category determined by signal-flow meter analysis. */
export type BreakpointCategory =
  | "no_input"
  | "no_post_fader"
  | "no_main_meter"
  | "no_room_sound";

// ============================================================================
// CONSTANTS
// ============================================================================

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

/** Prior probabilities for each hypothesis category. */
const HYPOTHESIS_PRIORS: Record<BreakpointCategory, Array<{ name: string; probability: number }>> = {
  no_input: [
    { name: "source_or_cable", probability: 0.45 },
    { name: "input_patch", probability: 0.25 },
    { name: "headamp_or_phantom", probability: 0.20 },
    { name: "stagebox_or_network", probability: 0.10 },
  ],
  no_post_fader: [
    { name: "channel_mute", probability: 0.35 },
    { name: "noise_gate_closed", probability: 0.25 },
    { name: "fader_down", probability: 0.25 },
    { name: "channel_routing", probability: 0.15 },
  ],
  no_main_meter: [
    { name: "dca_mute", probability: 0.30 },
    { name: "mute_group", probability: 0.25 },
    { name: "bus_send_missing", probability: 0.25 },
    { name: "bus_routing", probability: 0.20 },
  ],
  no_room_sound: [
    { name: "output_patch", probability: 0.40 },
    { name: "speaker_power", probability: 0.30 },
    { name: "amplifier", probability: 0.20 },
    { name: "cable_speaker", probability: 0.10 },
  ],
};

// ============================================================================
// MODULE-LEVEL STATE: Incident store
// ============================================================================

const incidentLog: IncidentLog[] = [];

// ============================================================================
// EXISTING FUNCTIONS (preserved from original)
// ============================================================================

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

// ============================================================================
// NEW: BAYESIAN HYPOTHESIS SCORING
// ============================================================================

/**
 * Generate initial hypotheses for a given breakpoint category.
 *
 * Each hypothesis is assigned a prior probability based on field data.
 * Observations can be added later to update probabilities via
 * {@link updateHypothesisProbability}.
 *
 * @param category - The breakpoint category determined by signal-flow analysis.
 * @param observations - Optional observations to immediately score against.
 * @returns An array of hypotheses sorted by descending probability.
 */
export function generateHypotheses(
  category: BreakpointCategory,
  _observations?: Observation[]
): Hypothesis[] {
  const priors = HYPOTHESIS_PRIORS[category];

  const hypotheses: Hypothesis[] = priors.map((h, i) => ({
    id: `hyp_${category}_${i}`,
    name: h.name,
    probability: h.probability,
    evidence: [],
    contradicts: [],
  }));

  // Sort by descending probability
  hypotheses.sort((a, b) => b.probability - a.probability);
  return hypotheses;
}

/**
 * Update a hypothesis probability using a simple Bayesian-style likelihood ratio.
 *
 * Evidence supporting the hypothesis multiplies its probability by 1.5 (up to 0.99);
 * contradicting evidence multiplies it by 0.5 (down to 0.01).
 *
 * @param hypothesis - The hypothesis to update.
 * @param observation - The observation applied as evidence.
 * @param supports - True if the observation supports the hypothesis, false if it contradicts it.
 * @returns A new Hypothesis object with the updated probability and evidence lists.
 */
export function updateHypothesisProbability(
  hypothesis: Hypothesis,
  observation: Observation,
  supports: boolean
): Hypothesis {
  const likelihoodRatio = supports ? 1.5 : 0.5;
  let newProbability = hypothesis.probability * likelihoodRatio;

  // Clamp to [0.01, 0.99] to avoid certainty
  newProbability = Math.max(0.01, Math.min(0.99, newProbability));

  return {
    ...hypothesis,
    probability: Number(newProbability.toFixed(4)),
    evidence: supports
      ? [...hypothesis.evidence, `${observation.type}:${observation.location}`]
      : hypothesis.evidence,
    contradicts: supports
      ? hypothesis.contradicts
      : [...hypothesis.contradicts, `${observation.type}:${observation.location}`],
  };
}

/**
 * Apply a batch of observations to a set of hypotheses, updating probabilities.
 *
 * Each observation is checked against each hypothesis name for keyword matches
 * to determine whether it supports or contradicts.
 *
 * @param hypotheses - The hypotheses to update.
 * @param observations - Observations to apply.
 * @returns A new array of updated hypotheses sorted by descending probability.
 */
export function scoreHypotheses(
  hypotheses: Hypothesis[],
  observations: Observation[]
): Hypothesis[] {
  let updated = [...hypotheses];

  for (const obs of observations) {
    updated = updated.map((h) => {
      // Simple keyword-based support/contradiction heuristic
      const nameLower = h.name.toLowerCase();
      const locLower = obs.location.toLowerCase();
      const valStr = String(obs.value ?? "").toLowerCase();

      // Determine if observation supports this hypothesis
      const supports =
        nameLower.includes(locLower) ||
        locLower.includes(nameLower) ||
        valStr.includes(nameLower);

      // Determine if observation contradicts (signal present where we expect none)
      const contradicts =
        !supports &&
        obs.type === "meter" &&
        obs.value !== 0 &&
        h.probability > 0.5;

      if (supports) {
        return updateHypothesisProbability(h, obs, true);
      } else if (contradicts) {
        return updateHypothesisProbability(h, obs, false);
      }
      return h;
    });
  }

  // Re-normalize so probabilities sum to ~1.0
  const total = updated.reduce((sum, h) => sum + h.probability, 0);
  if (total > 0) {
    updated = updated.map((h) => ({
      ...h,
      probability: Number((h.probability / total).toFixed(4)),
    }));
  }

  updated.sort((a, b) => b.probability - a.probability);
  return updated;
}

// ============================================================================
// NEW: NEXT-BEST-TEST SCORING
// ============================================================================

/**
 * Score a candidate diagnosis action using the multi-factor formula:
 *
 *   score = information_gain
 *         - risk_penalty
 *         - user_effort_penalty
 *         - time_penalty
 *         + reversibility_bonus
 *         + telemetry_confidence_bonus
 *
 * Higher scores indicate a better next test. Scores can be negative for
 * high-risk, high-effort actions with low diagnostic value.
 *
 * @param action - The candidate action to score.
 * @returns A numeric score (no fixed range; use for relative comparison).
 */
export function scoreNextTest(action: DiagnosisAction): number {
  // ---- Risk penalty: higher risk = larger penalty ----------
  const riskPenaltyMap: Record<DiagnosisAction["risk"], number> = {
    low: 0.5,
    medium: 1.5,
    high: 3.0,
    critical: 5.0,
  };

  // ---- Information gain: how much uncertainty this resolves ----------
  const infoGainMap: Record<DiagnosisAction["type"], number> = {
    check: 7.0,   // checking yields strong signal
    fix: 2.0,     // fixing isn't diagnostic
    verify: 5.0,  // verification confirms a diagnosis
    consult: 3.0, // consulting is indirect
  };

  // ---- User effort penalty: friction for the operator ----------
  const effortMap: Record<DiagnosisAction["type"], number> = {
    check: 1.0,
    fix: 2.0,
    verify: 1.0,
    consult: 2.5,
  };

  // ---- Time penalty: estimated minutes ----------
  const timeMap: Record<DiagnosisAction["type"], number> = {
    check: 1.0,
    fix: 2.0,
    verify: 1.5,
    consult: 2.0,
  };

  // ---- Reversibility bonus: can the action be undone easily? ----------
  const reversibleMap: Record<DiagnosisAction["type"], number> = {
    check: 2.5,   // checks are always reversible
    fix: 0.5,     // fixes may have side effects
    verify: 2.0,  // verification is reversible
    consult: 2.5, // consulting has no side effects
  };

  // ---- Telemetry confidence bonus: how reliable is the data source? ----------
  const telemetryMap: Record<DiagnosisAction["type"], number> = {
    check: 2.0,   // meter data is highly reliable
    fix: 0.5,     // applying a fix doesn't produce telemetry
    verify: 2.0,  // re-checking uses telemetry
    consult: 0.0, // no telemetry involved
  };

  const informationGain = infoGainMap[action.type];
  const riskPenalty = riskPenaltyMap[action.risk];
  const userEffortPenalty = effortMap[action.type];
  const timePenalty = timeMap[action.type];
  const reversibilityBonus = reversibleMap[action.type];
  const telemetryConfidenceBonus = telemetryMap[action.type];

  return (
    informationGain -
    riskPenalty -
    userEffortPenalty -
    timePenalty +
    reversibilityBonus +
    telemetryConfidenceBonus
  );
}

/**
 * Rank a list of candidate actions by their {@link scoreNextTest} result,
 * returning them sorted from highest to lowest score.
 *
 * @param actions - Candidate actions to rank.
 * @returns A new array sorted by descending score.
 */
export function rankActions(actions: DiagnosisAction[]): DiagnosisAction[] {
  return [...actions].sort((a, b) => scoreNextTest(b) - scoreNextTest(a));
}

/**
 * Select the single best next action from a list of candidates.
 *
 * @param actions - Candidate actions.
 * @returns The highest-scoring action, or null if the list is empty.
 */
export function selectBestAction(actions: DiagnosisAction[]): DiagnosisAction | null {
  if (actions.length === 0) return null;
  return rankActions(actions)[0];
}

// ============================================================================
// NEW: BREAKPOINT CLASSIFICATION BY SIGNAL-FLOW RULES
// ============================================================================

/**
 * Analyze a set of observations to determine which stage of the signal chain
 * is failing, and generate corresponding hypotheses.
 *
 * Classification rules (from diagnosis doc):
 *
 * | Condition                          | Category        | Hypotheses                              |
 * |------------------------------------|-----------------|-----------------------------------------|
 * | No input meter signal              | no_input        | source/cable, input patch, headamp, ... |
 * | Input present but no post-fader    | no_post_fader   | mute, noise gate, fader, routing        |
 * | Post-fader present but no main     | no_main_meter   | DCA mute, mute group, bus send, routing |
 * | Main meter present but no room     | no_room_sound   | output patch, speaker, amp, cable       |
 *
 * @param observations - The observations collected so far.
 * @returns The classification result including category, hypotheses, and affected breakpoints.
 */
export function classifyBreakpointsByRule(
  observations: Observation[]
): {
  category: BreakpointCategory;
  hypotheses: Hypothesis[];
  affectedBreakpoints: string[];
  description: string;
} {
  const hasInputMeter = observations.some(
    (o) => o.type === "meter" && o.location.includes("input") && isPositiveSignal(o.value)
  );
  const hasPostFader = observations.some(
    (o) => o.type === "meter" && o.location.includes("post_fader") && isPositiveSignal(o.value)
  );
  const hasMainMeter = observations.some(
    (o) => o.type === "meter" && o.location.includes("main") && isPositiveSignal(o.value)
  );
  const hasRoomSound = observations.some(
    (o) => o.type === "external" && o.location.includes("room") && isPositiveSignal(o.value)
  );

  let category: BreakpointCategory;
  let affectedBreakpoints: string[];
  let description: string;

  if (!hasInputMeter) {
    category = "no_input";
    affectedBreakpoints = ["source", "input_patch"];
    description =
      "No input meter signal detected. Problem is before the channel input strip. " +
      "Check source (instrument/mic/wireless), cable, input patch, headamp/phantom power, or stagebox/network.";
  } else if (!hasPostFader) {
    category = "no_post_fader";
    affectedBreakpoints = ["channel"];
    description =
      "Input meter shows signal but no post-fader output. " +
      "Check channel mute, noise gate threshold, fader position, and channel routing.";
  } else if (!hasMainMeter) {
    category = "no_main_meter";
    affectedBreakpoints = ["bus_send", "bus_main"];
    description =
      "Post-fader signal present but no main bus meter. " +
      "Check DCA assignments, mute group membership, bus send levels, and bus routing.";
  } else if (!hasRoomSound) {
    category = "no_room_sound";
    affectedBreakpoints = ["output"];
    description =
      "Main meter shows signal but no sound in the room. " +
      "Check output patch, speaker/amplifier power, and cable connections to speakers.";
  } else {
    // All checks passed — fall back to no_input as a safe default
    category = "no_input";
    affectedBreakpoints = [];
    description = "Signal flow appears intact at all measured points. Issue may be intermittent or external.";
  }

  const hypotheses = generateHypotheses(category, observations);

  return { category, hypotheses, affectedBreakpoints, description };
}

/**
 * Test whether an observation value represents a positive (non-zero, non-silent) signal.
 */
function isPositiveSignal(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "number") return value > -90; // dBFS threshold for "signal present"
  if (typeof value === "boolean") return value === true;
  if (typeof value === "string") return value.length > 0 && value.toLowerCase() !== "off" && value !== "0";
  return true; // truthy fallback
}

// ============================================================================
// NEW: INCIDENT LOGGING
// ============================================================================

/**
 * Log a completed (or abandoned) diagnosis session as an incident record.
 *
 * This captures the full context — hypotheses, actions taken, observations collected,
 * and the final outcome — for later analysis and pattern recognition.
 *
 * @param session - The completed diagnosis session.
 * @param observations - All observations collected during the session.
 * @param actions - All actions taken during the session.
 * @param outcome - Final outcome classification.
 * @param resolution - Optional description of how the issue was resolved.
 * @returns The newly created IncidentLog entry.
 */
export function logIncident(
  session: DiagnosisSession,
  observations: Observation[],
  actions: DiagnosisAction[],
  outcome: IncidentLog["outcome"],
  resolution?: string
): IncidentLog {
  const startTime = new Date(session.createdAt).getTime();
  const durationMs = Date.now() - startTime;

  // Derive hypotheses from session breakpoints
  const hypotheses: Hypothesis[] = session.breakpoints
    .filter((b) => b.status !== "unknown")
    .map((b, i) => ({
      id: `hyp_log_${i}`,
      name: b.location,
      probability: b.status === "fail" ? 0.8 : 0.1,
      evidence: [b.status],
      contradicts: [],
    }));

  const incident: IncidentLog = {
    id: `incident_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    workflow: session.workflow,
    target: session.target,
    roomId: session.roomId,
    resolution,
    durationMs,
    hypotheses,
    actions,
    observations,
    outcome,
  };

  incidentLog.push(incident);
  return incident;
}

/**
 * Summarize all logged incidents, optionally filtered.
 *
 * @param filter - Optional filter criteria.
 * @param filter.workflow - Filter by diagnosis workflow type.
 * @param filter.roomId - Filter by room identifier.
 * @param filter.startDate - ISO date string; only include incidents on or after this date.
 * @param filter.endDate - ISO date string; only include incidents on or before this date.
 * @returns Summary statistics and the 10 most recent matching incidents.
 */
export function summarizeIncidents(
  filter?: {
    workflow?: DiagnosisWorkflow;
    roomId?: string;
    startDate?: string;
    endDate?: string;
  }
): {
  total: number;
  resolved: number;
  unresolved: number;
  partial: number;
  external: number;
  averageDurationMs: number;
  byWorkflow: Record<string, number>;
  recentIncidents: IncidentLog[];
} {
  let filtered = incidentLog;

  if (filter?.workflow) {
    filtered = filtered.filter((i) => i.workflow === filter.workflow);
  }
  if (filter?.roomId) {
    filtered = filtered.filter((i) => i.roomId === filter.roomId);
  }
  if (filter?.startDate) {
    const start = new Date(filter.startDate).getTime();
    filtered = filtered.filter((i) => new Date(i.timestamp).getTime() >= start);
  }
  if (filter?.endDate) {
    const end = new Date(filter.endDate).getTime();
    filtered = filtered.filter((i) => new Date(i.timestamp).getTime() <= end);
  }

  const total = filtered.length;
  const resolved = filtered.filter((i) => i.outcome === "resolved").length;
  const unresolved = filtered.filter((i) => i.outcome === "unresolved").length;
  const partial = filtered.filter((i) => i.outcome === "partial").length;
  const external = filtered.filter((i) => i.outcome === "external").length;

  const averageDurationMs =
    total > 0
      ? Math.round(
          filtered.reduce((sum, i) => sum + (i.durationMs ?? 0), 0) / total
        )
      : 0;

  const byWorkflow: Record<string, number> = {};
  for (const i of filtered) {
    const key = String(i.workflow);
    byWorkflow[key] = (byWorkflow[key] ?? 0) + 1;
  }

  // Return the 10 most recent (by insertion order; incidents are appended chronologically)
  const recentIncidents = filtered.slice(-10);

  return {
    total,
    resolved,
    unresolved,
    partial,
    external,
    averageDurationMs,
    byWorkflow,
    recentIncidents,
  };
}

/**
 * Return the full incident log (since engine start / last reset).
 *
 * @returns All logged incidents in chronological order.
 */
export function getIncidentLog(): IncidentLog[] {
  return [...incidentLog];
}

/**
 * Clear the in-memory incident log. Useful for testing.
 */
export function clearIncidentLog(): void {
  incidentLog.length = 0;
}

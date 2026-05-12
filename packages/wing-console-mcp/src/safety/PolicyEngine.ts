import { Mode, Risk, ChangeRequest, PolicyDecision } from "../types.js";

const DELTA_CAPS: Record<string, number> = {
  channel_fader_db: 3.0,
  send_db: 6.0,
  main_fader_db: 1.5,
  eq_gain_db: 3.0,
  gate_threshold_db: 6.0,
};

export class PolicyEngine {
  constructor(
    private mode: Mode,
    private liveMode: boolean
  ) {}

  decide(req: ChangeRequest): PolicyDecision {
    // Read-only mode: deny all non-none risk writes
    if (this.mode === "read_only" && req.risk !== "none") {
      return {
        allowed: false,
        requiresConfirmation: false,
        reasons: ["System is in read-only mode. No writes allowed."],
      };
    }

    // Live mode: deny raw tools
    if (this.liveMode && req.tool.includes("raw")) {
      return {
        allowed: false,
        requiresConfirmation: false,
        reasons: ["Raw protocol tools are disabled in live mode."],
      };
    }

    // Rehearsal safe: allow up to medium, deny high/critical
    if (this.mode === "rehearsal_safe" && (req.risk === "high" || req.risk === "critical")) {
      return {
        allowed: false,
        requiresConfirmation: false,
        reasons: [
          `Action risk level "${req.risk}" exceeds rehearsal_safe maximum "medium". Switch to maintenance mode.`,
        ],
      };
    }

    // Check delta caps
    if (this.mode !== "developer_raw" && this.mode !== "maintenance") {
      const deltaLimit = this.getDeltaLimit(req);
      if (deltaLimit !== null) {
        const delta = this.computeDelta(req);
        if (Math.abs(delta) > deltaLimit) {
          return {
            allowed: false,
            requiresConfirmation: false,
            reasons: [
              `Delta ${delta.toFixed(1)} exceeds limit ${deltaLimit.toFixed(1)}. Please adjust in smaller steps.`,
            ],
          };
        }
      }
    }

    // Require confirmation based on risk
    const requiresConfirmation =
      this.mode === "maintenance"
        ? req.risk === "medium" || req.risk === "high" || req.risk === "critical"
        : this.mode === "developer_raw"
          ? req.risk === "medium" || req.risk === "high" || req.risk === "critical"
          : req.risk !== "none";

    return {
      allowed: true,
      requiresConfirmation,
      reasons: [],
    };
  }

  private getDeltaLimit(req: ChangeRequest): number | null {
    if (/channel.*fader/i.test(req.tool)) return DELTA_CAPS.channel_fader_db;
    if (/send.*adjust/i.test(req.tool)) return DELTA_CAPS.send_db;
    if (/main.*fader/i.test(req.tool)) return DELTA_CAPS.main_fader_db;
    if (/eq.*gain/i.test(req.tool)) return DELTA_CAPS.eq_gain_db;
    if (/gate.*threshold/i.test(req.tool)) return DELTA_CAPS.gate_threshold_db;
    return null;
  }

  private computeDelta(req: ChangeRequest): number {
    if (
      typeof req.oldValue === "object" &&
      req.oldValue !== null &&
      "type" in req.oldValue &&
      (req.oldValue as any).type === "float"
    ) {
      const oldV = (req.oldValue as any).value;
      const newV =
        typeof req.requestedValue === "object" && req.requestedValue !== null && "value" in req.requestedValue
          ? (req.requestedValue as any).value
          : req.requestedValue;
      if (typeof oldV === "number" && typeof newV === "number") {
        return newV - oldV;
      }
    }
    return 0;
  }
}

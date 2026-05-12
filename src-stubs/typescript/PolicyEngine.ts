export type Risk = "none" | "low" | "medium" | "high" | "critical";
export type Mode = "read_only" | "rehearsal_safe" | "maintenance" | "developer_raw";

export interface ChangeRequest {
  tool: string;
  target: string;
  oldValue: unknown;
  requestedValue: unknown;
  risk: Risk;
  reason: string;
}

export interface PolicyDecision {
  allowed: boolean;
  requiresConfirmation: boolean;
  exactConfirmationTemplate?: string;
  reasons: string[];
}

export class PolicyEngine {
  constructor(private mode: Mode, private liveMode: boolean) {}

  decide(req: ChangeRequest): PolicyDecision {
    if (this.mode === "read_only" && req.risk !== "none") {
      return { allowed: false, requiresConfirmation: false, reasons: ["read-only mode"] };
    }
    if (this.liveMode && req.tool.includes("raw")) {
      return { allowed: false, requiresConfirmation: false, reasons: ["raw tools disabled in live mode"] };
    }
    if (req.risk === "critical") {
      return { allowed: true, requiresConfirmation: true, reasons: ["critical action"] };
    }
    if (req.risk === "high" || req.risk === "medium") {
      return { allowed: true, requiresConfirmation: true, reasons: [`${req.risk} action`] };
    }
    return { allowed: true, requiresConfirmation: false, reasons: [] };
  }
}

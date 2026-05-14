import { WingDriver } from "../drivers/WingDriver.js";
import { PolicyEngine } from "./PolicyEngine.js";
import { RiskEngine } from "./RiskEngine.js";
import { ConfirmationManager, valuesEqual } from "./ConfirmationManager.js";
import { AuditLogger } from "./AuditLogger.js";
import { WingValue, Risk, Mode, ToolResult, AuditRecord } from "../types.js";

export interface BatchOperation {
  target: string;
  requestedValue: WingValue;
  reason: string;
}

export interface BatchResult {
  ok: boolean;
  operations: Array<{
    target: string;
    oldValue: WingValue;
    requestedValue: WingValue;
    readbackValue: WingValue;
    match: boolean;
    auditId?: string;
  }>;
  successCount: number;
  failCount: number;
  humanSummary: string;
}

/**
 * BatchChangePlanner — coordinates multi-target writes with per-target
 * read-before-write, readback, and audit. Used by Emergency Stop and any
 * future batch operations (scene recall, routing changes, etc.).
 */
export class BatchChangePlanner {
  constructor(
    private driver: WingDriver,
    private policyEngine: PolicyEngine,
    private riskEngine: RiskEngine,
    private confirmationManager: ConfirmationManager,
    private auditLogger: AuditLogger,
    private mode: Mode,
  ) {}

  /**
   * Save a snapshot of current values for all targets (used before emergency stop)
   */
  async saveSnapshot(targets: string[]): Promise<Array<{ path: string; oldValue: WingValue }>> {
    const snapshot: Array<{ path: string; oldValue: WingValue }> = [];
    for (const path of targets) {
      try {
        const oldVal = await this.driver.getParam(path);
        snapshot.push({ path, oldValue: oldVal });
      } catch {
        snapshot.push({ path, oldValue: { type: "bool", value: false } });
      }
    }
    return snapshot;
  }

  /**
   * Execute a batch of writes with per-target read-before-write, readback, and audit.
   * Used by Emergency Stop apply to ensure every target gets proper safety treatment.
   */
  async executeBatch(
    operations: BatchOperation[],
    toolName: string,
    confirmationId?: string,
    confirmationText?: string,
  ): Promise<BatchResult> {
    const results: BatchResult["operations"] = [];
    let successCount = 0;
    let failCount = 0;

    for (const op of operations) {
      const risk = this.riskEngine.classify(toolName, op.target);

      // Read before write
      let oldValue: WingValue;
      try {
        oldValue = await this.driver.getParam(op.target);
      } catch {
        results.push({
          target: op.target,
          oldValue: { type: "bool", value: false },
          requestedValue: op.requestedValue,
          readbackValue: { type: "bool", value: false },
          match: false,
        });
        failCount++;
        continue;
      }

      // Policy check
      const decision = this.policyEngine.decide({
        tool: toolName,
        target: op.target,
        oldValue,
        requestedValue: op.requestedValue,
        risk,
        reason: op.reason,
      });

      if (!decision.allowed) {
        this.auditLogger.log({
          mode: this.mode, risk, tool: toolName, target: op.target,
          reason: op.reason, oldValue, requestedValue: op.requestedValue,
          readbackValue: oldValue, confirmationText: confirmationText,
          confirmationId, result: "denied", driver: this.driver.kind,
        });
        failCount++;
        continue;
      }

      // Write
      try {
        await this.driver.setParam(op.target, op.requestedValue);
      } catch {
        this.auditLogger.log({
          mode: this.mode, risk, tool: toolName, target: op.target,
          reason: op.reason, oldValue, requestedValue: op.requestedValue,
          readbackValue: oldValue, confirmationText: confirmationText,
          confirmationId, result: "failed", driver: this.driver.kind,
        });
        failCount++;
        continue;
      }

      // Readback
      let readbackValue: WingValue;
      try {
        readbackValue = await this.driver.getParam(op.target);
      } catch {
        readbackValue = oldValue;
      }

      const match = valuesEqual(readbackValue, op.requestedValue);
      const auditRecord = this.auditLogger.log({
        mode: this.mode, risk, tool: toolName, target: op.target,
        reason: op.reason, oldValue, requestedValue: op.requestedValue,
        readbackValue, confirmationText: confirmationText, confirmationId,
        result: match ? "success" : "readback_mismatch", driver: this.driver.kind,
      });

      results.push({
        target: op.target,
        oldValue,
        requestedValue: op.requestedValue,
        readbackValue,
        match,
        auditId: auditRecord.id,
      });

      if (match) successCount++;
      else failCount++;
    }

    return {
      ok: failCount === 0,
      operations: results,
      successCount,
      failCount,
      humanSummary: failCount === 0
        ? `批量操作完成: ${successCount} 个目标全部成功`
        : `批量操作部分完成: ${successCount} 成功, ${failCount} 失败`,
    };
  }
}

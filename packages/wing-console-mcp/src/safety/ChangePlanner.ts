import { WingDriver } from "../drivers/WingDriver.js";
import { PolicyEngine } from "./PolicyEngine.js";
import { RiskEngine } from "./RiskEngine.js";
import { ConfirmationManager, valuesEqual } from "./ConfirmationManager.js";
import { AuditLogger } from "./AuditLogger.js";
import { Mode, ToolResult, WingValue } from "../types.js";

export interface WriteAction {
  path: string;
  value: WingValue;
}

export class ChangePlanner {
  constructor(
    private driver: WingDriver,
    private policyEngine: PolicyEngine,
    private riskEngine: RiskEngine,
    private confirmationManager: ConfirmationManager,
    private auditLogger: AuditLogger,
    private mode: Mode
  ) {}

  async prepareWrite(
    tool: string,
    target: string,
    requestedValue: WingValue,
    reason: string
  ): Promise<ToolResult> {
    // 1. Read old state
    let oldValue: WingValue;
    try {
      oldValue = await this.driver.getParam(target);
    } catch (e: any) {
      return {
        ok: false,
        errors: [{ code: "DEVICE_DISCONNECTED", message: e.message }],
        human_summary: `无法读取 ${target} 的当前值：${e.message}`,
      };
    }

    // 2. Classify risk
    const risk = this.riskEngine.classify(tool, target);

    // 3. Policy decision
    const decision = this.policyEngine.decide({ tool, target, oldValue, requestedValue, risk, reason });

    if (!decision.allowed) {
      this.auditLogger.log({
        mode: this.mode,
        risk,
        tool,
        target,
        reason,
        oldValue,
        requestedValue,
        readbackValue: oldValue,
        result: "denied",
        driver: this.driver.kind,
      });
      return {
        ok: false,
        errors: decision.reasons.map((r) => ({ code: "POLICY_DENIED" as const, message: r })),
        human_summary: `操作被拒绝：${decision.reasons.join("; ")}`,
      };
    }

    // 4. If no confirmation needed, apply directly
    if (!decision.requiresConfirmation) {
      return {
        ok: true,
        data: {
          target,
          oldValue,
          requestedValue,
          risk,
          needsConfirmation: false,
        },
        human_summary: `准备修改 ${target}，当前值 ${JSON.stringify(oldValue)} -> ${JSON.stringify(requestedValue)}，无需确认即可执行。`,
      };
    }

    // 5. Generate confirmation ticket
    const confirmationTemplate = this.riskEngine.getConfirmationTemplate(tool, risk, target);
    const ticket = this.confirmationManager.createTicket(
      tool,
      target,
      risk,
      oldValue,
      requestedValue,
      reason,
      confirmationTemplate
    );

    return {
      ok: true,
      data: {
        target,
        oldValue,
        requestedValue,
        risk,
        needsConfirmation: true,
        confirmationId: ticket.id,
        confirmationTemplate,
      },
      human_summary: `需要确认：${confirmationTemplate}\n确认ID: ${ticket.id}\n当前值: ${JSON.stringify(oldValue)} -> 目标值: ${JSON.stringify(requestedValue)}\n风险等级: ${risk}`,
    };
  }

  async applyWrite(
    tool: string,
    target: string,
    requestedValue: WingValue,
    reason: string,
    confirmationId: string | undefined,
    confirmationText?: string,
  ): Promise<ToolResult> {
    const risk = this.riskEngine.classify(tool, target);

    // Read current state (for old-value tracking AND state drift detection)
    let currentValue: WingValue;
    try {
      currentValue = await this.driver.getParam(target);
    } catch (e: any) {
      return {
        ok: false,
        errors: [{ code: "DEVICE_DISCONNECTED", message: e.message }],
        human_summary: `无法读取 ${target} 的当前值：${e.message}`,
      };
    }

    // Validate confirmation if required
    if (this.riskEngine.requiresConfirmation(risk)) {
      if (!confirmationId) {
        return {
          ok: false,
          errors: [{ code: "RISK_CONFIRMATION_REQUIRED", message: "Confirmation ID is required for this action." }],
          human_summary: `此操作需要确认ID。请先调用 prepare 获取确认。`,
        };
      }

      const validation = this.confirmationManager.validateTicket(
        confirmationId, tool, target,
        requestedValue,             // check value hasn't changed from prepare
        confirmationText,           // validate confirmation text for high/critical
        currentValue,               // detect material state change since prepare
      );
      if (!validation.valid) {
        const errorCode = validation.errorCode === "MATERIAL_STATE_CHANGED"
          ? "MATERIAL_STATE_CHANGED" as const
          : "RISK_CONFIRMATION_REQUIRED" as const;
        return {
          ok: false,
          errors: [{ code: errorCode, message: validation.error! }],
          human_summary: `确认验证失败：${validation.error}`,
        };
      }
    }

    // Policy check
    const decision = this.policyEngine.decide({ tool, target, oldValue: currentValue, requestedValue, risk, reason });
    if (!decision.allowed) {
      return {
        ok: false,
        errors: decision.reasons.map((r) => ({ code: "POLICY_DENIED" as const, message: r })),
        human_summary: `操作被策略拒绝：${decision.reasons.join("; ")}`,
      };
    }

    // Apply
    try {
      await this.driver.setParam(target, requestedValue);
    } catch (e: any) {
      this.auditLogger.log({
        mode: this.mode,
        risk,
        tool,
        target,
        reason,
        oldValue: currentValue,
        requestedValue,
        readbackValue: currentValue,
        confirmationText: confirmationText ?? confirmationId,
        result: "failed",
        driver: this.driver.kind,
      });
      return {
        ok: false,
        errors: [{ code: "PROTOCOL_ERROR", message: e.message }],
        human_summary: `写入失败：${e.message}`,
      };
    }

    // Readback
    let readbackValue: WingValue;
    try {
      readbackValue = await this.driver.getParam(target);
    } catch {
      readbackValue = currentValue;
    }

    // Check readback match (tolerant float comparison)
    const match = valuesEqual(readbackValue, requestedValue);
    const auditRecord = this.auditLogger.log({
      mode: this.mode,
      risk,
      tool,
      target,
      reason,
      oldValue: currentValue,
      requestedValue,
      readbackValue,
      confirmationText: confirmationText ?? confirmationId,
      result: match ? "success" : "readback_mismatch",
      driver: this.driver.kind,
    });

    // Consume the confirmation ticket if used
    if (confirmationId) {
      this.confirmationManager.consumeTicket(confirmationId);
    }

    if (!match) {
      return {
        ok: false,
        errors: [
          {
            code: "READBACK_MISMATCH",
            message: `回读值 ${JSON.stringify(readbackValue)} 与目标值 ${JSON.stringify(requestedValue)} 不匹配`,
          },
        ],
        data: { oldValue: currentValue, requestedValue, readbackValue, auditId: auditRecord.id },
        human_summary: `写入后回读不匹配！旧值: ${JSON.stringify(currentValue)}，目标: ${JSON.stringify(requestedValue)}，回读: ${JSON.stringify(readbackValue)}。审计ID: ${auditRecord.id}`,
      };
    }

    return {
      ok: true,
      data: { oldValue: currentValue, requestedValue, readbackValue, auditId: auditRecord.id },
      audit_id: auditRecord.id,
      human_summary: `已完成：${target} 从 ${formatValue(currentValue)} 调到 ${formatValue(requestedValue)}；WING 回读为 ${formatValue(readbackValue)}。审计编号: ${auditRecord.id}`,
    };
  }
}

function formatValue(v: unknown): string {
  if (typeof v === "object" && v !== null && "type" in v) {
    const wv = v as WingValue;
    if (wv.type === "float" && wv.unit) return `${wv.value.toFixed(1)} ${wv.unit}`;
    return `${wv.value}`;
  }
  return JSON.stringify(v);
}

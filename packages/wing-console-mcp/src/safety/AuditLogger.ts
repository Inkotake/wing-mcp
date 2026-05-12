import { v4 as uuidv4 } from "uuid";
import { AuditRecord, Mode, Risk, DriverKind } from "../types.js";

export class AuditLogger {
  private records: AuditRecord[] = [];
  private sessionId: string;

  constructor(sessionId?: string) {
    this.sessionId = sessionId ?? `sess_${Date.now()}`;
  }

  log(params: {
    mode: Mode;
    risk: Risk;
    tool: string;
    target: string;
    reason: string;
    oldValue: unknown;
    requestedValue: unknown;
    readbackValue: unknown;
    confirmationText?: string;
    result: AuditRecord["result"];
    driver: DriverKind;
    operatorId?: string;
  }): AuditRecord {
    const record: AuditRecord = {
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      session_id: this.sessionId,
      operator_id: params.operatorId,
      mode: params.mode,
      risk: params.risk,
      tool: params.tool,
      target: params.target,
      reason: params.reason,
      old_value: params.oldValue,
      requested_value: params.requestedValue,
      readback_value: params.readbackValue,
      confirmation_text: params.confirmationText,
      result: params.result,
      driver: params.driver,
    };
    this.records.push(record);
    return record;
  }

  getRecent(count: number = 20): AuditRecord[] {
    return this.records.slice(-count).reverse();
  }

  getBySession(sessionId: string): AuditRecord[] {
    return this.records.filter((r) => r.session_id === sessionId);
  }

  getAll(): AuditRecord[] {
    return [...this.records];
  }

  clear() {
    this.records = [];
  }
}

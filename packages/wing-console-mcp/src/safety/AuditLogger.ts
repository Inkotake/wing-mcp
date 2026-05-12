import { v4 as uuidv4 } from "uuid";
import * as fs from "node:fs";
import * as path from "node:path";
import { AuditRecord, Mode, Risk, DriverKind } from "../types.js";

export class AuditLogger {
  private records: AuditRecord[] = [];
  private sessionId: string;
  private auditDir: string;
  private writeStream: fs.WriteStream | null = null;
  private maxRecords = 100000; // cap in-memory records

  constructor(sessionId?: string, auditDir?: string) {
    this.sessionId = sessionId ?? `sess_${Date.now()}`;
    this.auditDir = auditDir ?? process.env.WING_AUDIT_PATH ?? path.join(process.cwd(), "data", "audit");
    this.ensureDir();
    this.openStream();
  }

  private ensureDir() {
    try {
      fs.mkdirSync(this.auditDir, { recursive: true });
    } catch {}
  }

  private openStream() {
    const today = new Date().toISOString().slice(0, 10);
    const filePath = path.join(this.auditDir, `${today}.jsonl`);
    this.writeStream = fs.createWriteStream(filePath, { flags: "a" });
  }

  private getTodayFile(): string {
    const today = new Date().toISOString().slice(0, 10);
    return path.join(this.auditDir, `${today}.jsonl`);
  }

  private rotateIfNeeded() {
    const expected = this.getTodayFile();
    const current = (this.writeStream as any)?.path;
    if (current !== expected) {
      this.writeStream?.end();
      this.openStream();
    }
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

    // In-memory
    this.records.push(record);
    if (this.records.length > this.maxRecords) {
      this.records = this.records.slice(-this.maxRecords / 2);
    }

    // Persist to JSONL
    try {
      this.rotateIfNeeded();
      const line = JSON.stringify(record) + "\n";
      this.writeStream?.write(line);
    } catch {
      // Don't crash if disk write fails — audit is best-effort persistence
    }

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

  /** Read audit records from disk for a date range */
  readFromDisk(since: string, until?: string): AuditRecord[] {
    const results: AuditRecord[] = [];
    try {
      const files = fs.readdirSync(this.auditDir).filter(f => f.endsWith(".jsonl")).sort();
      for (const file of files) {
        const dateStr = file.replace(".jsonl", "");
        if (dateStr < since) continue;
        if (until && dateStr > until) continue;
        const content = fs.readFileSync(path.join(this.auditDir, file), "utf-8");
        for (const line of content.split("\n")) {
          if (!line.trim()) continue;
          try {
            results.push(JSON.parse(line));
          } catch {}
        }
      }
    } catch {
      // Disk read is best-effort
    }
    return results;
  }

  clear() {
    this.records = [];
  }

  close() {
    this.writeStream?.end();
  }
}

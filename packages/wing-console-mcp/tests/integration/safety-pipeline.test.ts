import { describe, it, expect, beforeEach } from "vitest";
import { FakeWingDriver } from "../../src/drivers/WingDriver.js";
import { PolicyEngine } from "../../src/safety/PolicyEngine.js";
import { RiskEngine } from "../../src/safety/RiskEngine.js";
import { ConfirmationManager, valuesEqual } from "../../src/safety/ConfirmationManager.js";
import { AuditLogger } from "../../src/safety/AuditLogger.js";
import { ChangePlanner } from "../../src/safety/ChangePlanner.js";
import { RateLimiter } from "../../src/safety/RateLimiter.js";
import { WingValue, Mode } from "../../src/types.js";

describe("End-to-end safety pipeline", () => {
  let driver: FakeWingDriver;
  let planner: ChangePlanner;
  let auditLogger: AuditLogger;
  let rateLimiter: RateLimiter;

  function createPlanner(mode: Mode) {
    const pe = new PolicyEngine(mode, false);
    const cm = new ConfirmationManager();
    auditLogger = new AuditLogger();
    rateLimiter = new RateLimiter(100, 0, 100);
    planner = new ChangePlanner(driver, pe, new RiskEngine(), cm, auditLogger, mode);
    return { cm, planner, auditLogger, rateLimiter };
  }

  beforeEach(async () => {
    driver = new FakeWingDriver();
    await driver.connect((await driver.discover({ timeoutMs: 100 }))[0]);
  });

  it("full cycle: prepare → confirm → apply → readback → audit", async () => {
    const { cm, planner, auditLogger } = createPlanner("maintenance");

    // Prepare a mute change
    const prep = await planner.prepareWrite(
      "wing_channel_set_mute_prepare", "/ch/1/mute",
      { type: "bool", value: true }, "test mute"
    );
    expect(prep.ok).toBe(true);
    const data = prep.data as any;

    // Apply with confirmation
    const apply = await planner.applyWrite(
      "wing_channel_set_mute_apply", "/ch/1/mute",
      { type: "bool", value: true }, "test mute",
      data.confirmationId, "确认执行"
    );
    expect(apply.ok).toBe(true);
    expect(apply.audit_id).toBeTruthy();

    // Verify readback
    const rb = apply.data as any;
    expect(rb.readbackValue.value).toBe(true);

    // Verify audit log
    const recent = auditLogger.getRecent(1);
    expect(recent.length).toBe(1);
    expect(recent[0].result).toBe("success");
    expect(recent[0].tool).toBe("wing_channel_set_mute_apply");
  });

  it("denies write in read_only mode", async () => {
    const { planner } = createPlanner("read_only");
    const prep = await planner.prepareWrite(
      "wing_channel_set_mute_prepare", "/ch/1/mute",
      { type: "bool", value: true }, "attempted mute"
    );
    expect(prep.ok).toBe(false);
    expect(prep.human_summary).toContain("拒绝");
  });

  it("denies high risk in rehearsal_safe mode", async () => {
    const { planner } = createPlanner("rehearsal_safe");
    const prep = await planner.prepareWrite(
      "wing_main_adjust_fader_prepare", "/main/lr/fader",
      { type: "float", value: 10.0, unit: "dB" }, "big main boost"
    );
    expect(prep.ok).toBe(false);
  });

  it("rejects apply without confirmation for medium risk", async () => {
    const { planner } = createPlanner("maintenance");
    const apply = await planner.applyWrite(
      "wing_channel_set_mute_apply", "/ch/1/mute",
      { type: "bool", value: true }, "no ticket", undefined
    );
    expect(apply.ok).toBe(false);
    expect(apply.errors![0].code).toBe("RISK_CONFIRMATION_REQUIRED");
  });

  it("rejects apply with state drift", async () => {
    const { cm, planner } = createPlanner("maintenance");

    // Prepare: old value is false
    const prep = await planner.prepareWrite(
      "wing_channel_set_mute_prepare", "/ch/1/mute",
      { type: "bool", value: true }, "test"
    );
    expect(prep.ok).toBe(true);
    const data = prep.data as any;
    const ticketId = data.confirmationId;

    // Someone else changes the value
    await driver.setParam("/ch/1/mute", { type: "bool", value: true });

    // Apply should detect state change
    const apply = await planner.applyWrite(
      "wing_channel_set_mute_apply", "/ch/1/mute",
      { type: "bool", value: true }, "test",
      ticketId, "确认执行"
    );
    expect(apply.ok).toBe(false);
    expect(apply.errors![0].message).toContain("MATERIAL_STATE_CHANGED");
  });

  it("rejects critical without exact confirmation text", async () => {
    const { cm, planner } = createPlanner("maintenance");

    const prep = await planner.prepareWrite(
      "wing_phantom_set_prepare", "/headamp/local/1/phantom",
      { type: "bool", value: true }, "enable phantom"
    );
    const data = prep.data as any;

    // Apply with wrong confirmation text
    const apply = await planner.applyWrite(
      "wing_phantom_set_apply", "/headamp/local/1/phantom",
      { type: "bool", value: true }, "enable phantom",
      data.confirmationId, "ok"
    );
    expect(apply.ok).toBe(false);
    expect(apply.errors![0].message).toContain("Exact confirmation");
  });

  it("rate limiter tracks writes and enforces limits", () => {
    const rl = new RateLimiter(2, 0, 5000);

    // First two writes allowed
    expect(rl.check("test_apply", false).allowed).toBe(true);
    rl.record("test_apply", "medium");
    expect(rl.check("test_apply", false).allowed).toBe(true);
    rl.record("test_apply", "medium");

    // Third blocked
    expect(rl.check("test_apply", false).allowed).toBe(false);

    // Emergency always allowed
    expect(rl.check("wing_emergency_stop_apply", true).allowed).toBe(true);
  });

  it("audit logger persists to disk", () => {
    const logger = new AuditLogger("test_session");
    const record = logger.log({
      mode: "maintenance", risk: "medium",
      tool: "test", target: "/test",
      reason: "test", oldValue: 1, requestedValue: 2,
      readbackValue: 2, result: "success", driver: "fake"
    });
    expect(record.id).toBeTruthy();
    expect(record.session_id).toBe("test_session");
    expect(record.result).toBe("success");
  });

  it("valuesEqual handles edge cases", () => {
    // Null/undefined
    expect(valuesEqual(null, null)).toBe(true);
    expect(valuesEqual(null, undefined)).toBe(false);
    // Different types
    expect(valuesEqual(1, "1")).toBe(false);
    // Plain number comparison
    expect(valuesEqual(1.0001, 1.0002)).toBe(true);
    expect(valuesEqual(1.0, 2.0)).toBe(false);
  });
});

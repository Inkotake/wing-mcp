import { describe, it, expect, beforeEach } from "vitest";
import { RiskEngine } from "../../src/safety/RiskEngine.js";
import { PolicyEngine } from "../../src/safety/PolicyEngine.js";
import { ConfirmationManager } from "../../src/safety/ConfirmationManager.js";
import { AuditLogger } from "../../src/safety/AuditLogger.js";
import { ChangeRequest, Risk, Mode } from "../../src/types.js";

describe("RiskEngine", () => {
  const engine = new RiskEngine();

  it("classifies read tools as none risk", () => {
    expect(engine.classify("wing_discover")).toBe("none");
    expect(engine.classify("wing_channel_get")).toBe("none");
    expect(engine.classify("wing_signal_check")).toBe("none");
  });

  it("classifies channel fader as medium risk", () => {
    expect(engine.classify("wing_channel_adjust_fader_prepare")).toBe("medium");
    expect(engine.classify("wing_channel_set_mute_prepare")).toBe("medium");
  });

  it("classifies routing and phantom as critical", () => {
    expect(engine.classify("wing_routing_set_prepare")).toBe("critical");
    expect(engine.classify("wing_phantom_set_prepare")).toBe("critical");
    expect(engine.classify("wing_scene_recall_prepare")).toBe("critical");
  });

  it("elevates risk based on target keywords", () => {
    expect(engine.classify("wing_param_set_prepare", "/headamp/local/1/phantom")).toBe("critical");
    expect(engine.classify("wing_param_set_prepare", "/main/lr/mute")).toBe("high");
    expect(engine.classify("wing_param_set_prepare", "/routing/out/1")).toBe("critical");
  });

  it("requires confirmation for medium and above", () => {
    expect(engine.requiresConfirmation("none")).toBe(false);
    expect(engine.requiresConfirmation("medium")).toBe(true);
    expect(engine.requiresConfirmation("high")).toBe(true);
    expect(engine.requiresConfirmation("critical")).toBe(true);
  });

  it("generates appropriate confirmation templates", () => {
    const phantomTpl = engine.getConfirmationTemplate("wing_phantom_set_prepare", "critical", "/headamp/local/1/phantom");
    expect(phantomTpl).toContain("48V");
    expect(phantomTpl).toContain("幻象电源");

    const sceneTpl = engine.getConfirmationTemplate("wing_scene_recall_prepare", "critical", "Scene 5");
    expect(sceneTpl).toContain("recall");
    expect(sceneTpl).toContain("改变");

    const routingTpl = engine.getConfirmationTemplate("wing_routing_set_prepare", "critical", "/routing/out/1");
    expect(routingTpl).toContain("路由");
    expect(routingTpl).toContain("主扩或耳返");
  });
});

describe("PolicyEngine", () => {
  it("denies all writes in read_only mode", () => {
    const pe = new PolicyEngine("read_only", false);
    const req: ChangeRequest = {
      tool: "wing_channel_set_mute_prepare",
      target: "/ch/1/mute",
      oldValue: false,
      requestedValue: true,
      risk: "medium",
      reason: "test",
    };
    const decision = pe.decide(req);
    expect(decision.allowed).toBe(false);
    expect(decision.reasons[0]).toMatch(/read.only/i);
  });

  it("allows medium risk in rehearsal_safe mode", () => {
    const pe = new PolicyEngine("rehearsal_safe", false);
    const req: ChangeRequest = {
      tool: "wing_channel_adjust_fader_prepare",
      target: "/ch/1/fader",
      oldValue: -10,
      requestedValue: -7,
      risk: "medium",
      reason: "test",
    };
    const decision = pe.decide(req);
    expect(decision.allowed).toBe(true);
    expect(decision.requiresConfirmation).toBe(true);
  });

  it("denies high risk in rehearsal_safe mode", () => {
    const pe = new PolicyEngine("rehearsal_safe", false);
    const req: ChangeRequest = {
      tool: "wing_main_adjust_fader_prepare",
      target: "/main/lr/fader",
      oldValue: 0,
      requestedValue: 3,
      risk: "high",
      reason: "test",
    };
    const decision = pe.decide(req);
    expect(decision.allowed).toBe(false);
  });

  it("denies raw tools in live mode", () => {
    const pe = new PolicyEngine("maintenance", true);
    const req: ChangeRequest = {
      tool: "wing_raw_osc_prepare",
      target: "/raw/osc/test",
      oldValue: null,
      requestedValue: null,
      risk: "critical",
      reason: "test",
    };
    const decision = pe.decide(req);
    expect(decision.allowed).toBe(false);
    expect(decision.reasons[0]).toMatch(/raw/i);
  });

  it("allows all risks in developer_raw mode (not live)", () => {
    const pe = new PolicyEngine("developer_raw", false);
    const req: ChangeRequest = {
      tool: "wing_raw_osc_prepare",
      target: "/raw/osc/test",
      oldValue: null,
      requestedValue: null,
      risk: "critical",
      reason: "dev test",
    };
    const decision = pe.decide(req);
    expect(decision.allowed).toBe(true);
  });

  it("enforces delta caps in rehearsal mode", () => {
    const pe = new PolicyEngine("rehearsal_safe", false);
    const req: ChangeRequest = {
      tool: "wing_channel_adjust_fader_prepare",
      target: "/ch/1/fader",
      oldValue: { type: "float", value: -10.0, unit: "dB" },
      requestedValue: { type: "float", value: -2.0, unit: "dB" },
      risk: "medium",
      reason: "too big delta",
    };
    const decision = pe.decide(req);
    expect(decision.allowed).toBe(false);
    expect(decision.reasons[0]).toContain("exceeds");
  });
});

describe("ConfirmationManager", () => {
  let cm: ConfirmationManager;

  beforeEach(() => {
    cm = new ConfirmationManager();
  });

  it("creates valid confirmation tickets", () => {
    const ticket = cm.createTicket(
      "wing_channel_set_mute_prepare",
      "/ch/1/mute",
      "medium",
      false,
      true,
      "test mute",
      "确认操作"
    );
    expect(ticket.id).toBeTruthy();
    expect(ticket.tool).toBe("wing_channel_set_mute_prepare");
    expect(ticket.target).toBe("/ch/1/mute");
    expect(ticket.expiresAt).toBeGreaterThan(Date.now());
  });

  it("validates matching tickets", () => {
    const ticket = cm.createTicket("test_tool", "target", "medium", 1, 2, "reason", "confirm");
    const result = cm.validateTicket(ticket.id, "test_tool", "target");
    expect(result.valid).toBe(true);
  });

  it("rejects tool mismatch", () => {
    const ticket = cm.createTicket("tool_a", "target", "medium", 1, 2, "reason", "confirm");
    const result = cm.validateTicket(ticket.id, "tool_b", "target");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("mismatch");
  });

  it("rejects target mismatch", () => {
    const ticket = cm.createTicket("tool_a", "target_a", "medium", 1, 2, "reason", "confirm");
    const result = cm.validateTicket(ticket.id, "tool_a", "target_b");
    expect(result.valid).toBe(false);
  });

  it("rejects expired tickets", () => {
    const ticket = cm.createTicket("tool", "target", "medium", 1, 2, "reason", "confirm");
    // Manually expire
    (ticket as any).expiresAt = Date.now() - 1000;
    const result = cm.validateTicket(ticket.id, "tool", "target");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("expired");
  });

  it("consumes and removes tickets", () => {
    const ticket = cm.createTicket("tool", "target", "medium", 1, 2, "reason", "confirm");
    const consumed = cm.consumeTicket(ticket.id);
    expect(consumed).toBeTruthy();
    // Second consume should be undefined
    const second = cm.consumeTicket(ticket.id);
    expect(second).toBeUndefined();
  });
});

describe("AuditLogger", () => {
  it("logs audit records with all fields", () => {
    const logger = new AuditLogger("test_session");
    const record = logger.log({
      mode: "rehearsal_safe",
      risk: "medium",
      tool: "wing_channel_set_mute_apply",
      target: "/ch/1/mute",
      reason: "mute vocal",
      oldValue: false,
      requestedValue: true,
      readbackValue: true,
      result: "success",
      driver: "fake",
    });

    expect(record.id).toBeTruthy();
    expect(record.session_id).toBe("test_session");
    expect(record.tool).toBe("wing_channel_set_mute_apply");
    expect(record.result).toBe("success");
  });

  it("logs denial records", () => {
    const logger = new AuditLogger();
    const record = logger.log({
      mode: "read_only",
      risk: "medium",
      tool: "wing_channel_adjust_fader_prepare",
      target: "/ch/1/fader",
      reason: "attempted write in read-only",
      oldValue: 0,
      requestedValue: 3,
      readbackValue: 0,
      result: "denied",
      driver: "fake",
    });
    expect(record.result).toBe("denied");
  });

  it("retrieves recent records", () => {
    const logger = new AuditLogger();
    for (let i = 0; i < 25; i++) {
      logger.log({
        mode: "rehearsal_safe",
        risk: "low",
        tool: "test",
        target: "test",
        reason: "test",
        oldValue: i,
        requestedValue: i + 1,
        readbackValue: i + 1,
        result: "success",
        driver: "fake",
      });
    }
    const recent = logger.getRecent(20);
    expect(recent.length).toBe(20);
  });
});

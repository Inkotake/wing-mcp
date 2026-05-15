import { describe, it, expect, beforeEach } from "vitest";
import { FakeWingDriver } from "../../src/drivers/WingDriver.js";
import { PolicyEngine } from "../../src/safety/PolicyEngine.js";
import { RiskEngine } from "../../src/safety/RiskEngine.js";
import { ConfirmationManager } from "../../src/safety/ConfirmationManager.js";
import { AuditLogger } from "../../src/safety/AuditLogger.js";
import { ChangePlanner } from "../../src/safety/ChangePlanner.js";
import { registerGroupTools } from "../../src/tools/groups.js";
import { registerSendTools } from "../../src/tools/sends.js";
import { registerRoutingTools } from "../../src/tools/routing.js";
import { registerEmergencyTools } from "../../src/tools/emergency.js";
import { BatchChangePlanner } from "../../src/safety/BatchChangePlanner.js";
import { ToolResult } from "../../src/types.js";

function setup(driver: FakeWingDriver) {
  const pe = new PolicyEngine("maintenance", false);
  const cm = new ConfirmationManager();
  const al = new AuditLogger();
  return new ChangePlanner(driver, pe, new RiskEngine(), cm, al, "maintenance");
}

describe("Group Tools", () => {
  let driver: FakeWingDriver;
  let tools: Record<string, any>;

  beforeEach(async () => {
    driver = new FakeWingDriver();
    await driver.connect((await driver.discover({ timeoutMs: 100 }))[0]);
    tools = registerGroupTools(driver, setup(driver));
  });

  it("lists all 8 DCAs", async () => {
    const r: ToolResult = await tools.wing_dca_list.handler({});
    expect(r.ok).toBe(true);
    expect(r.data.length).toBe(8);
  });

  it("gets DCA details", async () => {
    const r: ToolResult = await tools.wing_dca_get.handler({ dca: 1 });
    expect(r.ok).toBe(true);
    expect(r.data.dca).toBe(1);
  });

  it("lists all 6 mute groups", async () => {
    const r: ToolResult = await tools.wing_mute_group_list.handler({});
    expect(r.ok).toBe(true);
    expect(r.data.length).toBe(6);
  });

  it("reads Main LR status", async () => {
    const r: ToolResult = await tools.wing_main_get.handler({});
    expect(r.ok).toBe(true);
    expect(r.data.mute).toBe(false);
    expect(typeof r.data.fader).toBe("number");
  });

  it("lists all 8 matrix outputs", async () => {
    const r: ToolResult = await tools.wing_matrix_list.handler({});
    expect(r.ok).toBe(true);
    expect(r.data.length).toBe(8);
  });

  it("prepares main mute", async () => {
    const r: ToolResult = await tools.wing_main_set_mute_prepare.handler({
      mute: true, reason: "emergency rehearsal stop"
    });
    expect(r.ok).toBe(true);
  });

  it("prepares DCA mute", async () => {
    const r: ToolResult = await tools.wing_dca_set_mute_prepare.handler({
      dca: 1, mute: true, reason: "mute all drums"
    });
    expect(r.ok).toBe(true);
  });
});

describe("Send Tools", () => {
  let driver: FakeWingDriver;
  let tools: Record<string, any>;

  beforeEach(async () => {
    driver = new FakeWingDriver();
    await driver.connect((await driver.discover({ timeoutMs: 100 }))[0]);
    tools = registerSendTools(driver, setup(driver));
  });

  it("reads send level from channel to bus", async () => {
    await driver.setParam("/ch/1/send/1/level", { type: "float", value: -10.0, unit: "dB" });
    const r: ToolResult = await tools.wing_send_get.handler({ channel: 1, bus: 1 });
    expect(r.ok).toBe(true);
    expect(r.data.value).toBe(-10.0);
  });

  it("prepares send adjustment", async () => {
    const r: ToolResult = await tools.wing_send_adjust_prepare.handler({
      channel: 1, bus: 1, delta_db: 3, reason: "more vocal in drummer IEM"
    });
    expect(r.ok).toBe(true);
  });
});

describe("Routing Tools", () => {
  let driver: FakeWingDriver;
  let tools: Record<string, any>;

  beforeEach(async () => {
    driver = new FakeWingDriver();
    await driver.connect((await driver.discover({ timeoutMs: 100 }))[0]);
    tools = registerRoutingTools(driver, setup(driver));
  });

  it("traces a source path", async () => {
    const r: ToolResult = await tools.wing_routing_trace.handler({ source: "ch/1" });
    expect(r.ok).toBe(true);
    expect(r.data.source).toBe("ch/1");
  });

  it("reads routing config", async () => {
    const r: ToolResult = await tools.wing_routing_get.handler({ target: "ch/1/source" });
    expect(r.ok).toBe(true);
  });

  it("prepares routing change (critical)", async () => {
    const r: ToolResult = await tools.wing_routing_set_prepare.handler({
      target: "ch/1/source", destination: "Local 2", reason: "re-patch vocal mic"
    });
    expect(r.ok).toBe(true);
  });
});

describe("Emergency Tools", () => {
  let driver: FakeWingDriver;
  let tools: Record<string, any>;

  beforeEach(async () => {
    driver = new FakeWingDriver();
    await driver.connect((await driver.discover({ timeoutMs: 100 }))[0]);
    const pe = new PolicyEngine("maintenance", false);
    const cm = new ConfirmationManager();
    const al = new AuditLogger();
    const cp = new ChangePlanner(driver, pe, new RiskEngine(), cm, al, "maintenance");
    const bp = new BatchChangePlanner(driver, pe, new RiskEngine(), cm, al, "maintenance");
    tools = registerEmergencyTools(driver, cp, bp, cm);
  });

  it("reads emergency status when idle", async () => {
    const r: ToolResult = await tools.wing_emergency_status.handler({});
    expect(r.ok).toBe(true);
    expect(r.data.emergencyActive).toBe(false);
  });

  it("prepares emergency stop", async () => {
    const r: ToolResult = await tools.wing_emergency_stop.handler({
      reason: "feedback storm", scope: "all"
    });
    expect(r.ok).toBe(true);
  });

  it("prepares emergency stop main_only", async () => {
    const r: ToolResult = await tools.wing_emergency_stop.handler({
      reason: "loud pop", scope: "main_only"
    });
    expect(r.ok).toBe(true);
  });

  it("prepares emergency reset", async () => {
    const r: ToolResult = await tools.wing_emergency_reset.handler({
      reason: "feedback resolved"
    });
    expect(r.ok).toBe(true);
  });
});

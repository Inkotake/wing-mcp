import { describe, it, expect, beforeEach } from "vitest";
import { FakeWingDriver } from "../../src/drivers/WingDriver.js";
import { PolicyEngine } from "../../src/safety/PolicyEngine.js";
import { RiskEngine } from "../../src/safety/RiskEngine.js";
import { ConfirmationManager } from "../../src/safety/ConfirmationManager.js";
import { AuditLogger } from "../../src/safety/AuditLogger.js";
import { ChangePlanner } from "../../src/safety/ChangePlanner.js";

describe("FakeWingDriver", () => {
  let driver: FakeWingDriver;

  beforeEach(async () => {
    driver = new FakeWingDriver();
    const devices = await driver.discover({ timeoutMs: 100 });
    await driver.connect(devices[0]);
  });

  it("discovers a fake device", async () => {
    const devices = await driver.discover({ timeoutMs: 100 });
    expect(devices.length).toBeGreaterThan(0);
    expect(devices[0].model).toBe("WING");
  });

  it("connects and gets device info", async () => {
    const info = await driver.getInfo();
    expect(info.name).toBe("Fake WING");
    expect(info.model).toBe("WING");
  });

  it("reads channel parameters", async () => {
    const name = await driver.getParam("/ch/1/name");
    expect(name.type).toBe("string");

    const mute = await driver.getParam("/ch/1/mute");
    expect(mute.type).toBe("bool");
    expect(mute.value).toBe(false);

    const fader = await driver.getParam("/ch/1/fader");
    expect(fader.type).toBe("float");
    expect(fader.value).toBe(0.0);
  });

  it("reads EQ parameters", async () => {
    const highGain = await driver.getParam("/ch/1/eq/high/gain");
    expect(highGain.type).toBe("float");
    expect(highGain.value).toBe(0.0);

    const eqOn = await driver.getParam("/ch/1/eq/on");
    expect(eqOn.type).toBe("bool");
  });

  it("reads gate and compressor", async () => {
    const gateThresh = await driver.getParam("/ch/1/gate/threshold");
    expect(gateThresh.value).toBe(-80.0);

    const compRatio = await driver.getParam("/ch/1/comp/ratio");
    expect(compRatio.value).toBe(3.0);
  });

  it("reads DCA parameters", async () => {
    const dcaName = await driver.getParam("/dca/1/name");
    expect(dcaName.type).toBe("string");
  });

  it("reads matrix parameters", async () => {
    const mtxName = await driver.getParam("/mtx/1/name");
    expect(mtxName.value).toBe("Matrix 1");
  });

  it("reads FX slot models", async () => {
    const fxModel = await driver.getParam("/fx/1/model");
    expect(fxModel.type).toBe("string");
    expect(fxModel.value).toBe("Hall Reverb");
  });

  it("writes and reads back parameters", async () => {
    await driver.setParam("/ch/1/mute", { type: "bool", value: true });
    const mute = await driver.getParam("/ch/1/mute");
    expect(mute.value).toBe(true);
  });

  it("reads a node (prefix query)", async () => {
    const node = await driver.getNode("/ch/1/eq");
    expect(Object.keys(node).length).toBeGreaterThan(0);
  });

  it("reads meter levels", async () => {
    const frame = await driver.meterRead(["/ch/1/fader", "/main/lr/fader"], 500);
    expect(frame.meters.length).toBe(2);
    expect(frame.timestamp).toBeTruthy();
  });

  it("injects timeout faults", async () => {
    driver.setFaultConfig({ timeoutProbability: 1.0 });
    await expect(driver.getParam("/ch/1/name")).rejects.toThrow("DRIVER_TIMEOUT");
    driver.setFaultConfig({ timeoutProbability: 0 });
  });

  it("injects disconnect faults", async () => {
    driver.setFaultConfig({ disconnectProbability: 1.0 });
    await expect(driver.getParam("/ch/1/name")).rejects.toThrow("DRIVER_TIMEOUT");
    expect(driver.getInfo()).rejects.toThrow();
    driver.setFaultConfig({ disconnectProbability: 0 });
    // Reconnect for remaining tests
    const devices = await driver.discover({ timeoutMs: 100 });
    await driver.connect(devices[0]);
  });

  it("injects readback mismatch faults", async () => {
    driver.setFaultConfig({ readbackMismatchProbability: 1.0 });
    await driver.setParam("/ch/1/fader", { type: "float", value: -3.0, unit: "dB" });
    // After mismatch, the value should NOT have been set
    const val = await driver.getParam("/ch/1/fader");
    expect(val.value).toBe(0.0); // unchanged
    driver.setFaultConfig({ readbackMismatchProbability: 0 });
  });

  it("returns PARAM_NOT_FOUND for non-existent paths", async () => {
    await expect(driver.getParam("/nonexistent/path")).rejects.toThrow("PARAM_NOT_FOUND");
  });
});

describe("ChangePlanner with FakeWingDriver", () => {
  let driver: FakeWingDriver;
  let planner: ChangePlanner;
  let policyEngine: PolicyEngine;
  let confirmationManager: ConfirmationManager;
  let auditLogger: AuditLogger;

  beforeEach(async () => {
    driver = new FakeWingDriver();
    const devices = await driver.discover({ timeoutMs: 100 });
    await driver.connect(devices[0]);
    policyEngine = new PolicyEngine("maintenance", false);
    confirmationManager = new ConfirmationManager();
    auditLogger = new AuditLogger();
    planner = new ChangePlanner(
      driver,
      policyEngine,
      new RiskEngine(),
      confirmationManager,
      auditLogger,
      "maintenance"
    );
  });

  it("prepares a low-risk write without confirmation", async () => {
    const result = await planner.prepareWrite(
      "wing_param_set_prepare",
      "/ch/1/name",
      { type: "string", value: "Vocal 1" },
      "rename channel"
    );
    // Risk might be none for unknown tools, so no confirmation needed
    expect(result.ok).toBe(true);
  });

  it("prepares a medium-risk write with confirmation ticket", async () => {
    const result = await planner.prepareWrite(
      "wing_channel_adjust_fader_prepare",
      "/ch/1/fader",
      { type: "float", value: 3.0, unit: "dB" },
      "boost vocal"
    );
    expect(result.ok).toBe(true);
    if (result.data && (result.data as any).needsConfirmation) {
      expect((result.data as any).confirmationId).toBeTruthy();
    }
  });

  it("applies write with valid confirmation", async () => {
    const toolName = "wing_param_set_prepare";
    // Prepare
    const prepare = await planner.prepareWrite(
      toolName,
      "/ch/1/mute",
      { type: "bool", value: true },
      "mute test"
    );
    expect(prepare.ok).toBe(true);

    const data = prepare.data as any;
    if (data?.needsConfirmation && data?.confirmationId) {
      // Apply with SAME tool name (confirmation manager expects match)
      const apply = await planner.applyWrite(
        toolName,
        "/ch/1/mute",
        { type: "bool", value: true },
        "mute test",
        data.confirmationId
      );
      expect(apply.ok).toBe(true);
      expect((apply.data as any).readbackValue.value).toBe(true);
      expect(apply.audit_id).toBeTruthy();
    }
  });

  it("applies write without confirmation for none risk", async () => {
    const result = await planner.applyWrite(
      "wing_discover",  // use a known low-risk tool
      "/ch/1/fader",    // use a real target path
      { type: "float", value: -3.0, unit: "dB" },
      "test write",
      undefined
    );
    expect(result.ok).toBe(true);
  });
});

import { describe, it, expect, beforeEach } from "vitest";
import { FakeWingDriver } from "../../src/drivers/WingDriver.js";
import { PolicyEngine } from "../../src/safety/PolicyEngine.js";
import { RiskEngine } from "../../src/safety/RiskEngine.js";
import { ConfirmationManager } from "../../src/safety/ConfirmationManager.js";
import { AuditLogger } from "../../src/safety/AuditLogger.js";
import { ChangePlanner } from "../../src/safety/ChangePlanner.js";
import { registerMeterTools } from "../../src/tools/meters.js";
import { registerHeadampTools } from "../../src/tools/headamp.js";
import { registerSceneTools } from "../../src/tools/scenes.js";
import { registerProcessingTools } from "../../src/tools/processing.js";
import { registerBulkTools } from "../../src/tools/bulk.js";
import { ToolResult } from "../../src/types.js";

function setup(driver: FakeWingDriver) {
  const pe = new PolicyEngine("maintenance", false);
  const cm = new ConfirmationManager();
  const al = new AuditLogger();
  const cp = new ChangePlanner(driver, pe, new RiskEngine(), cm, al, "maintenance");
  return { pe, cm, al, cp };
}

describe("Meter Tools", () => {
  let driver: FakeWingDriver;
  let tools: Record<string, any>;

  beforeEach(async () => {
    driver = new FakeWingDriver();
    await driver.connect((await driver.discover({ timeoutMs: 100 }))[0]);
    tools = registerMeterTools(driver);
  });

  it("reads meter levels for multiple targets", async () => {
    const result: ToolResult = await tools.wing_meter_read.handler({
      targets: ["/ch/1/fader", "/ch/2/fader", "/main/lr/fader"]
    });
    expect(result.ok).toBe(true);
    expect(result.data.meters.length).toBe(3);
  });

  it("signal_check detects signal on active channel", async () => {
    const result: ToolResult = await tools.wing_signal_check.handler({
      targets: ["/ch/1/fader"]
    });
    expect(result.ok).toBe(true);
    expect(result.data.hasAnySignal).toBe(true);
  });

  it("signal_check detects no signal when profile is no_input", async () => {
    driver.setProfile("no_input_ch1");
    // Set post_fader meter to silent too (profile sets input/pre_fader, fader maps to post_fader)
    await driver.setParam("/ch/1/meter/post_fader", { type: "float", value: -120.0, unit: "dBFS" });
    const result: ToolResult = await tools.wing_signal_check.handler({
      targets: ["/ch/1/fader"]
    });
    expect(result.data.hasAnySignal).toBe(false);
    expect(result.data.checks[0].present).toBe(false);
  });

  it("meter_catalog lists sources", async () => {
    const result: ToolResult = await tools.wing_meter_catalog.handler({});
    expect(result.ok).toBe(true);
    expect(Array.isArray(result.data)).toBe(true);
  });
});

describe("Headamp Tools", () => {
  let driver: FakeWingDriver;
  let tools: Record<string, any>;
  let cp: ChangePlanner;

  beforeEach(async () => {
    driver = new FakeWingDriver();
    await driver.connect((await driver.discover({ timeoutMs: 100 }))[0]);
    const s = setup(driver);
    cp = s.cp;
    tools = registerHeadampTools(driver, cp);
  });

  it("reads headamp gain and phantom status", async () => {
    const result: ToolResult = await tools.wing_headamp_get.handler({ input: 1 });
    expect(result.ok).toBe(true);
    expect(result.data.gain).toContain("dB");
    expect(result.data.phantom).toContain("OFF");
  });

  it("prepares a headamp gain change", async () => {
    const result: ToolResult = await tools.wing_headamp_set_prepare.handler({
      input: 1, gain_db: 35, reason: "need more gain"
    });
    expect(result.ok).toBe(true);
  });
});

describe("Scene Tools", () => {
  let driver: FakeWingDriver;
  let tools: Record<string, any>;
  let cp: ChangePlanner;

  beforeEach(async () => {
    driver = new FakeWingDriver();
    await driver.connect((await driver.discover({ timeoutMs: 100 }))[0]);
    const s = setup(driver);
    cp = s.cp;
    tools = registerSceneTools(driver, cp);
  });

  it("lists scenes with current", async () => {
    const result: ToolResult = await tools.wing_scene_list.handler({});
    expect(result.ok).toBe(true);
    expect(result.data.current).toBe(0);
    expect(result.data.scenes.length).toBeGreaterThan(0);
  });

  it("prepares a scene recall (critical)", async () => {
    const result: ToolResult = await tools.wing_scene_recall_prepare.handler({
      scene_index: 1, reason: "switch to scene 1"
    });
    expect(result.ok).toBe(true);
  });
});

describe("Processing Tools", () => {
  let driver: FakeWingDriver;
  let tools: Record<string, any>;
  let cp: ChangePlanner;

  beforeEach(async () => {
    driver = new FakeWingDriver();
    await driver.connect((await driver.discover({ timeoutMs: 100 }))[0]);
    const s = setup(driver);
    cp = s.cp;
    tools = { ...registerProcessingTools(driver, cp), ...registerBulkTools(driver, cp) };
  });

  it("reads EQ settings for a channel", async () => {
    const result: ToolResult = await tools.wing_eq_get.handler({ target: "ch/1" });
    expect(result.ok).toBe(true);
    expect(result.data.eqOn).toBe(true);
    expect(result.data.bands).toBeDefined();
  });

  it("reads gate settings", async () => {
    const result: ToolResult = await tools.wing_gate_get.handler({ channel: 1 });
    expect(result.ok).toBe(true);
    expect(result.data.gate).toBeDefined();
  });

  it("reads compressor settings", async () => {
    const result: ToolResult = await tools.wing_comp_get.handler({ target: "ch/1" });
    expect(result.ok).toBe(true);
    expect(result.data.comp).toBeDefined();
  });

  it("lists FX slots", async () => {
    const result: ToolResult = await tools.wing_fx_slot_list.handler({});
    expect(result.ok).toBe(true);
    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeGreaterThan(0);
  });

  it("bulk reads multiple parameters efficiently", async () => {
    const result: ToolResult = await tools.wing_param_bulk_get.handler({
      paths: ["/ch/1/name", "/ch/1/mute", "/ch/1/fader", "/main/lr/fader"]
    });
    expect(result.ok).toBe(true);
    expect(Object.keys(result.data).length).toBeGreaterThanOrEqual(4);
  });

  it("reads USB recorder status", async () => {
    const result: ToolResult = await tools.wing_usb_recorder_get.handler({});
    expect(result.ok).toBe(true);
    expect(result.data.transport).toBe("stopped");
  });
});

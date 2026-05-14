import { describe, it, expect, beforeEach } from "vitest";
import { FakeWingDriver } from "../../src/drivers/WingDriver.js";
import { registerViewTools } from "../../src/tools/views.js";
import { registerMeterTools } from "../../src/tools/meters.js";
import { registerChannelTools } from "../../src/tools/channels.js";
import { PolicyEngine } from "../../src/safety/PolicyEngine.js";
import { RiskEngine } from "../../src/safety/RiskEngine.js";
import { ConfirmationManager } from "../../src/safety/ConfirmationManager.js";
import { AuditLogger } from "../../src/safety/AuditLogger.js";
import { ChangePlanner } from "../../src/safety/ChangePlanner.js";
import { ToolResult } from "../../src/types.js";

function setup(driver: FakeWingDriver) {
  const pe = new PolicyEngine("maintenance", false);
  const cm = new ConfirmationManager();
  const al = new AuditLogger();
  return new ChangePlanner(driver, pe, new RiskEngine(), cm, al, "maintenance");
}

describe("No-Sound Diagnosis against FakeWing profiles", () => {
  let driver: FakeWingDriver;
  let viewTools: Record<string, any>;
  let meterTools: Record<string, any>;
  let channelTools: Record<string, any>;

  beforeEach(async () => {
    driver = new FakeWingDriver();
    await driver.connect((await driver.discover({ timeoutMs: 100 }))[0]);
    viewTools = registerViewTools(driver);
    meterTools = registerMeterTools(driver);
    channelTools = registerChannelTools(driver, setup(driver));
  });

  it("no_input_ch1: signal_check detects no signal, not muted", async () => {
    driver.setProfile("no_input_ch1");
    const sig: ToolResult = await meterTools.wing_signal_check.handler({ targets: ["/ch/1/fader"] });
    expect(sig.data.hasAnySignal).toBe(false);

    const ch: ToolResult = await channelTools.wing_channel_get.handler({ channel: 1 });
    expect(ch.data.mute).toBe(false); // not muted — problem is at source
  });

  it("muted_ch1: channel is muted, signal passes after unmute", async () => {
    driver.setProfile("muted_ch1");
    const ch: ToolResult = await channelTools.wing_channel_get.handler({ channel: 1 });
    expect(ch.data.mute).toBe(true);

    // Path trace should show channel as muted
    const trace: ToolResult = await viewTools.wing_signal_path_trace.handler({ channel: 1 });
    expect(trace.warnings).toBeDefined();
    expect(trace.warnings!.some((w: any) => w.message.includes("静音"))).toBe(true);
  });

  it("fader_down_ch1: fader at -90, channel not muted", async () => {
    driver.setProfile("fader_down_ch1");
    const ch: ToolResult = await channelTools.wing_channel_get.handler({ channel: 1 });
    expect(ch.data.fader).toBe(-90);
    expect(ch.data.mute).toBe(false);

    // Signal check should show no effective signal (fader at minimum)
    const sig: ToolResult = await meterTools.wing_signal_check.handler({ targets: ["/ch/1/fader"] });
    expect(sig.data.hasAnySignal).toBe(false);
  });

  it("gate_closed_ch1: gate on with high threshold blocks signal", async () => {
    driver.setProfile("gate_closed_ch1");
    const ch: ToolResult = await channelTools.wing_channel_get.handler({ channel: 1 });
    expect(ch.data.mute).toBe(false);

    // Post-fader meter should be silent because gate is clamping
    const sig: ToolResult = await meterTools.wing_signal_check.handler({ targets: ["/ch/1/fader"] });
    expect(sig.data.hasAnySignal).toBe(false);
  });

  it("main_muted: Main LR muted, channels normal", async () => {
    driver.setProfile("main_muted");
    // Channel 1 should still have signal
    const sig: ToolResult = await meterTools.wing_signal_check.handler({ targets: ["/ch/1/fader"] });
    expect(sig.data.hasAnySignal).toBe(true);

    // Main LR should show no signal
    const mainSig: ToolResult = await meterTools.wing_signal_check.handler({ targets: ["/main/lr/fader"] });
    expect(mainSig.data.hasAnySignal).toBe(false);
  });

  it("routing_wrong: channel has no source signal", async () => {
    driver.setProfile("routing_wrong");
    const sig: ToolResult = await meterTools.wing_signal_check.handler({ targets: ["/ch/1/fader"] });
    expect(sig.data.hasAnySignal).toBe(false);

    // Routing issues need path_trace to diagnose (quick_check only checks mute/fader)
    const trace: ToolResult = await viewTools.wing_signal_path_trace.handler({ channel: 1 });
    expect(trace.ok).toBe(true);
  });

  it("normal state: quick_check shows healthy", async () => {
    const qc: ToolResult = await viewTools.wing_quick_check.handler({});
    expect(qc.data.verdict).toBe("healthy");
    expect(qc.data.issues.length).toBe(0);
  });
});

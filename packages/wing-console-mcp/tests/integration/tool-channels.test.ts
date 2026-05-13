import { describe, it, expect, beforeEach } from "vitest";
import { FakeWingDriver } from "../../src/drivers/WingDriver.js";
import { PolicyEngine } from "../../src/safety/PolicyEngine.js";
import { RiskEngine } from "../../src/safety/RiskEngine.js";
import { ConfirmationManager } from "../../src/safety/ConfirmationManager.js";
import { AuditLogger } from "../../src/safety/AuditLogger.js";
import { ChangePlanner } from "../../src/safety/ChangePlanner.js";
import { registerChannelTools } from "../../src/tools/channels.js";
import { ToolResult } from "../../src/types.js";

describe("Channel Tools", () => {
  let driver: FakeWingDriver;
  let tools: Record<string, any>;
  let changePlanner: ChangePlanner;

  beforeEach(async () => {
    driver = new FakeWingDriver();
    const devices = await driver.discover({ timeoutMs: 100 });
    await driver.connect(devices[0]);
    const pe = new PolicyEngine("maintenance", false);
    const cm = new ConfirmationManager();
    const al = new AuditLogger();
    changePlanner = new ChangePlanner(driver, pe, new RiskEngine(), cm, al, "maintenance");
    tools = registerChannelTools(driver, changePlanner);
  });

  it("lists all 48 channels", async () => {
    const result: ToolResult = await tools.wing_channel_list.handler({});
    expect(result.ok).toBe(true);
    expect(result.data.length).toBe(48);
  });

  it("gets detail of a single channel", async () => {
    await driver.setParam("/ch/1/name", { type: "string", value: "Kick" });
    await driver.setParam("/ch/1/mute", { type: "bool", value: false });
    await driver.setParam("/ch/1/fader", { type: "float", value: -6.0, unit: "dB" });
    const result: ToolResult = await tools.wing_channel_get.handler({ channel: 1 });
    expect(result.ok).toBe(true);
    expect(result.data.name).toBe("Kick");
    expect(result.data.mute).toBe(false);
    expect(result.data.fader).toBe(-6.0);
  });

  it("prepares and applies a fader adjustment", async () => {
    await driver.setParam("/ch/1/fader", { type: "float", value: -10.0, unit: "dB" });

    const prep: ToolResult = await tools.wing_channel_adjust_fader_prepare.handler({
      channel: 1, delta_db: 3, reason: "test boost"
    });
    expect(prep.ok).toBe(true);

    const data = prep.data as any;
    if (data?.confirmationId) {
      const apply: ToolResult = await tools.wing_channel_adjust_fader_apply.handler({
        channel: 1, delta_db: 3, reason: "test boost",
        confirmation_id: data.confirmationId, confirmation_text: "confirm"
      });
      expect(apply.ok).toBe(true);
    }
  });

  it("prepares and applies a mute change", async () => {
    await driver.setParam("/ch/1/mute", { type: "bool", value: false });

    const prep: ToolResult = await tools.wing_channel_set_mute_prepare.handler({
      channel: 1, mute: true, reason: "test mute"
    });
    expect(prep.ok).toBe(true);

    const data = prep.data as any;
    if (data?.confirmationId) {
      const apply: ToolResult = await tools.wing_channel_set_mute_apply.handler({
        channel: 1, mute: true, reason: "test mute",
        confirmation_id: data.confirmationId, confirmation_text: "confirm"
      });
      expect(apply.ok).toBe(true);
      // Verify it actually muted
      const check = await driver.getParam("/ch/1/mute");
      expect(check.value).toBe(true);
    }
  });
});

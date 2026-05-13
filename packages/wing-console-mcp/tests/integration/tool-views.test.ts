import { describe, it, expect, beforeEach } from "vitest";
import { FakeWingDriver } from "../../src/drivers/WingDriver.js";
import { registerViewTools } from "../../src/tools/views.js";
import { ToolResult } from "../../src/types.js";

describe("View Tools with FakeWingDriver", () => {
  let driver: FakeWingDriver;
  let tools: Record<string, any>;

  beforeEach(async () => {
    driver = new FakeWingDriver();
    const devices = await driver.discover({ timeoutMs: 100 });
    await driver.connect(devices[0]);
    tools = registerViewTools(driver);
  });

  it("wing_quick_check returns healthy verdict for normal state", async () => {
    const result: ToolResult = await tools.wing_quick_check.handler({});
    expect(result.ok).toBe(true);
    expect(result.data.verdict).toBe("healthy");
  });

  it("wing_quick_check detects muted channels", async () => {
    await driver.setParam("/ch/1/mute", { type: "bool", value: true });
    const result: ToolResult = await tools.wing_quick_check.handler({});
    expect(result.data.verdict).toBe("needs_attention");
    expect(result.data.issues.length).toBeGreaterThan(0);
  });

  it("wing_state_summary returns channels in normal mode", async () => {
    const result: ToolResult = await tools.wing_state_summary.handler({ detail_level: "normal" });
    expect(result.ok).toBe(true);
    expect(Array.isArray(result.data.channels)).toBe(true);
    expect(result.data.channels.length).toBeGreaterThan(0);
  });

  it("wing_state_summary compact mode skips default channels", async () => {
    // Name a few channels to test compact mode
    await driver.setParam("/ch/1/name", { type: "string", value: "Vocal 1" });
    await driver.setParam("/ch/3/name", { type: "string", value: "Guitar" });
    const result: ToolResult = await tools.wing_state_summary.handler({ detail_level: "compact" });
    // Compact should only return named or anomalous channels
    const channels = result.data.channels as any[];
    const named = channels.filter((c: any) => c.name === "Vocal 1" || c.name === "Guitar");
    expect(named.length).toBe(2);
  });

  it("wing_state_snapshot returns full console state", async () => {
    const result: ToolResult = await tools.wing_state_snapshot.handler({ max_channels: 4 });
    expect(result.ok).toBe(true);
    expect(result.data.channels.length).toBe(4);
    expect(result.data.meta).toBeDefined();
    expect(result.data.meta.device.name).toBe("Fake WING");
  });

  it("wing_channel_strip returns detailed channel info", async () => {
    await driver.setParam("/ch/1/name", { type: "string", value: "Kick" });
    const result: ToolResult = await tools.wing_channel_strip.handler({ channel: 1 });
    expect(result.ok).toBe(true);
    expect(result.data.identity.name).toBe("Kick");
    expect(result.data.eq).toBeDefined();
    expect(result.data.dynamics).toBeDefined();
  });

  it("wing_signal_path_trace traces a complete path", async () => {
    const result: ToolResult = await tools.wing_signal_path_trace.handler({ channel: 1 });
    expect(result.ok).toBe(true);
    const trace = result.data.trace as any[];
    expect(trace.length).toBeGreaterThanOrEqual(4);
    // Should have headamp, channel, send, and main stages
    expect(trace.some((t: any) => t.stage === "1_headamp")).toBe(true);
    expect(trace.some((t: any) => t.stage === "2_channel")).toBe(true);
    expect(trace.some((t: any) => t.stage === "4_main_lr")).toBe(true);
  });

  it("wing_signal_path_trace detects muted channel", async () => {
    await driver.setParam("/ch/1/mute", { type: "bool", value: true });
    const result: ToolResult = await tools.wing_signal_path_trace.handler({ channel: 1 });
    expect(result.warnings).toBeDefined();
    expect(result.warnings!.some((w: any) => w.message.includes("静音"))).toBe(true);
  });
});

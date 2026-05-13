import { describe, it, expect } from "vitest";
import { ConfirmationManager, valuesEqual } from "../../src/safety/ConfirmationManager.js";

describe("valuesEqual", () => {
  it("compares identical values", () => {
    expect(valuesEqual(true, true)).toBe(true);
    expect(valuesEqual("hello", "hello")).toBe(true);
    expect(valuesEqual(42, 42)).toBe(true);
  });

  it("compares float with dB tolerance", () => {
    const a = { type: "float" as const, value: -6.0, unit: "dB" };
    const b = { type: "float" as const, value: -6.1, unit: "dB" };
    expect(valuesEqual(a, b)).toBe(true); // within 0.15 dB
  });

  it("rejects float outside dB tolerance", () => {
    const a = { type: "float" as const, value: -6.0, unit: "dB" };
    const b = { type: "float" as const, value: -3.0, unit: "dB" };
    expect(valuesEqual(a, b)).toBe(false);
  });

  it("compares bool exactly", () => {
    expect(valuesEqual(
      { type: "bool" as const, value: true },
      { type: "bool" as const, value: false }
    )).toBe(false);
  });

  it("compares string exactly", () => {
    expect(valuesEqual(
      { type: "string" as const, value: "Vocal 1" },
      { type: "string" as const, value: "Vocal 1" }
    )).toBe(true);
  });

  it("rejects different types", () => {
    expect(valuesEqual(
      { type: "float" as const, value: 1.0 },
      { type: "int" as const, value: 1 }
    )).toBe(false);
  });
});

describe("ConfirmationManager with critical exact match", () => {
  const cm = new ConfirmationManager();

  it("rejects critical apply without confirmation_text", () => {
    const ticket = cm.createTicket(
      "wing_phantom_set_prepare", "/headamp/local/1/phantom", "critical",
      { type: "bool", value: false }, { type: "bool", value: true },
      "need phantom", "确认开启 LCL.1 的 48V 幻象电源，我确认连接设备需要幻象电源"
    );
    const result = cm.validateTicket(ticket.id, "wing_phantom_set_apply", "/headamp/local/1/phantom",
      { type: "bool", value: true }, undefined);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("required");
  });

  it("rejects critical apply with wrong confirmation_text", () => {
    const ticket = cm.createTicket(
      "wing_phantom_set_prepare", "/headamp/local/1/phantom", "critical",
      { type: "bool", value: false }, { type: "bool", value: true },
      "need phantom", "确认开启 LCL.1 的 48V 幻象电源，我确认连接设备需要幻象电源"
    );
    const result = cm.validateTicket(ticket.id, "wing_phantom_set_apply", "/headamp/local/1/phantom",
      { type: "bool", value: true }, "确认");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Exact confirmation");
  });

  it("accepts critical apply with exact confirmation_text", () => {
    const ticket = cm.createTicket(
      "wing_phantom_set_prepare", "/headamp/local/1/phantom", "critical",
      { type: "bool", value: false }, { type: "bool", value: true },
      "need phantom", "确认开启 LCL.1 的 48V 幻象电源，我确认连接设备需要幻象电源"
    );
    const result = cm.validateTicket(ticket.id, "wing_phantom_set_apply", "/headamp/local/1/phantom",
      { type: "bool", value: true }, "确认开启 LCL.1 的 48V 幻象电源，我确认连接设备需要幻象电源");
    expect(result.valid).toBe(true);
  });

  it("detects material state change", () => {
    const ticket = cm.createTicket(
      "wing_channel_adjust_fader_prepare", "/ch/1/fader", "medium",
      { type: "float", value: -10.0, unit: "dB" }, { type: "float", value: -7.0, unit: "dB" },
      "boost vocal", "确认"
    );
    // Current value differs from prepare-time old value
    const result = cm.validateTicket(ticket.id, "wing_channel_adjust_fader_apply", "/ch/1/fader",
      { type: "float", value: -7.0, unit: "dB" }, "确认",
      { type: "float", value: -3.0, unit: "dB" }); // someone else changed it
    expect(result.valid).toBe(false);
    expect(result.error).toContain("State changed");
  });
});

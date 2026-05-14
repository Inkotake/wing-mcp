import { describe, it, expect } from "vitest";
import { validateAgainstSchema } from "../../src/safety/InputValidator.js";

describe("InputValidator", () => {
  const channelSchema = {
    type: "object" as const,
    properties: {
      channel: { type: "number", description: "Channel number" },
      mute: { type: "boolean" },
      reason: { type: "string" },
    },
    required: ["channel", "mute", "reason"],
  };

  it("accepts valid input", () => {
    const errors = validateAgainstSchema(channelSchema, { channel: 1, mute: true, reason: "test" }, "test");
    expect(errors.length).toBe(0);
  });

  it("rejects missing required fields", () => {
    const errors = validateAgainstSchema(channelSchema, { channel: 1 }, "test");
    expect(errors.some(e => e.message.includes("Required"))).toBe(true);
  });

  it("rejects wrong type", () => {
    const errors = validateAgainstSchema(channelSchema, { channel: "one", mute: true, reason: "test" }, "test");
    expect(errors.some(e => e.message.includes("should be number"))).toBe(true);
  });

  const scopeSchema = {
    type: "object" as const,
    properties: {
      scope: { type: "string", enum: ["all", "main_only", "channels_only"] },
    },
  };

  it("rejects invalid enum", () => {
    const errors = validateAgainstSchema(scopeSchema, { scope: "invalid" }, "test");
    expect(errors.some(e => e.message.includes("must be one of"))).toBe(true);
  });

  it("accepts valid enum", () => {
    const errors = validateAgainstSchema(scopeSchema, { scope: "all" }, "test");
    expect(errors.length).toBe(0);
  });

  const arraySchema = {
    type: "object" as const,
    properties: {
      targets: { type: "array", items: { type: "string" } },
    },
  };

  it("validates array items", () => {
    const errors = validateAgainstSchema(arraySchema, { targets: ["a", 123] }, "test");
    expect(errors.some(e => e.message.includes("should be string"))).toBe(true);
  });

  it("handles undefined schema gracefully", () => {
    const errors = validateAgainstSchema(undefined, { foo: "bar" }, "test");
    expect(errors.length).toBe(0);
  });

  it("skips undefined optional fields", () => {
    const errors = validateAgainstSchema(channelSchema, { channel: 1, mute: true, reason: "test", extra: "ignored" }, "test");
    expect(errors.length).toBe(0);
  });
});

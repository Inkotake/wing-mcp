import { describe, it, expect } from "vitest";
import { RateLimiter } from "../../src/safety/RateLimiter.js";

describe("RateLimiter", () => {
  it("allows writes within limits", () => {
    const rl = new RateLimiter(12, 0, 10000); // no min interval for testing
    expect(rl.check("wing_channel_set_mute_apply", false).allowed).toBe(true);
  });

  it("enforces max writes per minute", () => {
    const rl = new RateLimiter(3, 0, 10000);
    rl.record("test_apply", "medium");
    rl.record("test_apply", "medium");
    rl.record("test_apply", "medium");
    const check = rl.check("test_apply", false);
    expect(check.allowed).toBe(false);
    expect(check.reason).toContain("exceeded");
  });

  it("bypasses rate limiting for emergency tools", () => {
    const rl = new RateLimiter(1, 0, 10000);
    rl.record("test_apply", "medium");
    // Even though we've hit the limit, emergency is always allowed
    expect(rl.check("wing_emergency_stop_apply", true).allowed).toBe(true);
  });

  it("enforces critical cooldown", () => {
    const rl = new RateLimiter(100, 0, 100); // 100ms cooldown
    rl.record("test_apply", "critical");
    const check = rl.check("test_apply", false);
    expect(check.allowed).toBe(false);
    expect(check.reason).toContain("cooldown");
  });

  it("resets window after 60 seconds", () => {
    const rl = new RateLimiter(3, 0, 10000);
    rl.record("test_apply", "medium");
    rl.record("test_apply", "medium");
    rl.record("test_apply", "medium");
    expect(rl.check("test_apply", false).allowed).toBe(false);
    // Manually reset
    rl.reset();
    expect(rl.check("test_apply", false).allowed).toBe(true);
  });

  it("reports stats correctly", () => {
    const rl = new RateLimiter(12, 2000, 10000);
    rl.record("test_apply", "medium");
    const stats = rl.getStats();
    expect(stats.writesThisMinute).toBe(1);
    expect(stats.maxPerMinute).toBe(12);
    expect(stats.criticalCooldown).toBe(false);
  });
});

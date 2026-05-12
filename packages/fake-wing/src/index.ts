/**
 * Fake WING — Test harness and profile utilities.
 *
 * The actual FakeWingDriver lives in wing-console-mcp/src/drivers/WingDriver.ts.
 * This package provides standalone test profiles, fault scenarios, and
 * test fixtures that can be used by any test suite.
 *
 * Usage:
 *   import { createTestHarness, faultProfiles } from "fake-wing";
 */

export interface TestHarness {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  getFakeState(): Record<string, unknown>;
}

/** Pre-configured fault profiles for no-sound testing */
export const faultProfiles = {
  no_input_ch1: { "/ch/1/meter/input": -120, "/ch/1/meter/pre_fader": -120, description: "CH 1 no input signal" },
  muted_ch1: { "/ch/1/mute": true, description: "CH 1 muted" },
  fader_down_ch1: { "/ch/1/fader": -90, description: "CH 1 fader all the way down" },
  gate_closed_ch1: { "/ch/1/gate/on": true, "/ch/1/gate/threshold": 10, description: "CH 1 gate fully closed" },
  main_muted: { "/main/lr/mute": true, description: "Main LR muted" },
  routing_wrong: { "/ch/1/source": "None", description: "CH 1 source set to None" },
  send_missing_ch1: { "/ch/1/send/1/level": -99, description: "CH 1 send to bus 1 at minimum" },
  high_gain_feedback: { "/headamp/local/1/gain": 60, "/ch/1/eq/high/gain": 12, description: "Feedback-prone gain staging" },
} as const;

export type FaultProfileName = keyof typeof faultProfiles;

/** List available fault profiles */
export function listProfiles(): Array<{ name: string; description: string }> {
  return Object.entries(faultProfiles).map(([name, p]) => ({ name, description: p.description }));
}

/** Minimal test harness factory */
export function createTestHarness() {
  return {
    ready: true,
    profiles: faultProfiles,
    getProfile(name: FaultProfileName) {
      return faultProfiles[name] ?? null;
    },
  };
}

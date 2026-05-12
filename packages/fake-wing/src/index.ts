/**
 * Fake WING - Behringer WING Console Simulator
 *
 * Provides a fully simulated WING for development, CI testing, and
 * demos without requiring real hardware.
 *
 * This package re-exports the FakeWingDriver from wing-console-mcp
 * for standalone use in test suites and scripts.
 */

// Standalone test utilities that don't require cross-package imports
export interface TestContext {
  connected: boolean;
  params: Map<string, unknown>;
}

export function createTestHarness() {
  return {
    connected: false,
    params: new Map<string, unknown>(),
  };
}

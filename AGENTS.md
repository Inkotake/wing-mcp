# AGENTS.md - AI Sound Engineer Coding Agents

## Project Context

This is a live-sound engineering AI system that controls Behringer WING family digital mixing consoles. The safety bar is higher than typical software projects.

## Safety Checklist (every change)

Before implementing any feature:

- [ ] Does this introduce a write path? If yes, does it have prepare/apply/readback/audit?
- [ ] Is the risk level correctly classified? (none/low/medium/high/critical)
- [ ] Does it work with fake-wing for CI testing?
- [ ] Are there unit tests for both success and denial paths?
- [ ] Are hardware assumptions documented?

## Code Organization

```
packages/
  wing-console-mcp/src/
    server.ts           - MCP server entry point
    types.ts            - Shared types, Zod schemas, risk map
    drivers/
      WingDriver.ts     - Driver interface + FakeWingDriver
    safety/
      RiskEngine.ts     - Risk classification
      PolicyEngine.ts   - Mode/risk policy decisions
      ConfirmationManager.ts - Prepare/apply confirmation tickets
      AuditLogger.ts    - Write audit trail
      ChangePlanner.ts  - Coordinates the write lifecycle
    state/
      StateCache.ts     - Parameter cache + AliasResolver
    tools/
      device.ts         - discover, connect, status
      schema.ts         - schema search, param resolve
      params.ts         - param get/set (generic)
      channels.ts       - channel list/get/mute/fader
      sends.ts          - send get/adjust
      routing.ts        - routing trace/get/set
      headamp.ts        - headamp get/set, phantom
      scenes.ts         - scene list/recall, snapshot save
      meters.ts         - meter catalog/read, signal check
      diagnosis.ts      - diagnosis session state machine
      views.ts          - quick_check, summary, snapshot, channel_strip, path_trace
      processing.ts     - EQ, gate, compressor, FX slot
      groups.ts         - DCA, mute group, main LR, matrix
      bulk.ts           - param_bulk_get, debug_dump, USB recorder
      emergency.ts      - emergency stop/status/reset
      raw.ts            - raw OSC/native (disabled by default)
```

## Adding a new tool

1. Create the handler function in the appropriate `tools/*.ts` file
2. If it's a write tool, it MUST use ChangePlanner.prepareWrite/applyWrite
3. Add the tool to the risk map in types.ts if needed
4. Add the tool description with: purpose, risk level, write behavior
5. Register the tool in server.ts

## Commit Conventions

- feat: new tool or feature
- fix: bug fix
- refactor: code restructuring
- docs: documentation
- test: test additions
- chore: build/config
- safety: safety-related changes

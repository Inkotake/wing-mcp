# wing-mcp — Agent Development Guide

Safety-critical live audio MCP server. Read CLAUDE.md first.

## Current status (pre-alpha)

```
Fake:   ✅  functional — 48ch, 10 fault profiles, dynamic meter propagation
OSC:    ⚠️  experimental — UDP framework done, needs WING hardware truth test
Native: ❌  stub — propmap integrated (60,748 entries), runtime not implemented
Raw:    ❌  disabled — requires developer_raw + WING_RAW_UNLOCK
```

## Code organization

```
packages/wing-console-mcp/src/
  server.ts           MCP registration, transport, tool execution, annotations
  types.ts            Risk/Mode/ErrorCode, RISK_MAP (91 entries)
  drivers/
    WingDriver.ts     FakeWingDriver + recomputeAllMeters + 10 fault profiles
    OscDriver.ts      UDP 2222/2223, OSC codec, address-correlated query, value normalization
    NativeDriver.ts   Stub — sidecar spawn planned
  safety/
    PolicyEngine.ts        4-mode + emergency stop bypass
    RiskEngine.ts          Tool+target classification
    ConfirmationManager.ts Ticket lifecycle, exact match, state drift, valuesEqual
    AuditLogger.ts         JSONL daily, SHA-256 hashing
    ChangePlanner.ts       prepare/apply, validateTicketOnly
    RateLimiter.ts         Apply-only, cumulative delta tracking
    BatchChangePlanner.ts  Per-target read→write→readback→audit for emergency
    InputValidator.ts      JSON Schema + WingValue deep validation + path safety
  schema/
    WingPropmap.ts    60,748 libwing entries, canonical→native verified mapping
    CanonicalMapper.ts Table-driven EQ/gate/comp/send/fx mapping
  state/
    StateCache.ts     AliasResolver (12 pre-populated Chinese/English aliases)
  tools/
    device.ts schema.ts params.ts channels.ts sends.ts routing.ts
    headamp.ts scenes.ts meters.ts diagnosis.ts views.ts
    processing.ts groups.ts bulk.ts emergency.ts raw.ts
    schemaHelpers.ts  Shared confirmation schema fragments
```

## Safety rules for agents

1. Never add write tools without `prepare → confirmation → apply → audit`
2. high/critical tools must have `confirmation_text` in inputSchema
3. All paths must be verified against `propmap.jsonl` before use in OSC/Native
4. Never return fake `{ok:true}` for unimplemented operations
5. Raw tools require 3 conditions: developer_raw + ENABLE_RAW + RAW_UNLOCK
6. Emergency stop must snapshot BEFORE writing, not after

## Adding a new tool

1. Define `inputSchema` with `confirmation_text` for apply tools
2. Add `RISK_MAP` entry in `types.ts`
3. Register in `server.ts` allTools
4. Handler must use `ChangePlanner.prepareWrite/applyWrite` for writes
5. Add unit + integration tests

## Testing

```bash
pnpm test          # 122 tests (11 files)
pnpm test:hardware # WING_HARDWARE_TEST=1 required
```

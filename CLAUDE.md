# wing-mcp — Behringer WING MCP Server

Safety-critical live audio hardware control via MCP. Treat every mixer write as dangerous.

## Project goal

Build a trusted WING hardware control kernel:

- `wing-console-mcp`: 91-tool MCP server with safety engine
- `wing-native-sidecar`: Rust JSON-RPC sidecar (libwing, stub)
- `fake-wing`: simulator for dev/testing (10 fault profiles)
- `OSC driver`: experimental, UDP 2223, needs hardware validation

> **AI 调音师** (diagnosis engine, Skill, memory, voice) → separate repo [mixingagent](https://github.com/Inkotake/mixingagent)

## Current status

```
Fake driver:     ✅ functional
OSC driver:      ⚠️ experimental (needs WING hardware truth test)
Native driver:   ❌ stub (propmap integrated, runtime not implemented)
Raw tools:       ❌ disabled by default (developer_raw + WING_RAW_UNLOCK required)
```

## Safety rules

1. All writes: `read → risk → policy → confirmation → apply → readback → audit`
2. high/critical: exact confirmation text match required
3. Phantom, routing, scene, main, DCA, mute groups = high/critical
4. Raw OSC/Native: disabled unless `WING_MODE=developer_raw` + `WING_ENABLE_RAW=1` + `WING_RAW_UNLOCK=set`
5. Confirmation text SHA-256 hashed in audit, never stored raw
6. OSC paths verified against 60,748-entry libwing propmap

## Architecture

```
MCP client (Claude/ChatGPT)
  → wing-console-mcp (stdio MCP server)
    → Safety: PolicyEngine → RiskEngine → ConfirmationManager → AuditLogger
    → ChangePlanner: prepare/apply/readback pipeline
    → Drivers: Fake | OSC (UDP 2223) | Native (Rust sidecar, stub)
    → Schema: WingPropmap (60,748 entries) + CanonicalMapper
```

## Key modules

```
server.ts           MCP registration, transport, tool execution
types.ts            Risk/Mode/ErrorCode, RISK_MAP (91 entries)
drivers/
  WingDriver.ts     FakeWingDriver + 10 fault profiles
  OscDriver.ts      UDP 2222/2223 with address-correlated query
  NativeDriver.ts   Stub (sidecar lifecycle planned)
safety/
  PolicyEngine.ts   4-mode enforcement + emergency bypass
  RiskEngine.ts     Tool+target risk classification
  ConfirmationManager.ts  Ticket lifecycle, exact match, state drift
  AuditLogger.ts    JSONL persistence, SHA-256 hashing
  ChangePlanner.ts  prepare/apply orchestration
  RateLimiter.ts    Apply-only rate limit, cumulative delta tracking
  BatchChangePlanner.ts  Per-target batch read/write/readback/audit
  InputValidator.ts JSON Schema runtime validation + WingValue checks
schema/
  WingPropmap.ts    60,748 libwing entries, canonical→native mapping
  CanonicalMapper.ts Table-driven EQ/gate/comp/send mapping
```

## Testing

```bash
pnpm test  # 122 tests (11 files)
WING_HARDWARE_TEST=1 pnpm test:hardware  # requires real WING
```

122 tests covering: RiskEngine, PolicyEngine, ConfirmationManager, RateLimiter, InputValidator, FakeWingDriver, ChangePlanner, view tools, channel tools, meter/headamp/scene/processing, safety pipeline E2E, no-sound diagnosis.

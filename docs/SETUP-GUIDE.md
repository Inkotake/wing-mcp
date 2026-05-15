# wing-mcp Setup Guide

> **⚠️ HARDWARE WARNING**: pre-alpha software. Fake driver functional for dev/testing. OSC/Native are experimental stubs. **DO NOT connect to real WING in live performance or with PA connected.** Hardware testing requires `WING_HARDWARE_TEST=1`, must use an unused channel (e.g. CH48), and restore original state.

## Prerequisites

- Node.js >= 18
- pnpm (`npm install -g pnpm`)
- (Optional) Rust toolchain for native sidecar development

## Install & Run

```bash
git clone https://github.com/Inkotake/wing-mcp.git
cd wing-mcp
pnpm install
pnpm build

# Fake driver (no hardware needed)
WING_DRIVER=fake WING_MODE=rehearsal_safe node packages/wing-console-mcp/dist/server.js
```

## Transport

Current: **stdio only**. Streamable HTTP is planned, not yet implemented.

## Environment Variables

```bash
WING_DRIVER=fake|osc|native         # Driver (default: fake)
WING_HOST=192.168.1.62              # WING IP address (osc/native)
WING_MODE=rehearsal_safe            # read_only|rehearsal_safe|maintenance|developer_raw
WING_LIVE_MODE=0                    # Set 1 during live performance
WING_AUDIT_DIR=./data/audit         # Audit log directory (daily JSONL)
WING_ENABLE_RAW=0                   # Enable raw OSC/Native tools
WING_RAW_UNLOCK=                    # Unlock password for raw tools (developer_raw mode)
WING_ALLOW_UNVERIFIED_OSC_PATHS=0   # Allow X32-style OSC paths (dev only)
WING_HARDWARE_TEST=0                # Gate for hardware tests
```

## Claude Code Integration

Add to `.claude/mcp.json`:

```json
{
  "mcpServers": {
    "wing-console": {
      "command": "node",
      "args": ["packages/wing-console-mcp/dist/server.js"],
      "env": {
        "WING_MODE": "rehearsal_safe",
        "WING_DRIVER": "fake"
      }
    }
  }
}
```

## Development

```bash
pnpm test          # 122 tests (11 files)
pnpm build         # TypeScript compilation
cargo build        # Rust sidecar (from rust/wing-native-sidecar/)
```

## Hardware Testing (when WING available)

```bash
WING_HARDWARE_TEST=1 \
WING_DRIVER=osc \
WING_HOST=192.168.1.62 \
WING_TEST_CHANNEL=48 \
pnpm test:hardware
```

**Rules:**
- Use ONLY an unused channel (e.g. CH48)
- PA must be disconnected
- Read state before any change
- Restore original state after test
- Never test on CH1 vocal, Main LR, or phantom power

## Driver Status

| Driver | Status | Capabilities |
|--------|--------|-------------|
| **fake** | ✅ Production-ready for dev/test | 48ch, 16bus, 8DCA, 8FX, 8Matrix, 10 fault profiles, dynamic meters |
| **osc** | ⚠️ Experimental | UDP 2222 discovery, UDP 2223 OSC codec, propmap-verified paths. Needs hardware truth test |
| **native** | ❌ Runtime stub | Propmap integrated (60,748 entries). Sidecar get/set return NOT_IMPLEMENTED. Requires libwing integration |

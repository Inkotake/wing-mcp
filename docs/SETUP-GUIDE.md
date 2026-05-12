# WING AI Sound Engineer -- Setup Guide

Complete setup instructions for the WING AI Sound Engineer MCP system.

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Installation](#2-installation)
3. [Running the MCP Server](#3-running-the-mcp-server)
4. [Claude Code Configuration](#4-claude-code-configuration)
5. [Claude Desktop Configuration](#5-claude-desktop-configuration)
6. [ChatGPT Custom Connector Setup](#6-chatgpt-custom-connector-setup)
7. [Environment Variables](#7-environment-variables)
8. [Configuration File](#8-configuration-file)
9. [Hardware Setup](#9-hardware-setup)
10. [Network Setup](#10-network-setup)
11. [Modes of Operation](#11-modes-of-operation)
12. [Running with Fake WING (Development)](#12-running-with-fake-wing-development)
13. [Troubleshooting](#13-troubleshooting)
14. [Security Notes](#14-security-notes)

---

## 1. Prerequisites

### Required

| Software | Version | Purpose |
|----------|---------|---------|
| **Node.js** | >= 18.0.0 | MCP server runtime (TypeScript) |
| **pnpm** | >= 8.0.0 | Package manager (monorepo workspace) |
| **Git** | >= 2.30 | Source control |

### Optional (for native driver)

| Software | Version | Purpose |
|----------|---------|---------|
| **Rust toolchain** | >= 1.75 (stable) | `wing-native-sidecar` binary |
| **Cargo** | (bundled with Rust) | Rust package manager |

### Operating System

- **Linux** (primary target): Ubuntu 22.04+, Debian 12+, or similar
- **macOS**: 12+ (Monterey or newer)
- **Windows**: Windows 10/11 with WSL2 recommended; native Win32 supported but untested on bare metal

### Hardware (for production deployment)

- Mini PC / Mac mini / NUC with wired Ethernet
- 2x NIC recommended: one for WING control LAN, one for internet
- Push-to-talk microphone (for voice control)
- Engineer headphones or small local speaker (for TTS output)

---

## 2. Installation

### Step 1: Clone the repository

```bash
git clone <repo-url> ai-sound-engineer
cd ai-sound-engineer
```

### Step 2: Install dependencies

```bash
pnpm install
```

This installs all monorepo packages. The workspace includes:
- `packages/wing-console-mcp` -- WING control MCP server
- `packages/sound-memory-mcp` -- Room knowledge and memory MCP server

### Step 3: Build all packages

```bash
pnpm build
```

This compiles TypeScript across all packages. Output goes to `packages/*/dist/`.

### Step 4: Verify installation

```bash
# Run tests with fake WING (no hardware needed)
pnpm test
```

Expected output: All tests pass. Fake WING driver is used automatically when no real WING is connected.

### Step 5 (optional): Build Rust sidecar

```bash
cd rust/wing-native-sidecar
cargo build --release
```

The Rust binary provides the native protocol driver. The MCP server can fall back to OSC (UDP 2223) without it.

---

## 3. Running the MCP Server

### Base command

```bash
WING_MODE=rehearsal_safe npx wing-console-mcp
```

This starts the server in `rehearsal_safe` mode with stdio transport.

### With specific driver

```bash
WING_DRIVER=osc WING_IP=192.168.1.62 WING_MODE=rehearsal_safe npx wing-console-mcp
```

### In read-only mode (safe for live shows)

```bash
WING_MODE=read_only npx wing-console-mcp
```

### HTTP transport (for web/ChatGPT connector)

```bash
WING_MODE=rehearsal_safe MCP_TRANSPORT=http MCP_HTTP_BIND=127.0.0.1 MCP_HTTP_PORT=3000 npx wing-console-mcp
```

**Security:** HTTP transport must bind to `127.0.0.1` by default. LAN exposure requires an auth token (see [Environment Variables](#7-environment-variables)).

### Maintenance mode (full access)

```bash
WING_MODE=maintenance npx wing-console-mcp
```

**Warning:** Maintenance mode allows high and critical risk operations. Only use when the PA is disconnected or in an empty room.

---

## 4. Claude Code Configuration

Claude Code discovers MCP servers from `.claude/mcp.json` or the global `claude_desktop_config.json`.

### Option A: Project-level `.claude/mcp.json`

Create or edit `.claude/mcp.json` in the project root:

```json
{
  "mcpServers": {
    "wing-console": {
      "command": "npx",
      "args": ["wing-console-mcp"],
      "env": {
        "WING_IP": "192.168.1.62",
        "WING_MODE": "rehearsal_safe",
        "WING_DRIVER": "native"
      }
    },
    "sound-memory": {
      "command": "npx",
      "args": ["sound-memory-mcp"],
      "env": {
        "SOUND_MEMORY_DB_PATH": "./data/memory.sqlite"
      }
    }
  }
}
```

### Option B: Global `claude_desktop_config.json`

Location depends on OS:

| OS | Path |
|----|------|
| macOS | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Windows | `%APPDATA%\Claude\claude_desktop_config.json` |
| Linux | `~/.config/Claude/claude_desktop_config.json` |

Add to the `mcpServers` section:

```json
{
  "mcpServers": {
    "wing-console": {
      "command": "npx",
      "args": ["wing-console-mcp"],
      "env": {
        "WING_IP": "192.168.1.62",
        "WING_MODE": "rehearsal_safe"
      }
    }
  }
}
```

### Option C: Development (local workspace)

When working from the monorepo directly:

```json
{
  "mcpServers": {
    "wing-console": {
      "command": "node",
      "args": ["packages/wing-console-mcp/dist/server.js"],
      "env": {
        "WING_IP": "192.168.1.62",
        "WING_MODE": "rehearsal_safe",
        "WING_DRIVER": "fake"
      }
    }
  }
}
```

### Restart Claude Code after configuration

After editing the MCP config file, restart Claude Code or reload the MCP servers.

---

## 5. Claude Desktop Configuration

For Claude Desktop app, use the same `claude_desktop_config.json` as in Option B above.

Claude Desktop supports both stdio and Streamable HTTP transports. For stdio:

```json
{
  "mcpServers": {
    "wing-console": {
      "command": "npx",
      "args": ["wing-console-mcp"],
      "env": {
        "WING_IP": "192.168.1.62",
        "WING_MODE": "read_only"
      }
    }
  }
}
```

**Important:** When running in Claude Desktop for the first time, always start in `read_only` mode to verify connectivity before enabling writes.

---

## 6. ChatGPT Custom Connector Setup

ChatGPT custom MCP connectors require a Streamable HTTP endpoint.

### Step 1: Start the MCP server with HTTP transport

```bash
WING_MODE=rehearsal_safe \
MCP_TRANSPORT=http \
MCP_HTTP_BIND=127.0.0.1 \
MCP_HTTP_PORT=3000 \
MCP_AUTH_TOKEN=your-secure-token-here \
npx wing-console-mcp
```

### Step 2: Expose via VPN / secure tunnel (if remote)

**Never** expose WING control directly to the public internet.

Recommended approaches:
- **Tailscale**: `tailscale serve 3000` or use Tailscale Funnel
- **WireGuard**: VPN into the rehearsal room network
- **Cloudflare Tunnel**: With access controls and auth
- **SSH tunnel**: `ssh -L 3000:localhost:3000 user@appliance`

### Step 3: Configure ChatGPT connector

In the ChatGPT custom MCP connector settings:

- **URL**: `https://your-secure-endpoint/mcp` (or `http://localhost:3000/mcp` for local)
- **Auth**: Bearer token (the `MCP_AUTH_TOKEN` value)
- **Transport**: Streamable HTTP

### Security requirements for remote access

```
[Internet]
    |
[VPN / Tailscale / WireGuard]  <-- encrypted tunnel
    |
[AI Appliance]                 <-- MCP HTTP bound to localhost or VPN IP
    | NIC 2: WING control LAN
[WING Console]                 <-- isolated control network
```

- MCP HTTP must use TLS (HTTPS) if accessed from outside localhost
- Auth token is mandatory for any non-localhost binding
- Validate Origin/Host headers
- Rate-limit write operations

---

## 7. Environment Variables

### Core Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `WING_MODE` | **Yes** | `rehearsal_safe` | Operating mode: `read_only`, `rehearsal_safe`, `maintenance`, `developer_raw` |
| `WING_IP` | No | -- | Direct IP of WING console (if auto-discovery disabled) |
| `WING_DRIVER` | No | `native` | Driver preference: `native`, `osc`, `fake` |
| `WING_ENABLE_RAW` | No | `false` | Enable raw OSC/native tools (requires `developer_raw` mode) |

### Transport Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `MCP_TRANSPORT` | No | `stdio` | Transport: `stdio` or `http` |
| `MCP_HTTP_BIND` | No | `127.0.0.1` | HTTP bind address |
| `MCP_HTTP_PORT` | No | `3000` | HTTP port |
| `MCP_AUTH_TOKEN` | No | -- | Bearer token for HTTP authentication |

### Live Mode Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `WING_LIVE_MODE` | No | `false` | Set to `true` to enable additional live-mode restrictions |

### Discovery Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `WING_DISCOVERY_ENABLED` | No | `true` | Enable UDP broadcast discovery |
| `WING_DISCOVERY_TIMEOUT_MS` | No | `3000` | Discovery timeout in milliseconds |

### Hardware Test Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `WING_HARDWARE_TEST` | No | `0` | Set to `1` to enable hardware-gated tests |
| `WING_HARDWARE_WRITE_TEST` | No | `0` | Set to `1` to enable write tests on real hardware |

### Memory Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SOUND_MEMORY_DB_PATH` | No | `./data/memory.sqlite` | SQLite database path for room memory |
| `SOUND_MEMORY_DOCS_PATH` | No | `./data/docs` | Path to room documentation files |

### Debug / Development

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `WING_LOG_LEVEL` | No | `info` | Log level: `debug`, `info`, `warn`, `error` |
| `WING_FAULT_INJECTION` | No | `0` | Enable fault injection in fake driver |

---

## 8. Configuration File

As an alternative to environment variables, create a YAML config file at `/etc/ai-sound-engineer/config.yaml` (Linux) or `./config.yaml` (development).

```yaml
# /etc/ai-sound-engineer/config.yaml

room_id: room-a
mode: rehearsal_safe

wing:
  discovery:
    enabled: true
    timeout_ms: 3000
    direct_ips:
      - "192.168.1.62"
  preferred_driver: native
  osc_fallback: true

safety:
  live_mode: true
  default_dry_run: true
  require_confirmation_for:
    - medium
    - high
    - critical
  delta_caps:
    channel_fader_db: 3.0
    send_db: 6.0
    main_fader_db: 1.5
    eq_gain_db: 3.0
    gate_threshold_db: 6.0
  max_writes_per_minute: 12

transport:
  type: stdio
  http:
    bind: "127.0.0.1"
    port: 3000
    auth_token: "${MCP_AUTH_TOKEN}"

voice:
  input: push_to_talk
  tts_output: local_speaker

memory:
  sqlite_path: /var/lib/ai-sound-engineer/memory.sqlite
  docs_path: /var/lib/ai-sound-engineer/docs

logging:
  level: info
```

---

## 9. Hardware Setup

### Physical Layout

```
[WING Console]
     |
     | Control LAN (Ethernet)
     |
[AI Appliance] ── Internet (optional, VPN only)
     |
     | USB
     |
[Audio Interface] ── Push-to-talk Mic
     └── Engineer Headphone (TTS output, NOT in PA)
```

### WING Console Preparation

1. **Network**: Connect WING to a dedicated control LAN (not the Dante/AES50 audio network).
2. **Static IP**: Assign a static IP to the WING (e.g., `192.168.1.62`).
3. **Firmware**: Update to WING firmware 3.0 or later (supports discovery and native protocol).
4. **Remote Access**: Ensure WING remote control is enabled (Setup > Remote).
5. **Backup**: Save a current scene snapshot before connecting AI control.

### AI Appliance Setup

1. **Network**: Connect NIC 1 to the WING control LAN (same subnet).
2. **Static IP**: Assign static IP (e.g., `192.168.1.10`).
3. **Verify**: `ping 192.168.1.62` to confirm connectivity.
4. **Discovery**: Run `WING_MODE=read_only npx wing-console-mcp` and call `wing_discover`.

### Audio Interface (for voice/room audio)

- USB audio interface for push-to-talk mic and engineer monitor
- **Critically**: TTS output must NOT be routed to Main LR or musician monitors
- Use a small local speaker or engineer headphones for AI voice output

---

## 10. Network Setup

### Recommended Topology

```
[Internet] ← optional
    |
    | VPN / Tailscale only
    |
[AI Appliance]
    | NIC 1: 192.168.1.10 (WING Control LAN)
    | NIC 2: 10.0.0.10 (Internet, optional)
    |
    | WING Control LAN (switch)
    |
[WING Console] 192.168.1.62
```

### Network Rules

1. **WING control LAN must be isolated** from public internet
2. **No port forwarding** to the WING or AI appliance
3. **Use VPN** (Tailscale/WireGuard) for remote access
4. **MCP HTTP** binds to `127.0.0.1` by default; bind to VPN IP only if needed
5. **Enable auth token** for any non-localhost MCP HTTP

### Firewall Rules (Linux)

```bash
# Allow WING discovery (UDP 2222) on control LAN
ufw allow in on eth0 to 192.168.1.0/24 port 2222 proto udp

# Allow OSC fallback (UDP 2223) on control LAN
ufw allow in on eth0 to 192.168.1.0/24 port 2223 proto udp

# Block all other inbound on WING interface
ufw deny in on eth0

# If MCP HTTP is on localhost only, no inbound needed
```

---

## 11. Modes of Operation

### read_only

```
WING_MODE=read_only npx wing-console-mcp
```

- All read tools available
- All write tools DENIED
- Safe for live shows, first connection, visitors
- Can still run diagnosis (diagnosis is read-only until fix phase)

### rehearsal_safe

```
WING_MODE=rehearsal_safe npx wing-console-mcp
```

- All read tools available
- Medium risk writes allowed (channel fader, mute, send, EQ)
- High and critical risk writes DENIED
- Delta caps enforced (fader: 3dB, send: 6dB, main: 1.5dB)
- Confirmation required for all writes
- Suitable for rehearsals and soundchecks

### maintenance

```
WING_MODE=maintenance npx wing-console-mcp
```

- All tools available (high and critical writes allowed)
- Exact confirmation required for high/critical operations
- Phantom, routing, scene recall require risk-acknowledged confirmation
- Delta caps still enforced unless overridden
- Use only when PA is disconnected or room is empty

### developer_raw

```
WING_MODE=developer_raw WING_ENABLE_RAW=true npx wing-console-mcp
```

- All tools including raw OSC/native protocol available
- Must be explicitly enabled
- Never available in live mode
- Only for development and debugging
- Requires local admin access

---

## 12. Running with Fake WING (Development)

For development without a physical WING console:

```bash
WING_DRIVER=fake WING_MODE=rehearsal_safe npx wing-console-mcp
```

The `FakeWingDriver` simulates:
- 48 channels with full parameter trees
- 16 buses
- 8 DCA groups
- 6 mute groups
- 8 matrix outputs
- 8 FX slots
- Main LR
- 48 headamp inputs
- Scenes
- USB recorder status
- Meter streams with simulated levels

### Fault Injection

```bash
WING_FAULT_INJECTION=1 WING_DRIVER=fake npx wing-console-mcp
```

When fault injection is enabled, the fake driver can simulate:
- Timeout errors (configurable probability)
- Disconnect events
- Readback mismatches
- Parameter not found

This is essential for testing safety policy responses.

---

## 13. Troubleshooting

### No WING devices found

**Symptom:** `wing_discover` returns empty list.

**Solutions:**
1. Verify WING and AI appliance are on the same subnet
2. Try direct IP: `wing_discover({ direct_ips: ["192.168.1.62"] })`
3. Check firewall: UDP 2222 must be allowed on the control LAN
4. Verify WING remote control is enabled in Setup
5. Manually ping the WING IP to confirm network connectivity

### Connection refused or timeout

**Symptom:** `wing_connect` fails with `PROTOCOL_ERROR` or `DRIVER_TIMEOUT`.

**Solutions:**
1. Verify WING firmware version (3.0+ required for native protocol)
2. Try OSC fallback: set `WING_DRIVER=osc`
3. Check that no other app (WING EDIT, CoPilot) has an exclusive session
4. Verify the WING IP hasn't changed (check console display)

### Write operation denied

**Symptom:** Write tool returns `POLICY_DENIED`.

**Solutions:**
1. Check current mode with `wing_get_status`
2. If in `read_only` mode, restart with `WING_MODE=rehearsal_safe`
3. If in `rehearsal_safe`, high/critical writes are denied -- switch to `WING_MODE=maintenance`
4. Check delta caps: large changes may be rejected; make smaller adjustments
5. If in live mode, raw tools are always denied regardless of mode

### Readback mismatch

**Symptom:** Write confirms but returns `READBACK_MISMATCH`.

**Solutions:**
1. This is a safety feature -- the written value didn't take effect
2. Check WING console display for the actual value
3. May indicate network issues or WING is busy
4. Try re-preparing the change
5. Check the audit log for details

### Meter reads return no signal

**Symptom:** `wing_meter_read` shows `present: false` on all targets.

**Solutions:**
1. Verify something is actually producing signal (speak into mic, play instrument)
2. Check the channel is not muted and fader is up
3. Try a longer meter window: `window_ms: 5000`
4. Run `wing_signal_path_trace` to identify where signal drops

### pnpm install fails

**Symptom:** `pnpm install` errors on native dependencies.

**Solutions:**
1. Ensure Node.js >= 18: `node --version`
2. Update pnpm: `npm install -g pnpm@latest`
3. Clear node_modules: `rm -rf node_modules pnpm-lock.yaml && pnpm install`
4. On Windows, use WSL2 or ensure build tools are installed

### MCP server won't start

**Symptom:** `npx wing-console-mcp` exits immediately.

**Solutions:**
1. Run build first: `pnpm build`
2. Check the server is built: `ls packages/wing-console-mcp/dist/`
3. Try direct Node: `node packages/wing-console-mcp/dist/server.js`
4. Check log output on stderr for error messages
5. Ensure `WING_MODE` is set

### Claude Code / Claude Desktop doesn't see tools

**Symptom:** Claude doesn't show any WING tools.

**Solutions:**
1. Verify the MCP config file is in the correct location
2. Check JSON syntax in the config file
3. Restart Claude Code / Claude Desktop completely
4. Run the MCP server manually to verify it starts:
   ```bash
   WING_DRIVER=fake WING_MODE=rehearsal_safe npx wing-console-mcp
   ```
   Should print MCP init messages on stdout.
5. Check Claude Code MCP status: `/mcp` in Claude Code

---

## 14. Security Notes

### Before connecting to a live PA

```
[ ] WING backup created (save current scene)
[ ] Output volume physically safe (amp gains low, master fader down)
[ ] AI in read_only mode (WING_MODE=read_only)
[ ] TTS output NOT routed to PA (local speaker/headphones only)
[ ] Raw tools disabled (WING_ENABLE_RAW=false)
[ ] Audit logs enabled and writable
[ ] Network stable (wired Ethernet, not Wi-Fi)
[ ] Emergency stop documented (physical mute button or power)
```

### Secrets management

- Never store API keys in `CLAUDE.md` or project files
- Use environment variables or a secret manager for `MCP_AUTH_TOKEN`
- Do not commit `.env` files to git
- Audit logs should not contain secrets

### Network hardening

- WING control LAN should be physically isolated or VLAN-separated
- No default credentials on any network equipment
- MCP HTTP auth token should be at least 32 characters, randomly generated
- Consider mTLS for production deployments

### Emergency procedures

1. **Physical mute**: The engineer can always mute the PA at the console or amp
2. **Disconnect AI**: Unplug the AI appliance from the WING control network
3. **Kill server**: `killall node` or `systemctl stop wing-console-mcp`
4. **Restore scene**: Recall the pre-AI scene backup from the WING console directly

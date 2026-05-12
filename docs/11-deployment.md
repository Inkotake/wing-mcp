# 11. Deployment

## 1. Rehearsal-room appliance

推荐硬件：

```text
- mini PC / Mac mini / NUC
- wired ethernet to WING control network
- optional second NIC for internet
- USB audio interface for voice mic / reference mic
- push-to-talk microphone
- engineer headphone or small local speaker
- optional touchscreen / iPad web UI
```

## 2. Network

```text
[Internet] optional
   |
[AI Appliance]
   | NIC 1: internet / Wi-Fi
   | NIC 2: WING control LAN
   v
[WING Console]
```

Rules：

- WING control LAN should not be exposed directly to public internet。
- MCP HTTP should bind localhost by default。
- Remote access via VPN / Tailscale / WireGuard / secure tunnel。
- Use auth token for any LAN HTTP MCP。

## 3. Services

```text
systemd services:
  wing-console-mcp.service
  sound-memory-mcp.service
  room-audio-mcp.service
  voice-shell.service
  operator-console.service
```

## 4. Configuration

`/etc/ai-sound-engineer/config.yaml`:

```yaml
room_id: room-a
mode: rehearsal_safe
wing:
  discovery:
    enabled: true
    direct_ips: ["192.168.1.62"]
  preferred_driver: native
  osc_fallback: true
safety:
  live_mode: true
  default_dry_run: true
  require_confirmation_for: [medium, high, critical]
voice:
  input: push_to_talk
  tts_output: local_speaker
memory:
  sqlite_path: /var/lib/ai-sound-engineer/memory.sqlite
  docs_path: /var/lib/ai-sound-engineer/docs
```

## 5. ChatGPT / Claude integration

### Local clients

Use stdio MCP server。

### Remote ChatGPT custom MCP

Current ChatGPT full MCP support requires remote server, not local-only server, for custom connectors. Use a relay or VPN-gated HTTP endpoint if needed. Never expose WING control directly.

## 6. Secrets

- API keys in environment or secret manager。
- Do not store API keys in `CLAUDE.md`。
- Avoid dumping secrets into audit logs。

## 7. Backup

Backup：

```text
- room docs
- patch sheets
- memory db
- audit logs
- safety policy config
- current WING scene/show backups if allowed
```

Do not auto-overwrite WING scenes without operator action。

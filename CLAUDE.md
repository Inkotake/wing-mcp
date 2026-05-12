# AI Sound Engineer Project Instructions

This project controls live audio hardware. Treat every mixer write operation as safety-critical.

## Project goal

Build a complete Behringer WING family AI sound engineer system:

- `wing-console-mcp`: full WING MCP server.
- `wing-native-sidecar`: Native/libwing backend.
- `fake-wing`: simulator for tests.
- `sound-diagnosis-engine`: no-sound / feedback / monitor workflows.
- `sound-memory-mcp`: room knowledge, patch sheets, memories, incidents.
- `room-audio-mcp`: optional local audio analysis.
- `voice-shell`: push-to-talk and realtime voice UX.
- `wing-console-operator` Skill.

## Non-negotiable safety rules

1. Never implement a mixer write path without read-before-write and readback.
2. Every write tool must use `prepare -> confirmation -> apply -> audit`.
3. Phantom power, routing, scene/snapshot/show recall, main mute/fader, mute groups, DCA mute, virtual soundcheck, network/global preferences are high or critical risk.
4. Raw OSC/native tools are disabled by default and forbidden in live mode.
5. Do not expose thousands of raw WING params directly as individual MCP tools.
6. Prefer high-level semantic tools over raw param tools.
7. Do not copy leaked Claude Code source or internal prompts.
8. Do not bundle vendor PDFs unless licensing permits; link to official sources.

## Architecture

- TypeScript for MCP server.
- Rust for WING Native sidecar.
- JSON-RPC between TypeScript and sidecar.
- OSC fallback via UDP 2223.
- wapi optional sidecar only after license review.
- SQLite + vector store for memory/RAG.
- All public tool outputs are structured JSON plus concise human summary.

## Development sequence

Start with issues in order:

1. Monorepo skeleton.
2. fake-wing.
3. discovery.
4. schema catalog and risk catalog.
5. native sidecar.
6. OSC fallback.
7. safety engine.
8. high-level tools.
9. meters.
10. diagnosis.
11. memory.
12. voice.
13. skill.
14. dashboard.

## Testing requirements

Every new tool needs:

- unit tests.
- fake-wing integration test.
- safety policy test.
- audit test for writes.
- hardware tests gated behind `WING_HARDWARE_TEST=1`.

Real hardware write tests must also require `WING_HARDWARE_WRITE_TEST=1`.

## Coding standards

- TypeScript strict mode.
- Zod schemas for all MCP inputs.
- Structured outputs.
- Rust sidecar must log to stderr, not stdout if stdio is protocol channel.
- No secrets in repo.
- No unbounded retries against real hardware.

## Agent behavior

Before coding, read:

- `docs/00-executive-brief.md`
- `docs/03-development-roadmap.md`
- `docs/06-safety-policy.md`
- current issue file

When uncertain about hardware behavior, implement fake test and leave a hardware validation TODO rather than guessing.

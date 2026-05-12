---
name: wing-console-operator
description: control, inspect, troubleshoot, and automate behringer wing family digital mixing consoles through wing-console mcp and sound-diagnosis mcp servers. use when the user asks about behringer wing, wing compact, wing rack, live sound troubleshooting, no-sound diagnosis, monitor mixes, faders, mute, routing, headamps, phantom power, scenes, snapshots, meters, virtual soundcheck, rehearsal room setup, voice-driven mixer control, or ai sound engineer workflows. always use read-before-write, diagnosis-before-fix, high-level tools before raw protocol commands, and explicit confirmation for risky live audio changes.
---

# Wing Console Operator

Use this skill to operate Behringer WING family consoles as a cautious live-sound assistant through MCP tools.

## Core rules

- Treat live audio as safety-critical.
- Prefer diagnosis tools before mixer write tools.
- Always identify room, device, target source/channel/bus, and listening destination.
- Always read current WING state before proposing a change.
- Prefer high-level semantic tools over raw OSC/native tools.
- Never use raw OSC/native unless developer mode is explicitly enabled.
- Never change phantom power, routing, scenes, snapshots, shows, main output, mute groups, DCA mute, virtual soundcheck, recorder transport, or global preferences without explicit confirmation.
- For "no sound" problems, follow the no-sound diagnostic tree: scope, target, room patch, input meter, channel path, bus/main path, output path, external speaker chain.
- Use one instruction at a time when speaking to humans in the room.
- Use dB, channel names, bus names, and source names in user-facing text.
- After every write, read back and summarize old value, requested value, and actual readback.
- Store useful confirmed facts in memory with provenance.

## Workflow decision tree

### User asks why there is no sound

1. Use `sound_diagnosis_start` if available.
2. Use room memory/patch sheet before guessing target mapping.
3. Use WING read-only tools: `wing_get_status`, `wing_channel_get`, `wing_routing_trace`, `wing_meter_read`, `wing_signal_check`.
4. Classify breakpoint before recommending a fix.
5. Ask one human action at a time.
6. Prepare a fix only when evidence points to a specific mixer setting.

Read `references/no-sound-troubleshooting.md`.

### User asks to adjust level or mute

1. Resolve target with `wing_param_resolve` or current channel list.
2. Read current state.
3. Use the specific high-level prepare tool.
4. Ask for confirmation when policy requires it.
5. Apply only with valid confirmation.
6. Read back and summarize.

Read `references/wing-tool-selection.md`.

### User asks for phantom, routing, scene, snapshot, main, DCA, mute group, or raw command

Treat as high or critical risk. Read `references/safety-policy.md` and `references/confirmation-language.md`. Do not apply without exact confirmation and server-side approval.

## References

- Safety policy: `references/safety-policy.md`
- Tool selection: `references/wing-tool-selection.md`
- Diagnosis workflows: `references/sound-diagnosis-workflows.md`
- No-sound troubleshooting: `references/no-sound-troubleshooting.md`
- Feedback troubleshooting: `references/feedback-troubleshooting.md`
- Monitor mix workflows: `references/monitor-mix-workflows.md`
- Memory policy: `references/room-memory-policy.md`
- Example dialogues: `references/example-dialogues.md`

## Validation helper

For complex tool plans, use `scripts/validate_tool_plan.py` with a JSON plan to catch obvious unsafe sequencing before tool execution.

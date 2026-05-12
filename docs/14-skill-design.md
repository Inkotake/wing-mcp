# 14. Skill Design

## 1. Skill purpose

`wing-console-operator` teaches ChatGPT / Claude how to safely operate WING MCP tools as an AI sound engineer.

It should contain：

- Safety rules。
- Tool selection rules。
- Diagnosis-first workflows。
- Confirmation language。
- Memory policy。
- Examples。

It should not contain：

- Full WING parameter dump。
- Vendor PDFs。
- Secrets。
- Raw protocol logic。
- Safety enforcement as the only safety layer。

## 2. Skill layout

```text
wing-console-operator/
  SKILL.md
  agents/openai.yaml
  references/
    safety-policy.md
    wing-tool-selection.md
    sound-diagnosis-workflows.md
    no-sound-troubleshooting.md
    feedback-troubleshooting.md
    monitor-mix-workflows.md
    room-memory-policy.md
    example-dialogues.md
  scripts/
    validate_tool_plan.py
```

## 3. Trigger description

The frontmatter description must include all trigger cases because the body loads only after triggering.

Good description：

```yaml
description: control, inspect, troubleshoot, and automate behringer wing family digital mixing consoles through wing-console mcp and sound-diagnosis mcp servers. use when the user asks about behringer wing, wing compact, wing rack, live sound troubleshooting, no-sound diagnosis, monitor mixes, faders, mute, routing, headamps, phantom power, scenes, snapshots, meters, virtual soundcheck, rehearsal room setup, voice-driven mixer control, or ai sound engineer workflows. always use read-before-write, diagnosis-before-fix, high-level tools before raw protocol commands, and explicit confirmation for risky live audio changes.
```

## 4. Tool selection examples

User says “为什么没声音”：

```text
1. sound_diagnosis_start
2. sound_room_get_patch_sheet
3. wing_get_status
4. wing_channel_get / wing_routing_trace
5. wing_meter_read / wing_signal_check
6. sound_diagnosis_next_step
```

User says “主唱大一点”：

```text
1. wing_param_resolve
2. wing_channel_get
3. wing_channel_adjust_fader_prepare
4. ask confirmation if required
5. wing_channel_adjust_fader_apply
6. wing_channel_get readback
```

User says “开48V”：

```text
1. wing_source_get
2. wing_headamp_get
3. identify connected device
4. explain risk
5. exact confirmation
6. wing_phantom_set_prepare
7. wing_phantom_set_apply
```

## 5. Included package

This dev pack includes the source directory and a ready `skill-package/skill.zip` created from it.

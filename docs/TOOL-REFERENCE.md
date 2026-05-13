# WING Console MCP -- Complete Tool Reference

> Auto-generated from the `wing-console-mcp` TypeScript source and `types.ts` risk map.
> Last updated: 2026-05-12

## Tool Categories

| Category | Tools | Description |
|----------|-------|-------------|
| **Device** | wing_discover, wing_connect, wing_get_status | Console discovery and connection |
| **Schema** | wing_schema_search, wing_param_resolve | Parameter lookup and alias resolution |
| **Params** | wing_param_get, wing_param_set_prepare/apply | Low-level parameter read/write |
| **Channels** | wing_channel_list, wing_channel_get, wing_channel_adjust_fader_prepare/apply, wing_channel_set_mute_prepare/apply | Channel strip control |
| **Sends** | wing_send_get, wing_send_adjust_prepare/apply | Monitor/aux send control |
| **Routing** | wing_routing_trace, wing_routing_get, wing_routing_set_prepare/apply | Signal routing |
| **Headamp** | wing_headamp_get, wing_headamp_set_prepare/apply, wing_phantom_set_prepare/apply | Preamps and phantom power |
| **Scenes** | wing_scene_list, wing_scene_recall_prepare/apply, wing_snapshot_save_prepare/apply | Scene and snapshot management |
| **Meters** | wing_meter_catalog, wing_meter_read, wing_signal_check | Signal and meter monitoring |
| **Diagnosis** | sound_diagnosis_start, sound_diagnosis_next_step, sound_diagnosis_prepare_fix, sound_diagnosis_apply_fix | Structured sound problem diagnosis |
| **Views** | wing_quick_check, wing_state_summary, wing_state_snapshot, wing_channel_strip, wing_signal_path_trace | Multi-level mixer state views |
| **Processing** | wing_eq_get, wing_eq_set_band_prepare/apply, wing_gate_get, wing_gate_set_prepare/apply, wing_comp_get, wing_comp_set_prepare/apply, wing_fx_slot_list, wing_fx_slot_get, wing_fx_slot_set_model_prepare/apply | EQ, gate, compressor, FX |
| **Groups** | wing_dca_list, wing_dca_get, wing_dca_set_mute_prepare/apply, wing_dca_adjust_fader_prepare/apply, wing_mute_group_list, wing_mute_group_set_prepare/apply, wing_main_get, wing_main_adjust_fader_prepare/apply, wing_main_set_mute_prepare/apply, wing_matrix_list | DCA, mute groups, main LR, matrix |
| **Bulk** | wing_param_bulk_get, wing_debug_dump_state, wing_usb_recorder_get | Multi-parameter reads, debug dumps |
| **Raw** | wing_raw_osc_prepare/apply, wing_raw_native_prepare/apply | Developer raw protocol (disabled by default) |

## Risk Levels

| Risk | Meaning | Confirmation Required | Allowed in rehearsal_safe | Allowed in maintenance |
|------|---------|----------------------|--------------------------|----------------------|
| **none** | Read-only, no effect | No | Yes | Yes |
| **low** | Cosmetic, name/color | No | Yes | Yes |
| **medium** | Channel fader, mute, send, EQ | Yes | Yes | Yes |
| **high** | Main fader, DCA, mute group, gate, FX | Yes (exact) | **No** | Yes (exact) |
| **critical** | Phantom, routing, scene recall, raw | Yes (exact + risk ack) | **No** | Yes (exact + risk ack) |

### Delta Caps (rehearsal_safe & maintenance)

| Parameter | Max Delta |
|-----------|-----------|
| Channel fader | 3 dB |
| Send level | 6 dB |
| Main LR fader | 1.5 dB |
| EQ gain | 3 dB |
| Gate threshold | 6 dB |
| Max writes per minute | 12 |

---

## 1. Device Tools

### wing_discover

**Risk:** none | **Read-only**

Discover WING family consoles on the control network via UDP broadcast on port 2222.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `timeout_ms` | number | No | Discovery timeout in milliseconds. Default 3000. |
| `direct_ips` | string[] | No | Optional list of IP addresses to probe directly. |

**Output:** Array of `WingDevice` objects with `id`, `ip`, `name`, `model`, `serial`, `firmware`.

**Example:**
```json
{
  "timeout_ms": 3000,
  "direct_ips": ["192.168.1.62"]
}
```

**Safety:** Read-only. Never writes to the console. May be run at any time in any mode.

---

### wing_connect

**Risk:** none | **Read-only (establishes driver session)**

Establish a driver session with a selected WING console.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `device` | object | Yes | Device descriptor from `wing_discover`. Must include `id` and `ip`. |

**Output:** Connected device info: `name`, `model`, `firmware`, `serial`.

**Example:**
```json
{
  "device": {
    "id": "wing-serial-xxx",
    "ip": "192.168.1.62",
    "name": "Room A WING",
    "model": "ngc-full"
  }
}
```

**Safety:** Establishes a control session. Does not modify mixer state. Disconnect may interrupt active operations.

---

### wing_get_status

**Risk:** none | **Read-only**

Return connection status, driver type, current mode, live mode flag, and device information.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| _(none)_ | -- | -- | No input parameters. |

**Output:**
```json
{
  "device": { "name": "Room A WING", "model": "ngc-full", "firmware": "3.1" },
  "driver": "native",
  "connected": true,
  "mode": "rehearsal_safe",
  "liveMode": false
}
```

**Safety:** Read-only. Safe to call frequently. First tool to call in any session.

---

## 2. Schema Tools

### wing_schema_search

**Risk:** none | **Read-only**

Find WING parameters by natural language, English, Chinese, or canonical path fragment.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `query` | string | Yes | Search query in English, Chinese, or canonical path. |

**Output:** Array of matching schema entries with `path`, `description`, `aliases`, `risk`.

**Example:**
```json
{ "query": "channel 1 phantom" }
```

**Safety:** Read-only. Uses a curated schema catalog; does not query the console directly.

---

### wing_param_resolve

**Risk:** none | **Read-only**

Resolve human phrases ("主唱", "drummer monitor", "main vocal") to WING mixer targets (channel, bus, send).

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `phrase` | string | Yes | User phrase to resolve (English or Chinese). |
| `room_id` | string | No | Optional room identifier for patch sheet lookup. |

**Output:** Resolved target with `channel`, `target` name, and `candidates` list.

**Example:**
```json
{ "phrase": "鼓手耳返", "room_id": "room-a" }
```

**Safety:** Read-only. Does not modify state. Used for fuzzy matching before parameter reads.

---

## 3. Generic Parameter Tools

### wing_param_get

**Risk:** none | **Read-only**

Read the current value of any WING parameter by its canonical path.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `path` | string | Yes | Canonical WING parameter path (e.g. `/ch/1/fader`, `/main/lr/mute`). |

**Output:** `WingValue` object with `type` and `value` fields.

**Example:**
```json
{ "path": "/ch/1/mute" }
```

**Safety:** Read-only. No confirmation needed. Prefer high-level tools for common reads.

---

### wing_param_set_prepare

**Risk:** medium (dynamic) | **Write: prepare**

Prepare a generic WING parameter write. Returns a confirmation ticket if required.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `path` | string | Yes | Canonical WING parameter path. |
| `value` | object | Yes | `WingValue` object with `type` and `value`. |
| `reason` | string | Yes | Why this change is being made. |

**Output:** Confirmation ticket with `confirmationId`, `risk`, `oldValue`, `requestedValue`.

**Example:**
```json
{
  "path": "/ch/1/fader",
  "value": { "type": "float", "value": -3.0, "unit": "dB" },
  "reason": "User asked to bring vocal 1 up"
}
```

**Safety:** Dynamic risk classification based on path. Prefer high-level tools with fixed risk. Requires `wing_param_set_apply` to execute.

---

### wing_param_set_apply

**Risk:** medium (dynamic) | **Write: apply**

Apply a prepared generic parameter write. Requires `confirmation_id` from `wing_param_set_prepare`.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `path` | string | Yes | Must match prepare. |
| `value` | object | Yes | Must match prepare. |
| `reason` | string | Yes | Why this change is being made. |
| `confirmation_id` | string | Yes | Confirmation ID from prepare step. |

**Output:** Result with `oldValue`, `requestedValue`, `readbackValue`, `auditId`.

**Safety:** Validates ticket target, tool, and expiry. Performs readback. Logs audit record.

---

## 4. Channel Tools

### wing_channel_list

**Risk:** none | **Read-only**

List all channels (1-48) on the WING console with names, mute status, and fader levels.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| _(none)_ | -- | -- | No input parameters. |

**Output:** Array of `{ ch, name, mute, fader }` objects.

**Safety:** Read-only. Reads up to 48 channels sequentially; may have latency on slow connections.

---

### wing_channel_get

**Risk:** none | **Read-only**

Get full state of a specific channel: name, source, mute, fader, pan, plus raw node data.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `channel` | number | Yes | Channel number (1-48). |

**Output:** `{ channel, name, mute, fader, raw }` with all available parameters.

**Example:**
```json
{ "channel": 1 }
```

Output:
```json
{
  "channel": 1,
  "name": "Vocal 1",
  "mute": false,
  "fader": -6.0,
  "raw": { ... }
}
```

**Safety:** Read-only. Prefer `wing_channel_strip` for deeper detail (EQ, dynamics, sends).

---

### wing_channel_adjust_fader_prepare

**Risk:** medium | **Write: prepare**

Prepare a channel fader adjustment by delta dB. Capped at 3 dB in rehearsal mode.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `channel` | number | Yes | Channel number (1-48). |
| `delta_db` | number | Yes | Fader change in dB (positive = louder). |
| `reason` | string | Yes | Why this adjustment is needed. |

**Output:** Confirmation ticket with `confirmationId`, current and target fader values.

**Example:**
```json
{
  "channel": 1,
  "delta_db": 3,
  "reason": "User asked: 主唱大一点"
}
```

**Safety:** Medium risk. Requires confirmation. Delta capped at 3 dB. Read-before-write enforced.

---

### wing_channel_adjust_fader_apply

**Risk:** medium | **Write: apply**

Apply a prepared channel fader adjustment.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `channel` | number | Yes | Must match prepare. |
| `delta_db` | number | Yes | Must match prepare. |
| `reason` | string | Yes | Why this adjustment is needed. |
| `confirmation_id` | string | Yes | Confirmation ID from prepare step. |

**Output:** Result with `oldValue`, `requestedValue`, `readbackValue`, `auditId`.

**Safety:** Validates ticket. Computes delta from current value. Performs readback.

---

### wing_channel_set_mute_prepare

**Risk:** medium | **Write: prepare**

Prepare muting or unmuting a channel.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `channel` | number | Yes | Channel number (1-48). |
| `mute` | boolean | Yes | True to mute, false to unmute. |
| `reason` | string | Yes | Why this mute change is needed. |

**Example:**
```json
{
  "channel": 1,
  "mute": false,
  "reason": "Unmute vocal channel per user request"
}
```

**Safety:** Medium risk. Muting a channel can cause silence for that source. Unmuting can cause unexpected sound.

---

### wing_channel_set_mute_apply

**Risk:** medium | **Write: apply**

Apply a prepared channel mute change.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `channel` | number | Yes | Must match prepare. |
| `mute` | boolean | Yes | Must match prepare. |
| `reason` | string | Yes | Why this mute change is needed. |
| `confirmation_id` | string | Yes | Confirmation ID from prepare step. |

**Safety:** Validates ticket. Readback verifies mute state applied correctly.

---

## 5. Send (Monitor / Aux) Tools

### wing_send_get

**Risk:** none | **Read-only**

Read the send level from a channel to a bus (monitor/aux send).

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `channel` | number | Yes | Source channel number. |
| `bus` | number | Yes | Destination bus number (1-16). |

**Example:**
```json
{ "channel": 1, "bus": 1 }
```

**Safety:** Read-only. Key tool for diagnosing monitor mix issues.

---

### wing_send_adjust_prepare

**Risk:** medium | **Write: prepare**

Prepare adjusting a monitor/aux send level. Capped at 6 dB delta in rehearsal mode.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `channel` | number | Yes | Source channel number. |
| `bus` | number | Yes | Destination bus number (1-16). |
| `delta_db` | number | Yes | Send level change in dB. |
| `reason` | string | Yes | Why this adjustment is needed. |

**Example:**
```json
{
  "channel": 3,
  "bus": 1,
  "delta_db": 4,
  "reason": "Drummer wants more guitar in IEM"
}
```

**Safety:** Medium risk. Particularly important for IEM sends -- large changes can cause hearing damage.

---

### wing_send_adjust_apply

**Risk:** medium | **Write: apply**

Apply a prepared send level adjustment.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `channel` | number | Yes | Must match prepare. |
| `bus` | number | Yes | Must match prepare. |
| `delta_db` | number | Yes | Must match prepare. |
| `reason` | string | Yes | Why this adjustment is needed. |
| `confirmation_id` | string | Yes | Confirmation ID from prepare step. |

**Safety:** Validates ticket. Re-reads current level, computes delta, performs readback.

---

## 6. Routing Tools

### wing_routing_trace

**Risk:** none | **Read-only**

Trace a signal path from a source (channel, bus, main) through all related parameters.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `source` | string | Yes | Source: `ch/{n}`, `bus/{n}`, or `main/lr`. |

**Output:** Map of all parameters under the given source path, with their current values.

**Safety:** Read-only. Fundamental for signal path diagnosis.

---

### wing_routing_get

**Risk:** none | **Read-only**

Read the current input/output routing patch for a specific target.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `target` | string | Yes | Target: `ch/{n}/source`, `bus/{n}/out`, `main/lr/out`. |

**Safety:** Read-only. Returns the current routing assignment for the target.

---

### wing_routing_set_prepare

**Risk:** critical | **Write: prepare**

Prepare a routing change. **CRITICAL -- can silence PA or monitors.**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `target` | string | Yes | Routing target to change (e.g. `ch/1/source`). |
| `destination` | string | Yes | New routing destination (e.g. `Local 2`). |
| `reason` | string | Yes | Why this routing change is needed. Must acknowledge risk. |

**Example:**
```json
{
  "target": "ch/1/source",
  "destination": "Local 1",
  "reason": "Vocal XLR moved from Local 2 to Local 1"
}
```

**Safety:** CRITICAL risk. Requires exact confirmation with risk acknowledgment. Denied in rehearsal_safe mode. Always generates audit record.

**Confirmation template:**
```
确认修改 ch/1/source 的路由，我知道可能导致主扩或耳返无声
```

---

### wing_routing_set_apply

**Risk:** critical | **Write: apply**

Apply a prepared routing change.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `target` | string | Yes | Must match prepare. |
| `destination` | string | Yes | Must match prepare. |
| `reason` | string | Yes | Why this routing change is needed. |
| `confirmation_id` | string | Yes | Confirmation ID from prepare step. |

**Safety:** CRITICAL risk. Denied in rehearsal_safe mode. Requires exact match of confirmation template.

---

## 7. Headamp Tools

### wing_headamp_get

**Risk:** none | **Read-only**

Read headamp settings for a local input: gain and phantom power status.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `input` | number | Yes | Local input number (1-48). |

**Output:**
```json
{
  "input": 1,
  "gain": "30.0 dB",
  "phantom": "OFF"
}
```

**Safety:** Read-only. Useful as pre-check before phantom power or gain changes.

---

### wing_headamp_set_prepare

**Risk:** high | **Write: prepare**

Prepare a headamp gain change. Large gain changes can cause feedback or overdrive.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `input` | number | Yes | Local input number (1-48). |
| `gain_db` | number | Yes | Target headamp gain in dB (typically 0-60). |
| `reason` | string | Yes | Why this gain change is needed. |

**Safety:** HIGH risk. Requires confirmation. Denied in rehearsal_safe mode.

---

### wing_headamp_set_apply

**Risk:** high | **Write: apply**

Apply a prepared headamp gain change.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `input` | number | Yes | Must match prepare. |
| `gain_db` | number | Yes | Must match prepare. |
| `reason` | string | Yes | Why this gain change is needed. |
| `confirmation_id` | string | Yes | Confirmation ID from prepare step. |

**Safety:** Requires confirmation. Readback verifies gain was applied correctly.

---

### wing_phantom_set_prepare

**Risk:** critical | **Write: prepare**

Prepare turning phantom power (48V) on/off for a local input. **CRITICAL -- can damage non-phantom equipment.**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `input` | number | Yes | Local input number (1-48). |
| `enable` | boolean | Yes | True to turn ON 48V phantom power. |
| `reason` | string | Yes | Why phantom power change is needed. Must acknowledge risk. |

**Example:**
```json
{
  "input": 1,
  "enable": true,
  "reason": "Condenser mic connected to LCL.1 needs 48V"
}
```

**Safety:** CRITICAL risk. Denied in rehearsal_safe mode. Requires exact confirmation with risk acknowledgment.

**Confirmation template:**
```
确认开启 LCL.1 的 48V 幻象电源，我确认连接设备需要幻象电源
```

---

### wing_phantom_set_apply

**Risk:** critical | **Write: apply**

Apply a prepared phantom power change.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `input` | number | Yes | Must match prepare. |
| `enable` | boolean | Yes | Must match prepare. |
| `reason` | string | Yes | Why phantom power change is needed. |
| `confirmation_id` | string | Yes | Confirmation ID from prepare step. |

**Safety:** CRITICAL risk. Requires exact risk-acknowledged confirmation.

---

## 8. Scene Tools

### wing_scene_list

**Risk:** none | **Read-only**

List available scenes/snapshots and the current scene.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| _(none)_ | -- | -- | No input parameters. |

**Output:** `{ current: <scene_index>, scenes: [{ index, name }] }`

**Safety:** Read-only. Lists scene names; does not recall or modify anything.

---

### wing_scene_recall_prepare

**Risk:** critical | **Write: prepare**

Prepare recalling a scene/snapshot. **CRITICAL -- will change entire mixer state.**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `scene_index` | number | Yes | Scene index to recall. |
| `reason` | string | Yes | Why this scene recall is needed. Must acknowledge risk. |

**Safety:** CRITICAL risk. Denied in rehearsal_safe mode. Requires exact confirmation with risk acknowledgment.

**Confirmation template:**
```
确认 recall Scene {n}，我知道这会改变当前调音台状态
```

---

### wing_scene_recall_apply

**Risk:** critical | **Write: apply**

Apply a prepared scene recall.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `scene_index` | number | Yes | Must match prepare. |
| `reason` | string | Yes | Why this scene recall is needed. |
| `confirmation_id` | string | Yes | Confirmation ID from prepare step. |

**Safety:** CRITICAL risk. Full safety check before execution. Readback and audit enforced.

---

### wing_snapshot_save_prepare

**Risk:** medium | **Write: prepare**

Prepare saving a new snapshot with a given name.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `name` | string | Yes | Name for the new snapshot. |
| `reason` | string | Yes | Why this snapshot is being saved. |

**Safety:** Medium risk. Saves current state; does not modify audio.

---

### wing_snapshot_save_apply

**Risk:** medium | **Write: apply**

Apply a prepared snapshot save.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `name` | string | Yes | Must match prepare. |
| `reason` | string | Yes | Why this snapshot is being saved. |
| `confirmation_id` | string | Yes | Confirmation ID from prepare step. |

**Safety:** Medium risk. Confirmation required.

---

## 9. Meter Tools

### wing_meter_catalog

**Risk:** none | **Read-only**

List available meter sources organized by category.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| _(none)_ | -- | -- | No input parameters. |

**Output:** Categories with path arrays: `inputs`, `buses`, `main`, `headamps`.

**Safety:** Read-only. Use to discover what meters are available before subscribing.

---

### wing_meter_read

**Risk:** none | **Read-only**

Read meter levels (RMS dBFS, peak dBFS, signal presence) for specified targets.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `targets` | string[] | Yes | List of meter target paths (e.g. `["/ch/1/fader", "/main/lr/fader"]`). |
| `window_ms` | number | No | Meter window in milliseconds. Default 500. |

**Output:**
```json
{
  "meters": [
    {
      "target": "/ch/1/fader",
      "rmsDbfs": -18.2,
      "peakDbfs": -6.1,
      "present": true
    }
  ]
}
```

**Safety:** Read-only. Core diagnostic tool for all sound problems.

---

### wing_signal_check

**Risk:** none | **Read-only**

Check whether specific targets have signal present, with confidence assessment.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `targets` | string[] | Yes | List of paths to check for signal presence. |
| `window_ms` | number | No | Check window in milliseconds. Default 3000. |

**Output:** `{ checks: [{ target, present, confidence, rmsDbfs, peakDbfs }], hasAnySignal }`

**Safety:** Read-only. Use BEFORE making changes in "no sound" scenarios. If no signal detected, `next_actions` suggests starting diagnosis.

**Example:**
```json
{
  "targets": ["/ch/1/fader", "/main/lr/fader"],
  "window_ms": 3000
}
```

---

## 10. Diagnosis Tools

### sound_diagnosis_start

**Risk:** none | **Read-only (creates session)**

Start a structured sound diagnosis session for common problems.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `workflow` | string | Yes | One of: `no_sound`, `feedback`, `monitor_mix`, `recording_no_signal`, `livestream_no_signal` |
| `target` | string | Yes | What/who has the problem (e.g. "main vocal", "鼓手耳返", "main PA"). |
| `room_id` | string | No | Optional room identifier for patch sheet lookup. |
| `description` | string | No | Brief description of the problem. |

**Output:** Session object with `id`, `state`, `breakpoints`, and `nextStep` guidance.

**Safety:** Creates a session state machine. Does not modify console. ALWAYS start diagnosis with this tool before making changes.

**Example:**
```json
{
  "workflow": "no_sound",
  "target": "主唱",
  "room_id": "room-a",
  "description": "主唱话筒完全没有声音进PA"
}
```

**Available workflows:**
- `no_sound` -- Checks: source, input_patch, channel, bus_send, bus_main, output
- `feedback` -- Checks: monitor_level, mic_placement, eq_ringing, gain_staging
- `monitor_mix` -- Checks: send_level, bus_routing, bus_mute, pre_post
- `recording_no_signal` -- Checks recording path
- `livestream_no_signal` -- Checks livestream path

---

### sound_diagnosis_next_step

**Risk:** none | **Read-only**

Advance the diagnosis session to the next step after reporting findings.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `session_id` | string | Yes | Diagnosis session ID from `sound_diagnosis_start`. |
| `finding` | string | No | What was found in the previous step. |
| `breakpoint_status` | string | No | Status of current breakpoint: `pass` or `fail`. |

**Output:** Updated session state with next step guidance and suggested tool calls.

**Safety:** Read-only. Guides the diagnosis process step by step. Never suggests changes before reading state.

---

### sound_diagnosis_prepare_fix

**Risk:** dynamic (typically medium) | **Write: prepare**

Prepare a fix identified by the diagnosis engine.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `session_id` | string | Yes | Diagnosis session ID. |
| `fix_description` | string | Yes | Description of what to fix. |
| `tool_to_use` | string | Yes | MCP tool name to use for the fix. |
| `target_path` | string | Yes | Target parameter path. |
| `target_value` | object | Yes | Target value as WingValue. |

**Safety:** Dynamic risk based on tool and path. Always goes through ChangePlanner.

---

### sound_diagnosis_apply_fix

**Risk:** dynamic | **Write: apply**

Apply a prepared diagnosis fix.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `session_id` | string | Yes | Must match prepare. |
| `tool_to_use` | string | Yes | Must match prepare. |
| `target_path` | string | Yes | Must match prepare. |
| `target_value` | object | Yes | Must match prepare. |
| `fix_description` | string | Yes | Fix description. |
| `confirmation_id` | string | Yes | Confirmation ID from prepare. |

**Safety:** Validates ticket. After successful fix, session advances to `verify` state.

---

## 11. View Tools

### wing_quick_check

**Risk:** none | **Read-only**

Fast health overview: muted channels, low faders, Main LR presence. Use first to check for obvious issues.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `include_meters` | boolean | No | Also do a quick meter sweep. Default false (faster). |

**Output:** `{ device, issues[], ok[], verdict: "healthy" | "needs_attention" }`

**Safety:** Read-only. Optimized for speed -- run this first in any session.

---

### wing_state_summary

**Risk:** none | **Read-only**

Structured overview of the entire mixer state: channels, buses, main LR, scenes.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `detail_level` | string | No | `compact`, `normal`, or `extended`. Default `normal`. |
| `sections` | string[] | No | Sections to include: `channels`, `buses`, `main`, `headamps`, `dcas`, `scenes`, `meters`, or `all`. |

**Output:** Organized state object with device info, channel list, bus list, main status, and scene.

**Safety:** Read-only. The go-to tool for understanding "what's happening on the console right now."

---

### wing_state_snapshot

**Risk:** none | **Read-only**

Complete dump of entire mixer state including channels, buses, headamps, meters.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `include_meters` | boolean | No | Include meter readings. Default true. |
| `max_channels` | number | No | Limit channel count. Default 48. |

**Output:** Full JSON snapshot with meta, channels[], buses[], main{}, headamps[], meters[].

**Safety:** Read-only. Large output -- use sparingly. Prefer `wing_state_summary` for routine tasks.

---

### wing_channel_strip

**Risk:** none | **Read-only**

Deep-dive on a single channel: identity, EQ bands, gate, compressor, sends.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `channel` | number | Yes | Channel number to inspect. |
| `include_sends` | boolean | No | Include all 16 send levels. Default false. |

**Output:** Organized by category: `identity`, `eq`, `dynamics`, `sends`.

**Safety:** Read-only. Use when you need to understand a specific channel in detail.

---

### wing_signal_path_trace

**Risk:** none | **Read-only**

Follow a signal from source through the entire mixer path, identifying every breakpoint.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `channel` | number | Yes | Channel to trace. |
| `include_meters` | boolean | No | Include meter readings at each stage. Default true. |

**Output:** Trace array with stages: `1_headamp`, `2_channel`, `3_send_bus1`, `4_main_lr`, plus warnings.

**Safety:** Read-only. Foundational diagnostic tool. Tells you exactly where signal stops.

---

## 12. Processing Tools

### wing_eq_get

**Risk:** none | **Read-only**

Read all 4-band EQ settings for a channel or bus.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `target` | string | Yes | Canonical path prefix: `ch/{n}` or `bus/{n}`. |

**Output:** `{ target, eqOn, bands: { high, hi_mid, lo_mid, low } }`

**Safety:** Read-only.

---

### wing_eq_set_band_prepare

**Risk:** medium (gain) / high (large Q or freq shifts) | **Write: prepare**

Prepare an EQ band parameter adjustment.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `target` | string | Yes | `ch/{n}` or `bus/{n}`. |
| `band` | string | Yes | `high`, `hi_mid`, `lo_mid`, or `low`. |
| `parameter` | string | Yes | `gain`, `freq`, or `q`. |
| `value` | number | Yes | New value in appropriate units. |
| `reason` | string | Yes | Why this EQ change is needed. |

**Example:**
```json
{
  "target": "ch/1",
  "band": "high",
  "parameter": "gain",
  "value": 2.5,
  "reason": "Add air to vocal"
}
```

**Safety:** Gain changes capped at 3 dB. Confirmation required.

---

### wing_eq_set_band_apply

**Risk:** medium | **Write: apply**

Apply a prepared EQ band adjustment.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `target` | string | Yes | Must match prepare. |
| `band` | string | Yes | Must match prepare. |
| `parameter` | string | Yes | Must match prepare. |
| `value` | number | Yes | Must match prepare. |
| `reason` | string | Yes | Why this EQ change is needed. |
| `confirmation_id` | string | Yes | Confirmation ID from prepare. |

**Safety:** Validates ticket. Readback verifies the change.

---

### wing_gate_get

**Risk:** none | **Read-only**

Read noise gate settings for a channel: threshold, range, attack, hold, release, on/off.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `channel` | number | Yes | Channel number. |

**Output:** `{ channel, gate: { threshold, range, attack, hold, release, on } }`

**Safety:** Read-only. Critical for no-sound diagnosis: a clamped gate completely silences a channel.

---

### wing_gate_set_prepare

**Risk:** high | **Write: prepare**

Prepare a gate parameter change. **HIGH risk -- can silence a channel.**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `channel` | number | Yes | Channel number. |
| `parameter` | string | Yes | `threshold`, `range`, `attack`, `hold`, or `release`. |
| `value` | number | Yes | New value in dB (threshold/range) or ms (attack/hold/release). |
| `reason` | string | Yes | Why this gate change is needed. |

**Safety:** HIGH risk. Gate threshold changes capped at 6 dB. Denied in rehearsal_safe. Use with extreme caution during no-sound diagnosis.

---

### wing_gate_set_apply

**Risk:** high | **Write: apply**

Apply a prepared gate change.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| All from prepare | -- | Yes | Must match prepare exactly. |
| `confirmation_id` | string | Yes | Confirmation ID from prepare. |

**Safety:** HIGH risk. Requires exact confirmation.

---

### wing_comp_get

**Risk:** none | **Read-only**

Read compressor settings for a channel or bus: threshold, ratio, attack, release, gain, on/off.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `target` | string | Yes | `ch/{n}` or `bus/{n}`. |

**Output:** `{ target, comp: { threshold, ratio, attack, release, gain, on } }`

**Safety:** Read-only.

---

### wing_comp_set_prepare

**Risk:** medium (threshold/gain), low (attack/release) | **Write: prepare**

Prepare a compressor parameter change.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `target` | string | Yes | `ch/{n}` or `bus/{n}`. |
| `parameter` | string | Yes | `threshold`, `ratio`, `attack`, `release`, or `gain`. |
| `value` | number | Yes | New value in appropriate units. |
| `reason` | string | Yes | Why this change is needed. |

**Safety:** Medium risk. Confirmation required.

---

### wing_comp_set_apply

**Risk:** medium | **Write: apply**

Apply a prepared compressor change.

**Safety:** Validates ticket. Readback enforced.

---

### wing_fx_slot_list

**Risk:** none | **Read-only**

List all 8 FX slots and their current models.

**Output:** Array of `{ slot, model, inserted }`.

**Safety:** Read-only.

---

### wing_fx_slot_get

**Risk:** none | **Read-only**

Get detailed info about a specific FX slot.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `slot` | number | Yes | FX slot number (1-8). |

**Safety:** Read-only.

---

### wing_fx_slot_set_model_prepare

**Risk:** high | **Write: prepare**

Prepare changing an FX slot model. **Changes effect type and audio character.**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `slot` | number | Yes | FX slot number (1-8). |
| `model` | string | Yes | FX model name (e.g. "Hall Reverb", "Stereo Delay"). |
| `reason` | string | Yes | Why this FX change is needed. |

**Safety:** HIGH risk. Denied in rehearsal_safe. Requires exact confirmation.

---

### wing_fx_slot_set_model_apply

**Risk:** high | **Write: apply**

Apply a prepared FX model change.

**Safety:** HIGH risk. Requires exact confirmation.

---

## 13. Group Tools

### wing_dca_list

**Risk:** none | **Read-only**

List all 8 DCA groups with names, mute, and fader.

**Output:** Array of `{ dca, name, mute, fader }`.

**Safety:** Read-only.

---

### wing_dca_get

**Risk:** none | **Read-only**

Get details for a specific DCA.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `dca` | number | Yes | DCA number (1-8). |

**Safety:** Read-only.

---

### wing_dca_set_mute_prepare

**Risk:** high | **Write: prepare**

Prepare muting/unmuting a DCA group. **Affects all assigned channels at once.**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `dca` | number | Yes | DCA number (1-8). |
| `mute` | boolean | Yes | True to mute all channels in this DCA. |
| `reason` | string | Yes | Why this mute change is needed. |

**Safety:** HIGH risk. Denied in rehearsal_safe. Affects multiple channels simultaneously.

---

### wing_dca_set_mute_apply

**Risk:** high | **Write: apply**

Apply a prepared DCA mute change.

**Safety:** HIGH risk. Requires exact confirmation.

---

### wing_dca_adjust_fader_prepare

**Risk:** high | **Write: prepare**

Prepare adjusting a DCA fader. **Affects all assigned channels.**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `dca` | number | Yes | DCA number (1-8). |
| `delta_db` | number | Yes | Fader change in dB. |
| `reason` | string | Yes | Why this adjustment is needed. |

**Safety:** HIGH risk. Denied in rehearsal_safe. Requires exact confirmation.

---

### wing_dca_adjust_fader_apply

**Risk:** high | **Write: apply**

Apply a prepared DCA fader change.

**Safety:** HIGH risk. Requires exact confirmation.

---

### wing_mute_group_list

**Risk:** none | **Read-only**

List all 6 mute groups and their current state.

**Output:** Array of `{ group, muted }`.

**Safety:** Read-only.

---

### wing_mute_group_set_prepare

**Risk:** high | **Write: prepare**

Prepare toggling a mute group. **Mutes multiple channels/buses at once.**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `group` | number | Yes | Mute group number (1-6). |
| `mute` | boolean | Yes | True to mute all in this group. |
| `reason` | string | Yes | Why this mute group change is needed. |

**Safety:** HIGH risk. Denied in rehearsal_safe.

---

### wing_mute_group_set_apply

**Risk:** high | **Write: apply**

Apply a prepared mute group change.

**Safety:** HIGH risk. Requires exact confirmation.

---

### wing_main_get

**Risk:** none | **Read-only**

Read the Main LR master status: name, mute, fader level.

**Output:** `{ name, mute, fader }`

**Safety:** Read-only. This is THE master output -- changes affect everything going to PA.

---

### wing_main_adjust_fader_prepare

**Risk:** high | **Write: prepare**

Prepare adjusting the Main LR fader. **Affects the entire PA system.** Capped at 1.5 dB.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `delta_db` | number | Yes | Fader change in dB (positive = louder). |
| `reason` | string | Yes | Why this adjustment is needed. |

**Safety:** HIGH risk. Capped at 1.5 dB delta. Denied in rehearsal_safe. Requires exact confirmation.

---

### wing_main_adjust_fader_apply

**Risk:** high | **Write: apply**

Apply a prepared Main LR fader change.

**Safety:** HIGH risk. Requires exact confirmation.

---

### wing_main_set_mute_prepare

**Risk:** high | **Write: prepare**

Prepare muting/unmuting Main LR. **Will silence the entire PA.**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `mute` | boolean | Yes | True to mute Main LR (silence PA). |
| `reason` | string | Yes | Why this mute change is needed. |

**Safety:** HIGH risk. Denied in rehearsal_safe. Requires exact confirmation.

---

### wing_main_set_mute_apply

**Risk:** high | **Write: apply**

Apply a prepared Main LR mute change.

**Safety:** HIGH risk. Requires exact confirmation.

---

### wing_matrix_list

**Risk:** none | **Read-only**

List all 8 matrix outputs with names, mute, and fader.

**Safety:** Read-only.

---

## 14. Bulk Tools

### wing_param_bulk_get

**Risk:** none | **Read-only**

Read multiple parameters in one call. Much faster than repeated `wing_param_get` calls.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `paths` | string[] | No | List of canonical paths to read. |
| `prefix` | string | No | Read all parameters under this prefix (e.g. `/ch/1/`). Overrides `paths` if set. |

**Example:**
```json
{
  "paths": ["/ch/1/name", "/ch/1/mute", "/ch/1/fader", "/ch/1/source"]
}
```

**Safety:** Read-only. Use this instead of calling `wing_param_get` 50 times in sequence.

---

### wing_debug_dump_state

**Risk:** none | **Read-only**

Generate a complete debug dump of console state. Large output -- use sparingly.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `sections` | string[] | No | Sections: `device`, `channels`, `buses`, `dcas`, `mutegroups`, `scenes`, `fx`, `routing`, `meters`, or `all`. |
| `max_channels` | number | No | Max channels to dump. Default 48. |
| `include_meters` | boolean | No | Include meter snapshot. Default true. |

**Safety:** Read-only. Suitable for bug reports. Avoid exposing sensitive room data.

---

### wing_usb_recorder_get

**Risk:** none | **Read-only**

Read the USB/SD recorder status: transport state (stopped/playing/recording).

**Safety:** Read-only.

---

## 15. Raw Tools

### wing_raw_osc_prepare

**Risk:** critical | **Write: prepare**

Prepare a raw OSC command. **CRITICAL -- bypasses all high-level safety abstractions. Disabled by default.**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `osc_path` | string | Yes | Raw OSC path. |
| `osc_value` | object | Yes | Raw OSC value. |
| `reason` | string | Yes | Why a raw command is needed instead of high-level tools. |

**Safety:** CRITICAL risk. Only allowed in `developer_raw` mode. NEVER available in live mode. Requires exact confirmation.

---

### wing_raw_osc_apply

**Risk:** critical | **Write: apply**

Apply a prepared raw OSC command.

**Safety:** CRITICAL risk. Disabled in live mode. Requires developer_raw mode.

---

### wing_raw_native_prepare

**Risk:** critical | **Write: prepare**

Prepare a raw Native protocol command. **CRITICAL -- bypasses all safety.**

**Safety:** Same restrictions as raw OSC: developer_raw mode only, never in live mode.

---

### wing_raw_native_apply

**Risk:** critical | **Write: apply**

Apply a prepared raw Native command.

**Safety:** Same as above. Requires exact confirmation in developer_raw mode only.

---

## Write Flow (All Write Tools)

Every write tool follows this protocol:

```
1. resolve target (canonical path)
2. read old state (read-before-write)
3. classify risk (RiskEngine)
4. enforce policy (PolicyEngine)
5. generate plan (ChangePlanner)
6. return confirmation_id (if required)
7. receive exact confirmation (user text must match template)
8. re-read critical old state (verify nothing changed)
9. apply change (driver.setParam)
10. readback (driver.getParam)
11. compare expected vs actual
12. audit (AuditLogger)
13. summarize to human (dB/name format)
```

## Error Codes

| Code | Meaning |
|------|---------|
| `DEVICE_NOT_FOUND` | No WING found on network |
| `DEVICE_DISCONNECTED` | Lost connection to WING |
| `PARAM_NOT_FOUND` | Parameter path does not exist |
| `PARAM_READ_ONLY` | Attempted to write read-only parameter |
| `VALUE_OUT_OF_RANGE` | Value exceeds allowed range |
| `RISK_CONFIRMATION_REQUIRED` | Action requires confirmation |
| `POLICY_DENIED` | Action denied by safety policy |
| `READBACK_MISMATCH` | Written value does not match readback |
| `DRIVER_TIMEOUT` | Communication timeout |
| `PROTOCOL_ERROR` | Protocol-level error |
| `RAW_DISABLED` | Raw tools disabled |
| `LIVE_MODE_DENIED` | Operation denied in live mode |

## Tool Quick Index

```
Read-only tools (safe any time):
  wing_discover             wing_connect            wing_get_status
  wing_schema_search        wing_param_resolve      wing_param_get
  wing_channel_list         wing_channel_get        wing_send_get
  wing_routing_trace        wing_routing_get        wing_headamp_get
  wing_scene_list           wing_meter_catalog      wing_meter_read
  wing_signal_check         sound_diagnosis_start   sound_diagnosis_next_step
  wing_quick_check          wing_state_summary      wing_state_snapshot
  wing_channel_strip        wing_signal_path_trace  wing_eq_get
  wing_gate_get             wing_comp_get           wing_fx_slot_list
  wing_fx_slot_get          wing_dca_list           wing_dca_get
  wing_mute_group_list      wing_main_get           wing_matrix_list
  wing_param_bulk_get       wing_debug_dump_state   wing_usb_recorder_get

Write tools (always prepare->apply):
  wing_param_set            wing_channel_adjust_fader  wing_channel_set_mute
  wing_send_adjust          wing_routing_set           wing_headamp_set
  wing_phantom_set          wing_scene_recall          wing_snapshot_save
  sound_diagnosis_prepare_fix / apply_fix
  wing_eq_set_band          wing_gate_set              wing_comp_set
  wing_fx_slot_set_model    wing_dca_set_mute          wing_dca_adjust_fader
  wing_mute_group_set       wing_main_adjust_fader     wing_main_set_mute
  wing_raw_osc              wing_raw_native
  wing_emergency_stop        wing_emergency_reset
  wing_usb_recorder_record   wing_usb_recorder_stop
  wing_matrix_set_mute       wing_matrix_adjust_fader
```

## Emergency Tools

| Tool | Risk | Read/Write | Description |
|------|------|------------|-------------|
| `wing_emergency_stop` | critical | prepare | Prepare panic mute (all/main_only/channels_only) |
| `wing_emergency_stop_apply` | critical | apply | Execute panic mute on all targets |
| `wing_emergency_status` | none | read | Check if emergency stop is active |
| `wing_emergency_reset` | high | prepare | Prepare to clear emergency and unmute |
| `wing_emergency_reset_apply` | high | apply | Unmute all targets and clear emergency |

**Emergency scopes:**
- `all`: Mute Main LR + all 48 channels + 16 buses + 8 DCAs
- `main_only`: Mute Main LR only (fastest)
- `channels_only`: Mute channels/buses/DCAs, leave Main LR

## USB/SD Recorder Tools

| Tool | Risk | Read/Write | Description |
|------|------|------------|-------------|
| `wing_usb_recorder_get` | none | read | Read recorder transport status |
| `wing_usb_recorder_record_prepare` | high | prepare | Prepare to start recording |
| `wing_usb_recorder_record_apply` | high | apply | Start USB/SD recording |
| `wing_usb_recorder_stop_prepare` | high | prepare | Prepare to stop recording |
| `wing_usb_recorder_stop_apply` | high | apply | Stop USB/SD recording |

## Matrix Tools

| Tool | Risk | Read/Write | Description |
|------|------|------------|-------------|
| `wing_matrix_list` | none | read | List all 8 matrix outputs |
| `wing_matrix_set_mute_prepare` | high | prepare | Prepare matrix mute/unmute |
| `wing_matrix_set_mute_apply` | high | apply | Apply matrix mute change |
| `wing_matrix_adjust_fader_prepare` | high | prepare | Prepare matrix fader adjustment |
| `wing_matrix_adjust_fader_apply` | high | apply | Apply matrix fader change |
```

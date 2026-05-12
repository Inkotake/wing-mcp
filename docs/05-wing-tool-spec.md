# 05. WING MCP Tool Spec

## 1. Device tools

### wing_discover

Read-only。发现同网络 WING。

Input:

```json
{
  "broadcast": true,
  "timeout_ms": 1500,
  "direct_ips": ["192.168.1.62"]
}
```

Output:

```json
{
  "devices": [
    {
      "id": "wing-serial-xxx",
      "ip": "192.168.1.62",
      "name": "Room A WING",
      "model": "ngc-full",
      "serial": "...",
      "firmware": "3.1"
    }
  ]
}
```

### wing_connect

Read-only from mixer perspective，但会建立 session。

Input:

```json
{"device_id":"wing-serial-xxx","driver":"native"}
```

### wing_get_status

返回 connection、driver、live_mode、remote_lock、schema version、meter status。

## 2. Schema tools

### wing_schema_search

用于从自然语言或 path 片段搜索参数。

Input:

```json
{
  "query": "channel 1 phantom",
  "target_kind": "source",
  "limit": 10
}
```

Output:

```json
{
  "results": [
    {
      "canonical_path": "/io/local/1/phantom",
      "display_name": "Local Input 1 Phantom Power",
      "type": "bool",
      "risk": "critical",
      "read_only": false,
      "confidence": 0.92
    }
  ]
}
```

### wing_param_resolve

把“主唱”“鼓手耳返”“主输出”“CH1”等解析成 canonical target。

## 3. Generic param tools

### wing_param_get

Read-only。

Input:

```json
{"path":"/ch/1/mute"}
```

### wing_param_set_prepare / wing_param_set_apply

仅用于高级参数，不作为普通用户首选工具。高层工具优先。

## 4. Channel tools

### wing_channel_list

返回 channel id、name、source、mute、fader、color、tags。

### wing_channel_get

Input:

```json
{"channel":"1"}
```

Output:

```json
{
  "channel": 1,
  "name": "Vocal 1",
  "source": "LCL.1",
  "mute": false,
  "fader_db": -6.0,
  "pan": 0,
  "dca_assignments": [1],
  "mute_groups": [],
  "main_send": true,
  "input_meter_dbfs": -22.1,
  "post_fader_meter_dbfs": -28.5
}
```

### wing_channel_adjust_fader_prepare

Input:

```json
{
  "channel": "Vocal 1",
  "delta_db": 3,
  "reason": "User asked: 主唱大一点",
  "live_mode": true
}
```

Output:

```json
{
  "confirmation_id": "chg_...",
  "risk": "medium",
  "requires_confirmation": true,
  "plan": {
    "summary": "Raise Vocal 1 from -9.0 dB to -6.0 dB",
    "operations": [{"path":"/ch/1/fdr","old_value_db":-9,"new_value_db":-6}]
  }
}
```

### wing_channel_adjust_fader_apply

Input:

```json
{"confirmation_id":"chg_...","confirmation_text":"确认把主唱推高 3dB"}
```

## 5. Sends / monitor tools

### wing_send_get

Input:

```json
{"source_channel":"Vocal 1","destination_bus":"Drummer IEM"}
```

### wing_send_adjust_prepare/apply

风险 medium，若 bus 是 musician-owned 可降低确认要求。

## 6. Routing tools

### wing_routing_trace

Read-only。核心诊断工具。

Input:

```json
{
  "target": "Vocal 1",
  "destination": "Main LR"
}
```

Output:

```json
{
  "trace": [
    {"stage":"physical_source","name":"SM58","known_from":"room_patch_sheet"},
    {"stage":"input","path":"LCL.1","meter_dbfs":-24.1},
    {"stage":"channel","path":"/ch/1","mute":false,"fader_db":-6},
    {"stage":"main_send","enabled":true},
    {"stage":"main","meter_dbfs":-18.2},
    {"stage":"output_patch","outputs":["XLR.7","XLR.8"]}
  ],
  "likely_breakpoint": null
}
```

### wing_routing_set_prepare/apply

风险 critical。默认 live mode 禁用，除非 admin policy 允许。

## 7. Phantom / headamp

### wing_headamp_get

Read-only。

### wing_phantom_set_prepare/apply

Critical。

必须确认：

```text
确认开启 LCL.1 的 48V 幻象电源，我确认连接设备需要幻象电源
```

不能自动开启 phantom，除非配置为 maintenance mode 且确认完整。

## 8. Scenes / snapshots / snippets

### wing_scene_recall_prepare/apply

Critical。

prepare 必须返回：

- 当前 scene。
- 目标 scene。
- 可能改变的范围。
- 是否已保存 pre-change snapshot。
- 回滚方案。

### wing_snapshot_save_prepare/apply

Medium/high。高风险操作前可自动 prepare，但 apply 仍需按策略确认。

## 9. EQ / dynamics / FX

### wing_eq_get

Read-only。

### wing_eq_set_band_prepare/apply

Medium/high，取决于 gain/Q/frequency 幅度。

### wing_gate_set_prepare/apply

Medium/high。诊断 no-sound 时若 gate closed，不要直接关闭 gate；先说明并确认。

### wing_fx_slot_set_model_prepare/apply

High。会改变效果器类型和声音。

## 10. Meter tools

### wing_meter_read

Input:

```json
{
  "targets": ["/ch/1/input", "/ch/1/post_fader", "/main/l", "/main/r"],
  "window_ms": 3000,
  "aggregate": "rms_peak"
}
```

Output:

```json
{
  "window_ms": 3000,
  "meters": [
    {"target":"/ch/1/input","rms_dbfs":-28.1,"peak_dbfs":-12.3,"present":true},
    {"target":"/main/l","rms_dbfs":-42.0,"peak_dbfs":-32.0,"present":false}
  ]
}
```

### wing_signal_check

高层诊断读取：input / channel / bus / main / output trace。

## 11. Raw developer tools

### wing_raw_osc_prepare/apply

默认禁用。只在 developer profile + maintenance mode 可用。

### wing_debug_dump_state

Read-only，可用于 bug report，但要避免泄露敏感 room data。

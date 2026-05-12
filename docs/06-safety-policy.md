# 06. Safety Policy

## 1. Why safety is server-side

现场音频硬件控制与普通软件 API 不同：

- 错误 mute / unmute 会影响排练或演出。
- 过大的 fader 变化可能伤害听力或设备。
- phantom power 可能损坏不适合的设备。
- routing / scene recall 可能让系统瞬间失控。

所以安全策略必须写在 MCP server 的 `PolicyEngine` 中，而不是只写在 prompt / Skill 中。

## 2. Risk levels

```text
none:
  - read-only
  - schema search
  - meter read
  - status

low:
  - cosmetic name/color/icon in maintenance mode
  - read-only diagnosis session updates

medium:
  - channel fader small delta
  - channel mute/unmute
  - monitor send small delta
  - EQ small adjustment
  - bus fader small delta

high:
  - main fader
  - DCA mute/fader
  - mute group
  - FX model change
  - gate/dynamics changes that can silence signal
  - large fader/send jumps
  - output patch prepare

critical:
  - phantom power
  - routing write
  - scene/snapshot/show recall
  - virtual soundcheck routing
  - global preferences
  - network settings
  - firmware/storage operations
```

## 3. Modes

### read_only

- 只允许读取。
- 适合演出现场、首次接入、visitor。

### rehearsal_safe

- 允许 medium 以下 prepare/apply。
- 默认需要确认。
- 限制 fader delta。

### maintenance

- 允许 high/critical，但必须精确确认。
- 建议只在空场或不上 PA 时使用。

### developer_raw

- 允许 raw OSC/native。
- 禁止 live mode。
- 必须本地管理员开启。

## 4. Confirmation rules

### medium

可接受：

```text
确认执行
确认把主唱推高 3dB
```

### high

必须包含对象和动作：

```text
确认把 Main LR 降低 1dB
确认 mute DCA 2
```

### critical

必须包含对象、动作和风险知情：

```text
确认开启 LCL.1 的 48V 幻象电源，我确认连接设备需要幻象电源
确认 recall Scene 12，我知道这会改变当前调音台状态
确认修改 Room A 的输出路由，我知道可能导致主扩或耳返无声
```

## 5. Delta caps

默认 live/rehearsal 限制：

```json
{
  "max_channel_fader_delta_db": 3,
  "max_send_delta_db": 6,
  "max_main_fader_delta_db": 1.5,
  "max_eq_gain_delta_db": 3,
  "max_gate_threshold_delta_db": 6,
  "max_consecutive_writes_per_minute": 12
}
```

## 6. Required write flow

```text
1. resolve target
2. read old state
3. classify risk
4. enforce policy
5. generate plan
6. return confirmation_id
7. receive exact confirmation if needed
8. re-read critical old state
9. apply change
10. readback
11. compare expected vs actual
12. audit
13. summarize to human
```

## 7. Audit record

```ts
interface AuditRecord {
  id: string;
  timestamp: string;
  session_id: string;
  operator_id?: string;
  mode: "read_only" | "rehearsal_safe" | "maintenance" | "developer_raw";
  risk: "none" | "low" | "medium" | "high" | "critical";
  tool: string;
  target: string;
  reason: string;
  old_value: unknown;
  requested_value: unknown;
  readback_value: unknown;
  confirmation_text?: string;
  result: "success" | "denied" | "failed" | "readback_mismatch";
  driver: "native" | "osc" | "wapi" | "fake";
}
```

## 8. Absolute denials

Server must deny regardless of model prompt:

- Raw protocol command in live mode。
- Critical action without exact confirmation。
- Reusing expired confirmation_id。
- Applying a confirmation_id generated for another target。
- Applying when old state has changed materially since prepare。
- Writing network settings unless explicitly enabled in maintenance config。
- Applying scene recall while active diagnosis session is unresolved, unless admin override。

## 9. Human-facing language

After write:

```text
已完成：Vocal 1 从 -9.0 dB 调到 -6.0 dB；WING 回读为 -6.0 dB。审计编号 aud_123。
```

If denied:

```text
我没有执行。这个操作会 recall scene，属于 critical 风险，需要你明确说：“确认 recall Scene 12，我知道这会改变当前调音台状态”。
```

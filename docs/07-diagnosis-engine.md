# 07. Diagnosis Engine

## 1. Philosophy

AI 调音师不是“命令翻译器”。它应该像工程师一样缩小问题断点：

```text
source -> input -> channel path -> send/main -> output patch -> external hardware
```

每一步优先选择：

- 信息增益高。
- 风险低。
- 人类动作少。
- 可逆。
- 可通过 WING telemetry 验证。

## 2. DiagnosisSession

```ts
export interface DiagnosisSession {
  id: string;
  roomId: string;
  deviceId: string;
  userProblem: string;
  target?: ResolvedAudioTarget;
  status:
    | "collecting"
    | "probing"
    | "hypothesizing"
    | "awaiting_user_action"
    | "ready_to_fix"
    | "fixed"
    | "escalated";
  hypotheses: Hypothesis[];
  observations: Observation[];
  actions: DiagnosisAction[];
}
```

## 3. Hypothesis

```ts
export interface Hypothesis {
  id: string;
  label: string;
  probability: number;
  evidenceFor: string[];
  evidenceAgainst: string[];
  nextBestTest: DiagnosisAction;
  risk: "none" | "low" | "medium" | "high" | "critical";
}
```

## 4. No-sound workflow

```text
NO_SOUND(target)
  1. clarify scope
     - one channel?
     - monitor bus?
     - main PA?
     - recording/USB?
     - livestream?

  2. resolve target
     - room patch sheet
     - current WING channel names
     - user aliases
     - fuzzy match

  3. read WING state
     - channel mute/fader/source
     - DCA/mute groups
     - main send / bus send
     - routing trace

  4. read meters
     - source/input
     - channel pre/post
     - bus/main/matrix

  5. classify breakpoint
     - source/cable
     - input patch
     - headamp/phantom
     - channel gate/mute/fader
     - DCA/mute group
     - send disabled
     - bus/master
     - main/matrix
     - output patch
     - speaker/amp external

  6. choose next test
     - read state
     - ask user to speak/play
     - ask user to inspect cable
     - prepare low-risk fix
     - ask exact confirmation for high-risk fix
```

## 5. Breakpoint rules

```ts
if (!inputMeter.present) {
  hypotheses = [
    {label: "source_or_cable", probability: 0.45},
    {label: "input_patch", probability: 0.25},
    {label: "headamp_or_phantom", probability: 0.20},
    {label: "stagebox_or_network", probability: 0.10}
  ];
}

if (inputMeter.present && !postFaderMeter.present) {
  if (channel.mute) hypothesis("channel_muted", 0.85);
  if (channel.fader_db <= -80) hypothesis("channel_fader_down", 0.75);
  if (gate.closed) hypothesis("gate_closed", 0.70);
}

if (postFaderMeter.present && !mainMeter.present) {
  hypotheses = [
    {label: "main_send_disabled", probability: 0.50},
    {label: "dca_or_mute_group", probability: 0.25},
    {label: "routing", probability: 0.25}
  ];
}

if (mainMeter.present && !humanReportsRoomSound) {
  hypotheses = [
    {label: "output_patch", probability: 0.35},
    {label: "speaker_processor_or_amp", probability: 0.45},
    {label: "powered_speaker_or_cable", probability: 0.20}
  ];
}
```

## 6. Next-best-test scoring

```text
score = information_gain
      - risk_penalty
      - user_effort_penalty
      - time_penalty
      + reversibility_bonus
      + telemetry_confidence_bonus
```

Examples：

| Action | Info gain | Risk | Effort | Score |
|---|---:|---:|---:|---:|
| read input meter | high | none | low | excellent |
| ask user to speak into mic | high | none | low | excellent |
| ask user to swap cable | medium | low | medium | good after meter shows no input |
| disable gate | medium | medium | low | only after confirmation |
| enable phantom | medium | critical | medium | last resort, exact confirmation |
| recall scene | low/unknown | critical | low | avoid during diagnosis |

## 7. Human dialogue pattern

Use short, practical language：

```text
我先只检查，不会改调音台。
我看到 CH1 没有输入电平。请对着主唱话筒讲话 3 秒，我看一下输入 meter。
```

不要一次给十条清单。一次只给一个动作。

## 8. Fix planning

如果找到低风险修复：

```text
我发现 Vocal 1 通道被 mute。解除 mute 是 medium 风险，会让主唱进入主扩。
准备操作：Vocal 1 mute 从 on 改为 off。
请确认：“确认解除 Vocal 1 mute”。
```

如果找到 critical 修复：

```text
我发现主唱是电容麦，但 LCL.1 没有开 48V。开启 48V 属于 critical 风险。
请先确认话筒型号确实需要 48V，并确认没有连接 ribbon mic 或不适合 phantom 的设备。
如果确认，请说：“确认开启 LCL.1 的 48V 幻象电源，我确认连接设备需要幻象电源”。
```

## 9. Incident logging

每次诊断结束写 incident：

```json
{
  "room_id": "room-a",
  "problem": "Vocal 1 no sound",
  "root_cause": "XLR cable plugged into Local 2 while patch expected Local 1",
  "fix": "Moved cable to Local 1 and updated patch sheet note",
  "evidence": ["Local 1 no meter", "Local 2 had meter", "user confirmed cable move"],
  "date": "2026-05-12"
}
```

# 09. Voice Agent Design

## 1. Product goal

用户在排练室里可以说：

```text
“为什么主唱没声音？”
“鼓手耳返里面加一点主唱。”
“现在是不是有啸叫？”
“直播没有吉他声，帮我查一下。”
```

AI 通过语音回应，调用 MCP 读取 WING 状态和知识库，必要时准备修复计划。

## 2. Start with push-to-talk

现场环境有：

- 鼓声。
- 扩声音箱。
- 返送。
- 多人讲话。
- 音乐播放。

Always-on wake word 容易误触发。第一版推荐：

```text
push-to-talk -> STT -> text agent -> TTS to engineer monitor/headphone
```

## 3. Audio path safety

TTS 不得进入 Main LR 或 musicians' monitor mix。推荐：

```text
AI speaker = small local speaker / engineer headphone / tablet speaker
not routed into WING main output
```

如果必须经过 WING，使用专用 cue/solo/headphone path，且硬件限音量。

## 4. Voice shell modules

```text
voice-shell/
  input/
    pushToTalk.ts
    vad.ts
    wakeWord.ts
    stt.ts
  output/
    tts.ts
    safePlayback.ts
    ducking.ts
  session/
    turnManager.ts
    interruption.ts
    transcript.ts
  providers/
    openaiRealtime.ts
    localWhisper.ts
    deepseekText.ts
```

## 5. Conversation rules

- 句子短。
- 一次只要求一个动作。
- 改动前明确说“我准备做什么”。
- 读状态时明确说“我只检查，不改”。
- 听不清时不要执行写操作。
- 高风险确认必须用文本/语音转写精确匹配。

## 6. Example voice flow

```text
User: 为什么主唱没声音？
AI: 我先只检查，不会改调音台。主唱是 Vocal 1 吗？
User: 对。
AI: 我看到 Vocal 1 没有输入电平。请对着主唱话筒讲话三秒，我看一下 meter。
User speaks.
AI: 还是没有输入电平。请检查话筒线是不是插在 WING Local 1。先不用动调音台。
```

## 7. Optional audio analysis

AI 不能完全像人类听现场，但可以接入结构化音频分析：

```text
room_audio_capture_snapshot
room_audio_analyze_level
room_audio_analyze_spectrum
room_audio_detect_feedback
room_audio_detect_hum
room_audio_detect_clip
room_audio_get_spl
room_audio_get_rta
```

输出：

```json
{
  "duration_sec": 5,
  "rms_dbfs": -28.2,
  "peak_dbfs": -6.4,
  "noise_floor_dbfs": -61.0,
  "dominant_peaks_hz": [3150, 6300],
  "possible_feedback": true,
  "possible_hum": false,
  "speech_presence": true,
  "confidence": 0.84
}
```

## 8. Realtime model options

可接入：

- OpenAI Realtime API / speech-to-speech。
- 本地 Whisper / faster-whisper STT。
- 云 TTS。
- 本地 TTS。

重要：模型 provider 可替换，不要把业务逻辑写死在某一家 API。

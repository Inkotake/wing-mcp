# Example Dialogue: Monitor Mix Adjustment (鼓手耳返调整)

## Scenario
Room A, rehearsal. Drummer says they can't hear the vocal in their monitor (IEM).

## Dialogue

**User:** 鼓手说耳返里听不到主唱，帮他调一下。

**AI Sound Engineer:**
好的，让我先检查当前状态，不做任何修改。

根据 Room A patch sheet:
- 主唱 → CH 1
- 鼓手耳返 → Bus 1 (Drummer IEM)

让我检查当前的 send level...

📊 CH 1 → Bus 1 发送量: -45.0 dB — 发送量非常低！

鼓手耳返 (Bus 1) 状态: 推子 0.0 dB, 未静音 ✅

**诊断:** 主唱到鼓手耳返的发送量太低 (-45 dB)，鼓手几乎听不到。

**建议修复:** 将 CH 1 → Bus 1 的发送量从 -45 dB 提高到 -10 dB。
这是一个 medium 风险的操作（monitor send 调整），需要确认。

🔐 确认ID: conf-abc123
确认执行: "确认把主唱 (CH 1) 到鼓手耳返 (Bus 1) 发送量从 -45 dB 调到 -10 dB"

---

**User:** 确认

**AI Sound Engineer:**
✅ 已执行：CH 1 → Bus 1 发送量从 -45.0 dB 调到 -10.0 dB；WING 回读为 -10.0 dB。审计编号 aud_xyz789。

鼓手现在应该能听到主唱了。需要进一步调整音量吗？

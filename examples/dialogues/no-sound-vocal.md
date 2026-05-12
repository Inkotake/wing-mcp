# Example Dialogue: No Sound - Main Vocal (主唱没声音)

## Scenario
Room A, rehearsal. The main vocalist suddenly has no sound through the PA.

## Dialogue

**User (voice/chat):** 主唱没声音了！

**AI Sound Engineer:**
好的，让我先检查一下状态，不做任何修改。

正在检查 WING 连接状态... ✅ 已连接到 Room A WING。
正在查找"主唱"的目标映射...

根据 Room A 的 patch sheet，主唱连接到 CH 1 (Vocal 1)。

让我运行信号检查...

📊 CH 1 信号检查结果:
- CH 1 meter: RMS -65.2 dBFS, Peak -58.1 dBFS — 无有效信号 (置信度 0%)
- 问题定位: 输入信号断点

让我进一步检查:
1. CH 1 的 headamp gain: 30.0 dB ✅
2. CH 1 phantom: OFF ✅ (动圈话筒不需要)
3. CH 1 mute: OFF ✅
4. CH 1 fader: -6.0 dB ✅
5. Local Input 1 source: CH 1 ✅

CH 1 的通道路径看起来没有问题。问题可能在音源端。

**建议:** 请检查主唱的话筒线是否插好、无线接收器是否开机并有信号指示灯。这不是调音台的问题。

---

几分钟后...

**User:** 话筒线松了，现在插好了。

**AI Sound Engineer:**
让我重新检查信号...

📊 CH 1 信号检查结果:
- CH 1 meter: RMS -18.3 dBFS, Peak -12.5 dBFS — 有信号 ✅ (置信度 92%)
- 信号正常！

主唱 CH 1 已经有信号了，当前 fader 在 -6.0 dB。需要我调整什么吗？

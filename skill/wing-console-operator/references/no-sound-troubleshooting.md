# No-Sound Troubleshooting Guide

## Diagnostic Tree (排查树)

### Step 1: Scope (确定范围)
- Who has no sound? (谁没声音？)
- What should they be hearing? (应该听到什么？)
- Is it main PA, monitors, recording, or livestream?
- Is it one channel or everything?

### Step 2: Target Resolution (目标解析)
- Use wing_param_resolve to identify target channel/bus
- Check room patch sheet from memory
- Confirm channel name matches expected source

### Step 3: Input Meter Check (输入信号检查)
- Use wing_signal_check on the input path
- Is there signal at the preamp? (wing_headamp_get)
- Is there signal at the channel? (wing_meter_read /ch/{n}/fader)

### Step 4: Channel Path (通道路径)
- wing_channel_get: check mute, fader, gate, source
- Is the channel muted? (wing_channel_get)
- Is the fader up? (wing_channel_get)
- Is the gate clamping? Check gate threshold

### Step 5: Bus/Main Path (母线/主输出路径)
- Check sends to relevant buses (wing_send_get)
- Check bus mute and fader (wing_channel_get for bus)
- Check main LR mute and fader

### Step 6: Output Path (输出路径)
- wing_routing_trace for output routing
- Check physical amp/speaker power
- Check cables and connections

## Key Principles
1. NEVER blindly unmute or push faders
2. Read state before any change
3. One change at a time
4. Use signal_check to verify each step
5. Don't assume - check meters

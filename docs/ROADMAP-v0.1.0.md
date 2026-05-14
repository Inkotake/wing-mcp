# wing-mcp v0.1.0 详细执行计划

> 基于 2026-05-13 深度审查报告
> 目标: 安全可信的 WING 硬件控制内核

## 当前状态: pre-alpha (107 tests, 91 tools, fake-only)

## Sprint 0: 文档诚实化 ✅
- [x] README pre-alpha 状态标注
- [x] ROADMAP 创建

## Sprint 1: MCP Server Hardening ✅
- [x] mode used before assigned 修复
- [x] structuredContent 输出
- [x] tool annotations (readOnlyHint/destructiveHint/idempotentHint)

## Sprint 2: Confirmation v2 ✅
- [x] high-risk exact confirmation (同 critical)
- [x] MATERIAL_STATE_CHANGED 专用错误码
- [x] confirmation_text SHA-256 哈希 (不存明文)
- [x] errorCode field in validateTicket

## Sprint 3: Emergency v2 ✅
- [x] Emergency snapshot (保存 old state before mute)
- [x] Emergency restore 基于 snapshot (Main LR last)
- [x] No-snapshot restore 拒绝
- [x] Per-target readback verification

## Sprint 4: FakeSignalGraph ✅
- [x] propagateMeter() — mute/fader/source/gate 变化时自动更新 meter
- [x] Channel: input→gate→mute→fader→post_fader
- [x] Main LR: 汇总所有通道 post-fader
- [x] setParam 触发信号传播
- [x] OSC driver address-correlated query (not FIFO)

## Sprint 5: OSC truth test (需要实机)
- [x] OSC address correlation fix
- [x] OSC X32-style path WARNING
- [ ] 阅读 WING Remote Protocols
- [ ] 实机 read-only smoke test
- [ ] safe channel low-risk write/restore

## Sprint 6-9: 后续 (需要硬件)
- [ ] Native/libwing sidecar
- [ ] Schema catalog v1
- [ ] Diagnosis v1 (no-sound state machine)
- [ ] Release gate v0.1.0

## 补充修复 (2026-05-13)
- [x] PolicyEngine: emergency stop allowed in read_only
- [x] Emergency: channels_only scope fixed
- [x] Emergency: snapshot status in wing_emergency_status
- [x] RateLimiter: rolling window cumulative delta tracking
- [x] SignalBreakpoint type exported from diagnosis engine
- [x] SETUP-GUIDE: hardware test warning
- [x] README: exact confirmation examples
- [x] README: tool table updated (Matrix/USB/Emergency)
- [x] No-sound diagnosis tests (7 tests against FakeWing profiles)

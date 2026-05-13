# wing-mcp v0.1.0 详细执行计划

> 基于 2026-05-13 深度审查报告
> 目标: 安全可信的 WING 硬件控制内核

## 当前状态: pre-alpha (107 tests, 91 tools, fake-only)

## Sprint 0: 文档诚实化 (0.5天)
- [x] README pre-alpha 状态标注
- [ ] 修正示例中不合规的确认文本
- [ ] CHANGELOG 标注 OSC experimental
- [ ] SETUP-GUIDE 加硬件警告

## Sprint 1: MCP Server Hardening (1-2天)
- [x] mode used before assigned 修复
- [ ] structuredContent 输出
- [ ] tool annotations (readOnlyHint/destructiveHint/idempotentHint)
- [ ] per-tool Zod runtime validation

## Sprint 2: Confirmation & ChangePlanner v2 (2-3天)
- [ ] high-risk 要求 exact confirmation (同 critical)
- [ ] MATERIAL_STATE_CHANGED 专用错误码
- [ ] confirmation_text 哈希存储 (不存明文)
- [ ] AuditLogger health status

## Sprint 3: Emergency v2 (3-4天)
- [ ] BatchChangePlanner
- [ ] Emergency snapshot (保存 old state)
- [ ] Emergency restore 基于 snapshot
- [ ] per-target audit

## Sprint 4: FakeSignalGraph (3-5天)
- [ ] 动态信号链传播
- [ ] fault profiles 改状态而非硬写 meter
- [ ] meterRead 基于 signal graph

## Sprint 5-9: 实机闭环 (后续)
- OSC truth test → Native/libwing → Schema catalog → Diagnosis → Release

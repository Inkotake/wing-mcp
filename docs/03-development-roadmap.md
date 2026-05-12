# 03. Development Roadmap

## 开发目标

构建完整可用系统，不做简化 MVP。路线仍然分阶段，但每阶段都必须留下生产级接口、测试和安全边界。

## Phase 1 - Monorepo Skeleton

目标：

- 建立 `ai-sound-engineer` monorepo。
- TypeScript strict mode。
- Rust workspace。
- MCP server 最小启动。
- fake-wing 空服务。
- CI 脚本。

验收：

- `pnpm install && pnpm build && pnpm test` 通过。
- `cargo test` 通过。
- `wing-console-mcp --stdio` 能启动并返回 `wing_get_status` placeholder。
- `CLAUDE.md`、`.claude/`、`AGENTS.md` 已放入项目根。

## Phase 2 - Fake WING

目标：

- 实现 fake WING discovery。
- 实现 fake native get/set。
- 实现 fake OSC get/set。
- 实现 fake meter stream。
- 实现 fault injection。

验收：

- 无实机时所有 MCP 工具都可跑 fake integration tests。
- 支持 timeout、packet loss、readback mismatch、disconnect。

## Phase 3 - WING Discovery

目标：

- UDP 2222 发送 `WING?`。
- 解析 `WING,<ip>,<name>,<model>,<serial>,<firmware>`。
- 支持 broadcast scan、direct IP probe、manual config。
- 支持 model alias：WING / WING Compact / WING Rack。

验收：

- `wing_discover` 返回结构化列表。
- 找不到设备时错误可读。
- discovery 不进行任何写入。

## Phase 4 - Schema Catalog / Risk Catalog

目标：

- 建立 canonical path catalog。
- 接入 libwing / wapi / 手动 curated schema。
- 建立 risk overrides。
- 建立 alias resolver。

验收：

- 搜 “vocal channel mute” 可解析到 channel target。
- 搜 “phantom local input 1” 标记 critical。
- 搜 “main lr mute” 标记 high/critical。

## Phase 5 - Native Sidecar

目标：

- Rust sidecar JSON-RPC。
- discovery、connect、get_param、set_param、node_get、node_set。
- events / meters 初版。
- sidecar logs 到 stderr。

验收：

- fake native integration 通过。
- 实机可读 channel name/mute/fader。
- 实机低风险写入可 readback。

## Phase 6 - OSC Fallback

目标：

- UDP 2223 OSC codec。
- canonical path -> OSC mapping。
- raw OSC developer tool。
- timeout/retry/readback。

验收：

- Native 与 OSC 对同一基础参数读取一致。
- raw OSC 默认禁用。
- live mode 下 raw OSC 被拒绝。

## Phase 7 - Safety Engine

目标：

- RiskEngine。
- PolicyEngine。
- ConfirmationManager。
- ChangePlanner。
- AuditLogger。
- live mode / rehearsal mode / maintenance mode。

验收：

- 所有写入必须 prepare/apply。
- 未确认 main mute、phantom、routing、scene recall 被拒绝。
- channel fader 超限被拒绝或升级风险。
- audit 写 old/requested/readback/operator/confirmation。

## Phase 8 - High-level WING Tools

目标：

- channel / bus / send / main / matrix。
- DCA / mute group。
- source / headamp / phantom。
- routing trace。
- EQ / gate / dynamics / FX。
- scene / snapshot / snippet。

验收：

- tool output 全部 structured。
- user-facing summary 使用 dB、channel name、bus name。
- every write performs read-before-write and readback。

## Phase 9 - Meter / Signal Check

目标：

- meter_catalog。
- meter_subscribe/read/unsubscribe。
- signal_check。
- silence_detect。
- clip_detect。

验收：

- 可判断 input meter、post-fader meter、main meter 是否有信号。
- 支持 3~10 秒窗口聚合。
- 输出 confidence。

## Phase 10 - Diagnosis Engine

目标：

- no_sound workflow。
- feedback workflow。
- monitor_mix workflow。
- recording/livestream no-signal workflow。
- next-best-test。

验收：

- 用户说“主唱没声音”时，Agent 自动：查 patch、查 channel、查 meter、分类断点、给下一步。
- 不盲目改 mixer。
- 一次只让人做一个动作。

## Phase 11 - Memory / Knowledge

目标：

- docs ingest。
- room topology。
- patch sheet。
- band preferences。
- incident log。
- memory write prepare/apply。

验收：

- 能回答 Room A 主唱默认哪个 channel。
- 能引用历史故障。
- 用户偏好写入需要确认。
- safety memory 只能管理员写。

## Phase 12 - Voice Shell

目标：

- push-to-talk。
- STT / TTS。
- turn manager。
- interrupt / barge-in。
- safe output path。

验收：

- 语音问“为什么没声音”能进入诊断流程。
- TTS 不进入 Main LR。
- 可中断。

## Phase 13 - Skill / Prompts / Client Integration

目标：

- wing-console-operator Skill。
- MCP prompts。
- Claude Code slash commands。
- Agent runtime system prompts。

验收：

- ChatGPT/Claude 能触发 skill。
- Skill 优先诊断工具，不直接 raw command。
- 高风险操作必须确认。

## Phase 14 - Operator Dashboard

目标：

- live status。
- pending confirmations。
- patch sheet editor。
- memory review。
- audit viewer。
- safety config。

验收：

- 现场工程师可看到 Agent 准备做什么。
- 所有 write action 可追溯。

## Phase 15 - Hardware Certification

目标：

- 空台测试。
- 小音量 PA 测试。
- 排练现场测试。
- 演出前 read-only 测试。

验收：

- 故障注入通过。
- 断线恢复安全。
- readback mismatch 自动停止。
- high-risk action 不可能绕过确认。

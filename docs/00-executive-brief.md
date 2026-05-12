# 00. Executive Brief

## 目标

开发一个完整可用的 **WING AI Sound Engineer**：

- 能完整控制 Behringer WING / WING Compact / WING Rack。
- 能作为 MCP server 被 ChatGPT、Claude、Claude Code、OpenCode、Goose、自研 Agent runtime 调用。
- 能通过 Skill / prompt / knowledge base 约束 AI 的现场音频行为。
- 能放在排练室中，通过语音问答排查“为什么没声音”、耳返不对、反馈、路由、录音无信号、直播无信号等问题。
- 能记住房间 patch、设备拓扑、乐队偏好、历史故障。

## 总体原则

1. **完整可用，不做玩具 MVP**：底层必须支持 Native 主路径、OSC fallback、wapi 可选适配。
2. **安全在服务器，不在 prompt**：不要依赖模型“自觉安全”。所有写入由 MCP server 强制校验。
3. **诊断先于修改**：AI 调音师先读状态、看 meter、查 patch，再给修复计划。
4. **现场默认 read-only / dry-run**：尤其是演出和排练现场。
5. **所有写操作两阶段**：`prepare -> confirmation -> apply -> readback -> audit`。
6. **不要复制泄露的 Claude Code 源码**：参考公开文档和开源 agent 架构，clean-room 实现。

## 最终系统图

```text
push-to-talk / wake word / chat ui
        |
        v
voice shell / chat shell
        |
        v
ai-sound-engineer-agent-runtime
        |
        +-- model router
        |     +-- fast triage: deepseek-v4-flash or similar low-cost model
        |     +-- high-risk review: stronger reasoning model
        |     +-- realtime voice: low-latency speech model
        |
        +-- skill / prompt policy
        +-- diagnosis engine
        +-- room memory and RAG
        +-- tool policy hooks
        |
        +-- wing-console-mcp
        +-- sound-memory-mcp
        +-- room-audio-mcp
        |
        v
Behringer WING family console + rehearsal room hardware
```

## 第一批交付物

- `wing-console-mcp`：完整 WING 控制服务。
- `fake-wing`：协议和状态仿真器，用于 CI 和无硬件开发。
- `wing-native-sidecar`：Rust / C++ Native backend，优先参考 libwing。
- `wing-console-operator Skill`：跨 ChatGPT / Claude 的操作规范。
- `sound-diagnosis-engine`：结构化诊断状态机。
- `sound-memory-mcp`：房间知识库、偏好和 incident memory。
- `voice-shell`：push-to-talk 起步，后续 wake word / realtime speech。

## 推荐开发顺序

1. Monorepo 和 coding agent 预设。
2. fake-wing。
3. WING discovery。
4. schema catalog / canonical path / risk catalog。
5. Native sidecar。
6. prepare/apply safety framework。
7. channel/bus/send/main/routing/meter tools。
8. diagnosis engine。
9. memory / knowledge。
10. voice shell。
11. Skill 打包。
12. operator dashboard。

# 01. Product and Source Research

> 调研时间：2026-05-12。开发前应再次核对所有链接。

## 1. Behringer 官方 WING 生态

官方 WING 产品与下载页提供：

- WING EDIT：桌面远程 / 离线控制。
- WING CoPilot：平板远程控制。
- WING Q：乐手个人监听控制。
- Live Sessions：多轨录放与 playback session。
- StageConnect Calculator：StageConnect 配置与供电/线长计算。
- WING Firmware 3.0.6 / 3.1 及相关 release resources。
- WING Remote Protocols。
- WING Manual、WING MIDI Remote、WING DAW Control、WING-DANTE instructions。

开发建议：

- 参考 WING EDIT 的信息架构，但不要逆向或复制私有实现。
- 参考 WING Q 的权限模型：乐手只应控制自己的 monitor bus。
- 参考 Live Sessions / virtual soundcheck 工作流，但默认将其视为高风险 routing 操作。

## 2. WING Remote Protocols

官方远控协议资料说明：

- WING 使用 `2222/UDP`、`2222/TCP`、`2223/UDP`。
- discovery：向 WING IP 的 UDP 2222 发送 `WING?`。
- 返回格式：`WING,<ip>,<name>,<model>,<serial>,<firmware>`。
- Native 通信含多个 communication channels，其中 control-engine、audio-engine、meters 分别有不同通道。
- OSC 使用 UDP 2223。

开发建议：

- discovery 必须作为一等能力实现，不要只依赖手工 IP。
- Native 为主路径，OSC 为 fallback / developer / interop。
- meter 订阅和状态同步必须抽象为统一 driver 能力。

## 3. libwing

libwing 是可参考的 WING Native / Discovery 实现。公开资料显示它提供：

- WING discovery。
- 连接 WING。
- 读写 console parameters。
- 接收 mixer 本身变化事件。
- 节点树概念：id、path、type、min/max、units、read/write。
- Native 协议优于 OSC，且是 Behringer WING apps 使用的通信方式。

开发建议：

- 优先使用 Rust sidecar 调用 libwing，而不是把复杂 Native 逻辑直接写在 Node 里。
- TypeScript MCP server 与 Rust sidecar 用 JSON-RPC over stdio 或 Unix socket 通信。
- sidecar 输出必须结构化、可测试、可模拟。

## 4. wapi

wapi 是 WING API 的 C 语言库。公开资料显示：

- 支持 WING Standard / Compact / Rack。
- 提供 Windows / macOS / Linux 库。
- 通过 UDP/TCP 与 WING 通信，典型 TCP/IP 端口 2222。
- 可管理 WING 35k+ 参数。
- 参数类型包含 node、int、float、string。

开发建议：

- 将 wapi 作为可选 adapter，而不是唯一主路径。
- 使用独立进程封装 C ABI，避免 Node native addon 复杂度扩散到主服务。
- 核对 wapi license agreement 后再决定是否分发 binary。

## 5. MCP

Model Context Protocol 用于让模型通过标准协议访问 tools、resources、prompts。当前关键能力：

- tools：模型可调用的外部动作。
- resources：可读取上下文资源。
- prompts：server 暴露的 prompt template，可被 client 发现。
- transports：stdio 与 Streamable HTTP。
- tool annotations：readOnlyHint、destructiveHint、idempotentHint、openWorldHint 等，但只能作为 hint，不能作为安全边界。

开发建议：

- 本地控制硬件优先 stdio。
- 如果要 Web/ChatGPT connector，使用 Streamable HTTP，且必须有认证和 localhost/origin 防护。
- 对真实硬件控制，MCP tool name 和 description 必须 action-oriented，明确“Use this when…”和风险限制。

## 6. Claude Code / Agent SDK / OpenCode / Goose

可以借鉴：

- CLAUDE.md / memory。
- Slash commands。
- MCP servers。
- Hooks。
- Permissions。
- Subagents。
- Skills。
- Agent SDK 的 project setting / system prompt 结构。

不要做：

- 不要复制或改造泄露的 Claude Code 源码。
- 不要依赖泄露 prompt。
- 不要把现场音频安全策略只写进 prompt。

推荐：

- clean-room agent runtime。
- 兼容 `.claude/` 文件结构，方便 Claude Code / Agent SDK 使用。
- 也支持 OpenCode / Goose / Aider 等开源工具作为开发期 Agent。

## 7. DeepSeek / OpenAI / Anthropic 模型路由

模型不要绑死。建议做 provider abstraction：

- fast_triage：低成本长上下文模型，例如 DeepSeek Flash 类模型。
- high_risk_review：更强 reasoning 模型。
- voice_realtime：低延迟 speech-to-speech / STT / TTS 模型。
- local fallback：离线 STT / local LLM / local RAG。

## 8. 参考链接

完整链接见 `reference-links/REFERENCES.md`。

# 04. MCP Server Design

## 1. Server roles

建议拆成三个 MCP server，而不是全部塞进一个：

```text
wing-console-mcp
  - WING 控制与状态
  - 参数读写
  - meter
  - routing / scene / processing

sound-memory-mcp
  - 房间知识库
  - patch sheet
  - incident memory
  - user/band preferences

room-audio-mcp
  - 本地麦克风采样
  - SPL / RTA / feedback / hum / clip detection
  - TTS output safety
```

如果要先少部署进程，也可以由一个 monolith MCP server 暴露多个 namespace，但内部代码仍按模块隔离。

## 2. Transports

### stdio

用于本机 Claude Desktop、Claude Code、OpenCode、Goose、自研 runtime。

要求：

- stdout 只输出 MCP JSON-RPC。
- logs 必须写 stderr。
- 配置从 env / config file 读取。
- 不要在 stdio 模式阻塞等待用户输入；确认应由 tool result 返回给 client。

### Streamable HTTP

用于 Web UI、ChatGPT custom MCP connector、跨设备控制。

要求：

- 默认 bind `127.0.0.1`。
- 局域网暴露必须启用 auth token。
- 校验 Origin / Host。
- 不把 WING 网络直接暴露公网。
- 生产环境加 TLS / VPN / reverse proxy auth。

## 3. Tool naming conventions

```text
wing_<domain>_<action>
sound_memory_<action>
sound_diagnosis_<action>
room_audio_<action>
```

示例：

```text
wing_channel_get
wing_channel_set_mute_prepare
wing_channel_set_mute_apply
wing_routing_trace
sound_diagnosis_start
sound_memory_search
room_audio_analyze_spectrum
```

Tool description 格式：

```text
Use this when ...
This tool reads/writes ...
Do not use this when ...
Risk: low/medium/high/critical.
Write behavior: prepare/apply/readback/audit.
```

## 4. Structured outputs

所有工具必须返回 `structuredContent`，不要只返回自由文本。

通用结构：

```ts
interface ToolResult<T> {
  ok: boolean;
  data?: T;
  warnings?: Warning[];
  errors?: ToolError[];
  audit_id?: string;
  next_actions?: SuggestedAction[];
  human_summary: string;
}
```

## 5. Resources

暴露只读资源：

```text
wing://status
wing://schema
wing://audit/recent
wing://policy/current
room://current/topology
room://current/patch-sheet
memory://recent-incidents
```

## 6. Prompts

MCP prompts：

```text
no_sound_diagnosis(target, room_id?)
line_check(room_id?)
monitor_mix_adjustment(performer, source)
feedback_triage(location?)
scene_recall_safe_flow(scene_name)
virtual_soundcheck_safe_flow()
incident_report(session_id)
```

示例 prompt：

```ts
server.prompt("no_sound_diagnosis", {
  target: z.string(),
  room_id: z.string().optional()
}, async ({ target, room_id }) => ({
  messages: [{
    role: "user",
    content: {
      type: "text",
      text: `Start a no-sound diagnosis for ${target}. Use read-only WING tools first. Use room memory if available. Ask one human action at a time. Never change phantom, routing, main, scenes or snapshots without exact confirmation. Room: ${room_id ?? "unknown"}.`
    }
  }]
}));
```

## 7. Internal modules

```text
server.ts
  - MCP registration
  - transport setup
  - auth / config

tools/
  - device.ts
  - channels.ts
  - routing.ts
  - meters.ts
  - scenes.ts
  - processing.ts
  - raw.ts

drivers/
  - WingDriver.ts
  - NativeDriver.ts
  - OscDriver.ts
  - WapiDriver.ts

safety/
  - RiskEngine.ts
  - PolicyEngine.ts
  - ConfirmationManager.ts
  - AuditLogger.ts
  - ChangePlanner.ts

state/
  - StateCache.ts
  - SubscriptionManager.ts
  - AliasResolver.ts
  - UnitConverter.ts
```

## 8. Error model

错误要清晰分层：

```ts
export type ErrorCode =
  | "DEVICE_NOT_FOUND"
  | "DEVICE_DISCONNECTED"
  | "PARAM_NOT_FOUND"
  | "PARAM_READ_ONLY"
  | "VALUE_OUT_OF_RANGE"
  | "RISK_CONFIRMATION_REQUIRED"
  | "POLICY_DENIED"
  | "READBACK_MISMATCH"
  | "DRIVER_TIMEOUT"
  | "PROTOCOL_ERROR"
  | "RAW_DISABLED"
  | "LIVE_MODE_DENIED";
```

不要把底层 stack trace 直接给模型，但 audit log 中可保存 developer details。

## 9. Batching

对于大规模状态读取：

- 提供 `wing_param_bulk_get`。
- 提供 `wing_state_snapshot`。
- 对 meter 单独用 subscription / window read。
- 不要让模型循环调用 100 个单参数工具。

## 10. Rate limiting and command coalescing

现场控制必须防止模型疯狂发送工具调用：

```text
- 每个 session 限制每秒 write 数。
- fader delta 可合并。
- 同一个 target 的连续 prepare 会撤销旧 pending change。
- critical operation 需要 cooldown。
```

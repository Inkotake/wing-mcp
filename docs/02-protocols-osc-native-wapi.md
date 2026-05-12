# 02. OSC vs Native vs wapi vs libwing

## 1. 结论

完整 WING AI 调音师系统建议：

```text
Primary driver:   Native via libwing sidecar
Fallback driver:  OSC over UDP 2223
Optional driver:  wapi adapter for comparison / alternative backend
Developer mode:   raw OSC/native, disabled by default
```

不要只做 OSC。OSC 足够做基础控制，但完整产品需要 schema、状态同步、meter、routing、事件、批量参数、固件差异与更稳的读回机制。

## 2. OSC

### 本质

OSC，即 Open Sound Control，是一套通过地址路径传递参数的控制协议。

典型消息：

```text
/ch/14/mute int 1
/ch/1/fdr float 0.72
```

### WING 中的作用

- WING OSC 使用 UDP 2223。
- 易于测试，可用 TouchOSC、BandHelper、QLab 等工具集成。
- 适合 fallback、开发调试和第三方控制场景。

### 优点

- 简单。
- 易调试。
- 容易从脚本发送。
- 与 live show automation 工具生态兼容。

### 缺点

- UDP 无连接，需要自己处理 timeout / retry / readback。
- 参数树和 schema 管理不如 Native 自然。
- 高级功能和事件同步不如 Native。
- 不适合将 35k+ 参数全部裸露给 LLM。

### 推荐实现

```ts
export class WingOscDriver implements WingDriver {
  kind = "osc" as const;
  async getParam(path: string): Promise<WingValue>;
  async setParam(path: string, value: WingValue): Promise<void>;
  async rawSend(address: string, args: OscArg[]): Promise<void>;
}
```

所有 OSC 写入都必须经过 canonical path 和 risk policy，不允许模型直接拼路径，除非 developer raw mode 启用。

## 3. Native

### 本质

Native 是 WING 原生二进制协议，通常走 2222 端口，并按 engine/channel 区分通信类型。公开资料和 libwing 文档显示 Native 更接近官方 App 使用方式。

### 优点

- 更完整。
- 更可靠。
- 支持更好的参数树、事件、meter、状态同步。
- 更适合完整产品。

### 缺点

- 实现复杂。
- 需要处理协议细节、schema、token/hash、事件、meter streams。
- 不适合直接由 TypeScript MCP server 从零实现。

### 推荐实现

用 Rust sidecar 封装：

```text
TypeScript MCP Server
  -> JSON-RPC
  -> Rust wing-native-sidecar
      -> libwing / native protocol
      -> WING console
```

sidecar API：

```json
{"method":"discover","params":{}}
{"method":"connect","params":{"ip":"192.168.1.62"}}
{"method":"get_param","params":{"path":"/ch/1/mute"}}
{"method":"set_param","params":{"path":"/ch/1/mute","value":true}}
{"method":"meter_subscribe","params":{"paths":["/ch/1/in","/main/l"]}}
```

## 4. wapi

### 本质

wapi 是 WING API 的 C library，封装底层 WING 通信。

### 优点

- 参数覆盖广。
- 对 WING 35k+ 参数有成熟抽象。
- 可作为正确性对照。
- 适合后续企业级跨平台 app。

### 缺点

- C ABI / binary distribution / license / platform packaging 复杂。
- Node.js 直接调用会带来 N-API 或 FFI 维护成本。
- 需要明确第三方 license 能否随产品分发。

### 推荐实现

```text
wapi-sidecar
  input: JSON-RPC
  output: JSON-RPC
  native: C API
```

不要把 wapi 直接链接进 MCP server 主进程。

## 5. Canonical path abstraction

无论 OSC、Native 还是 wapi，对上层只暴露 canonical path：

```text
/ch/1/mute
/ch/1/fdr
/ch/1/name
/ch/1/source
/bus/1/fdr
/main/1/fdr
/io/local/1/phantom
/routing/source/lcl/1
```

driver 层负责转换：

```text
canonical -> native node id / path / token
canonical -> osc address + type
canonical -> wapi parameter handle
```

## 6. 协议选择策略

```ts
function chooseDriver(capability: Capability, config: RuntimeConfig): DriverKind {
  if (config.forceDriver) return config.forceDriver;
  if (capability.requiresMeterStream) return "native";
  if (capability.requiresFullSchema) return "native";
  if (capability.isRawOscDeveloperMode) return "osc";
  if (config.nativeAvailable) return "native";
  if (config.oscFallbackEnabled) return "osc";
  throw new Error("No suitable WING driver available");
}
```

## 7. 不同功能的推荐协议

| 功能 | 推荐协议 | 说明 |
|---|---|---|
| discovery | Native/discovery UDP 2222 | 发送 WING? |
| channel fader/mute/name | Native；OSC fallback | 基础控制都可做 |
| full schema search | Native/libwing/wapi | 不建议靠手写 OSC 表 |
| meter stream | Native | 适合稳定订阅 |
| routing trace | Native/schema + state cache | OSC 可辅助但不主导 |
| scenes/snapshots | Native | 高风险，需完整 readback |
| raw developer command | OSC/native | 默认禁用 |
| live diagnosis | Native + meter + room memory | 必须有状态同步 |

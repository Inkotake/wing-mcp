# WING AI Sound Engineer

Behringer WING 系列数字调音台的完整 AI 声音工程师系统。

## 什么是 AI 调音师？

AI 调音师是一个放在排练室/演出现场的智能系统，它通过 MCP (Model Context Protocol) 连接你的 Behringer WING 调音台，让 AI（Claude、ChatGPT 等）能够：

- **安全地读取**调音台的所有状态（通道、母线、EQ、路由、场景…）
- **诊断问题**而不是盲目修改 — "主唱为什么没声音？" → 逐级排查 → 精确定位
- **在确认后调整** — 所有写入需要 `prepare → confirm → apply → readback → audit`
- **记住房间** — patch sheet、乐队偏好、历史故障
- **语音交互** — push-to-talk，像跟调音师说话一样

## 项目结构

```
wing-mcp/
├── packages/
│   ├── wing-console-mcp/        # 核心 MCP 服务器 — 70+ tools
│   └── fake-wing/                # 仿真 WING + 故障注入 profiles
├── rust/wing-native-sidecar/     # Native 协议边车 (Rust, JSON-RPC)
├── docs/                         # 设计文档 + 工具参考
├── mcp-spec/                     # MCP 工具规范 (YAML + JSON Schema)
└── issues/                       # 18 个开发任务卡
```

> **AI 调音师** (诊断引擎、房间记忆、Skill、语音) 在独立项目 [mixingagent](https://github.com/Inkotake/mixingagent)

## 快速开始

### 前提

- Status: **pre-alpha** — fake driver fully functional, Native/OSC drivers are stubs
- Node.js >= 18
- pnpm (`npm install -g pnpm`)
- (可选) Rust 工具链 — 用于 native sidecar

### 安装运行

```bash
pnpm install
pnpm build

# 使用 fake-wing (无需硬件)
WING_MODE=rehearsal_safe npx wing-console-mcp

# 或指定 driver
WING_DRIVER=fake WING_MODE=rehearsal_safe npx wing-console-mcp
```

### Claude Code 配置

在 `.claude/mcp.json` 中添加：

```json
{
  "mcpServers": {
    "wing-console": {
      "command": "node",
      "args": ["packages/wing-console-mcp/dist/server.js"],
      "env": {
        "WING_MODE": "rehearsal_safe",
        "WING_DRIVER": "fake"
      }
    }
  }
}
```

## MCP 工具概览 (60+ tools)

### 多层级信息获取

| 工具 | 层级 | 用途 |
|------|------|------|
| `wing_quick_check` | 快照 | "有没有问题？" — 1秒诊断 |
| `wing_state_summary` | 概览 | "现在什么状态？" — 结构化概览 |
| `wing_state_snapshot` | 全量 | "给我全部数据" — 完整 dump |
| `wing_channel_strip` | 聚焦 | "CH 1 的详情" — 单通道深度 |
| `wing_signal_path_trace` | 追踪 | "信号断在哪？" — 逐节点追踪 |
| `wing_param_bulk_get` | 批量 | "一次读 50 个参数" |

### 完整工具分类

| 分类 | 工具 |
|------|------|
| 设备 | `wing_discover` `wing_connect` `wing_get_status` |
| Schema | `wing_schema_search` `wing_param_resolve` |
| 参数 | `wing_param_get` `wing_param_set_prepare/apply` `wing_param_bulk_get` |
| 通道 | `wing_channel_list` `wing_channel_get` `wing_channel_adjust_fader_prepare/apply` `wing_channel_set_mute_prepare/apply` |
| 发送 | `wing_send_get` `wing_send_adjust_prepare/apply` |
| 路由 | `wing_routing_trace` `wing_routing_get` `wing_routing_set_prepare/apply` |
| 话放 | `wing_headamp_get` `wing_headamp_set_prepare/apply` `wing_phantom_set_prepare/apply` |
| EQ/动态 | `wing_eq_get` `wing_eq_set_band_prepare/apply` `wing_gate_get/set` `wing_comp_get/set` |
| FX | `wing_fx_slot_list` `wing_fx_slot_get` `wing_fx_slot_set_model_prepare/apply` |
| DCA/编组 | `wing_dca_list/get` `wing_dca_set_mute_prepare/apply` `wing_dca_adjust_fader_prepare/apply` |
| Mute Group | `wing_mute_group_list` `wing_mute_group_set_prepare/apply` |
| 主输出 | `wing_main_get` `wing_main_adjust_fader_prepare/apply` `wing_main_set_mute_prepare/apply` |
| Matrix | `wing_matrix_list` |
| 场景 | `wing_scene_list` `wing_scene_recall_prepare/apply` `wing_snapshot_save_prepare/apply` |
| 计量 | `wing_meter_catalog` `wing_meter_read` `wing_signal_check` |
| 诊断 | `sound_diagnosis_start` `sound_diagnosis_next_step` `sound_diagnosis_prepare/apply_fix` |
| 调试 | `wing_debug_dump_state` `wing_usb_recorder_get` |
| Raw | `wing_raw_osc_prepare/apply` `wing_raw_native_prepare/apply` (默认禁用) |

## 安全模型

```
Read → Risk Classify → Policy Check → Confirmation → Apply → Readback → Audit
```

4 种运行模式：

| 模式 | 允许写入 | 最大风险 | Raw 工具 |
|------|---------|---------|---------|
| `read_only` | 否 | 无 | 禁用 |
| `rehearsal_safe` | 是 | medium | 禁用 |
| `maintenance` | 是 | critical | 禁用 |
| `developer_raw` | 是 | critical | 允许 |

所有写入的强制保护：
- read-before-write + readback
- delta capping (channel fader 3dB, main 1.5dB, sends 6dB)
- 确认超时 (5分钟)
- 审计日志追踪
- 绝对拒绝：raw 在 live mode、critical 无精确确认、expired ID

## AI 调音师示例

### "主唱没声音了！"

```
AI: 让我先检查，不修改任何设置。
    → wing_quick_check
    → CH 1 无信号

AI: 追踪 CH 1 信号路径...
    → wing_signal_path_trace
    → headamp OK, channel not muted, fader -6dB
    → Main LR has signal

AI: CH 1 的通道路径看起来正常。问题可能在音源。
    请检查主唱的话筒线是否插好、无线接收器是否开机。

(User fixes cable)

AI: 重新检查...
    → CH 1 signal: RMS -18.3 dBFS ✓
    信号恢复了！当前 fader -6.0 dB。
```

### "鼓手耳返里听不到主唱"

```
AI: → wing_param_resolve("鼓手耳返") → Bus 1
    → wing_param_resolve("主唱") → CH 1
    → wing_send_get(ch=1, bus=1) → -45 dB (太低!)

AI: 问题定位：主唱到鼓手耳返的发送量太低。
    建议：CH 1 → Bus 1 从 -45dB 调到 -10dB

    [准备修改] 确认ID: conf-abc123
    确认执行："确认把主唱到鼓手耳返提高35dB"

User: 确认

AI: ✓ 已完成 — CH 1 → Bus 1: -45.0 dB → -10.0 dB, 回读 -10.0 dB
    审计编号 aud_xyz789
```

## 开发

### 测试

```bash
pnpm test                    # 40 个测试 (unit + integration)
WING_HARDWARE_TEST=1 pnpm test  # 含硬件测试 (需要实机)
```

### 代码结构

```
packages/wing-console-mcp/src/
├── server.ts              # MCP 服务器入口
├── types.ts               # 共享类型、Zod schemas、风险映射
├── drivers/WingDriver.ts  # 驱动接口 + FakeWingDriver
├── safety/                # 安全引擎
│   ├── RiskEngine.ts      # 风险分类
│   ├── PolicyEngine.ts    # 策略决策
│   ├── ConfirmationManager.ts  # 确认票据
│   ├── AuditLogger.ts     # 审计日志
│   └── ChangePlanner.ts   # 写入协调
├── state/                 # 状态管理
│   └── StateCache.ts      # 缓存 + 别名解析 + 单位转换
└── tools/                 # MCP 工具实现 (12个模块)
    ├── device.ts          # 设备发现/连接/状态
    ├── schema.ts          # Schema 搜索/参数解析
    ├── params.ts          # 参数读写
    ├── channels.ts        # 通道操作
    ├── sends.ts           # 发送操作
    ├── routing.ts         # 路由操作
    ├── headamp.ts         # 话放/幻象电源
    ├── scenes.ts          # 场景/快照
    ├── meters.ts          # 计量/信号检查
    ├── processing.ts      # EQ/Gate/Comp/FX
    ├── groups.ts          # DCA/Mute Group/Main/Matrix
    ├── views.ts           # 多层级视图
    ├── bulk.ts            # 批量读取/调试dump/USB
    ├── diagnosis.ts       # 诊断状态机
    └── raw.ts             # Raw OSC/Native (禁用)
```

## 许可证

MIT. 参见 CLAUDE.md 和 docs/15-known-risks-and-legal-notes.md。

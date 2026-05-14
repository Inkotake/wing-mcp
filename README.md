# wing-mcp

Behringer WING 系列数字调音台的 **MCP (Model Context Protocol) Server**。

通过标准 MCP 协议，让 Claude、ChatGPT 及任何 MCP 客户端安全地控制 WING 调音台。

> **Status: pre-alpha** — Fake driver fully functional. OSC/Native drivers are experimental stubs. Not for production/live use.
> **AI 调音师应用** (诊断引擎、Skill、语音、记忆) 在 [mixingagent](https://github.com/Inkotake/mixingagent)。

## 核心能力

- **91 个 MCP 工具** — 完整覆盖 WING 控制面：设备、通道、母线、路由、话放、EQ、动态、FX、DCA、场景、计量
- **5 级信息视图** — quick_check → summary → strip → snapshot → path_trace，AI 按需取用
- **安全写入管道** — `prepare → confirm → apply → readback → audit`，服务器强制执行
- **4 种运行模式** — read_only / rehearsal_safe / maintenance / developer_raw
- **Fake WING 仿真** — 48ch + 16bus + 8DCA + 8FX + 8Matrix，10 个 fault profiles，无需硬件
- **3 种驱动** — Native (libwing)、OSC (UDP 2223)、Fake (仿真)

## 项目结构

```
wing-mcp/
├── packages/
│   ├── wing-console-mcp/     # MCP 服务器 — 91 tools, 安全引擎, 3 drivers
│   └── fake-wing/             # 仿真 WING + 故障注入 profiles
├── rust/wing-native-sidecar/  # Rust JSON-RPC 边车 (libwing)
├── docs/                      # 工具参考、架构、设置指南
├── mcp-spec/                  # 工具规范 (YAML + JSON Schema)
└── issues/                    # 开发任务卡
```

## 快速开始

```bash
# 安装
pnpm install && pnpm build

# 启动 (fake 模式 — 无需硬件)
WING_DRIVER=fake WING_MODE=rehearsal_safe node packages/wing-console-mcp/dist/server.js

# 连接 Claude Code — 在 .claude/mcp.json 添加:
{
  "mcpServers": {
    "wing-console": {
      "command": "node",
      "args": ["packages/wing-console-mcp/dist/server.js"],
      "env": { "WING_MODE": "rehearsal_safe", "WING_DRIVER": "fake" }
    }
  }
}
```

## MCP 工具分类

| 分类 | 工具数 | 示例 |
|------|--------|------|
| 设备 | 3 | `wing_discover` `wing_connect` `wing_get_status` |
| Schema | 2 | `wing_schema_search` `wing_param_resolve` |
| 参数 | 3 | `wing_param_get` `wing_param_set_prepare/apply` |
| 通道 | 6 | `wing_channel_list/get` `adjust_fader` `set_mute` |
| 发送 | 3 | `wing_send_get` `wing_send_adjust_prepare/apply` |
| 路由 | 4 | `wing_routing_trace/get` `wing_routing_set_prepare/apply` |
| 话放 | 5 | `wing_headamp_get/set` `wing_phantom_set_prepare/apply` |
| EQ | 3 | `wing_eq_get` `wing_eq_set_band_prepare/apply` |
| Gate/Comp | 6 | `wing_gate_get/set` `wing_comp_get/set` |
| FX | 5 | `wing_fx_slot_list/get` `wing_fx_slot_set_model_prepare/apply` |
| DCA | 6 | `wing_dca_list/get` `set_mute` `adjust_fader` |
| Mute Group | 3 | `wing_mute_group_list` `wing_mute_group_set_prepare/apply` |
| Main LR | 5 | `wing_main_get` `adjust_fader` `set_mute` |
| Matrix | 5 | `wing_matrix_list` `set_mute` `adjust_fader` |
| 场景 | 4 | `wing_scene_list` `recall` `snapshot_save` |
| 视图 | 5 | `wing_quick_check` `state_summary/snapshot` `channel_strip` `signal_path_trace` |
| Meters | 3 | `wing_meter_read` `wing_signal_check` |
| 诊断 | 4 | `sound_diagnosis_start/next_step/prepare_fix/apply_fix` |
| USB | 5 | `wing_usb_recorder_get` `record/stop_prepare/apply` |
| 紧急 | 5 | `wing_emergency_stop/apply/status/reset/apply` |
| Bulk | 3 | `wing_param_bulk_get` `wing_debug_dump_state` |
| Raw | 4 | `wing_raw_osc/native_prepare/apply` (默认禁用) |

## 安全模型

```
Read → Risk Classify → Policy Check → Confirm (exact text match) → Apply → Readback → Audit (SHA-256 hashed)
```

| 模式 | 写入 | 最大风险 | Raw | 适用场景 |
|------|------|---------|-----|---------|
| `read_only` | 否 | none | 否 | 演出现场 |
| `rehearsal_safe` | 是 | medium | 否 | 排练/试音 |
| `maintenance` | 是 | critical | 否 | 空场调试 |
| `developer_raw` | 是 | critical | 是 | 开发测试 |

**所有 high/critical 写入必须精确确认文本匹配。Emergency stop 可在 read_only 中使用。确认文本 SHA-256 哈希存储，不存明文。**

## 测试

```bash
pnpm test  # 122 tests (11 files) — unit + integration
```

## License

MIT

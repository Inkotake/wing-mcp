# wing-mcp

Behringer WING 系列数字调音台 **MCP Server** — 通过标准 MCP 协议安全控制 WING。

> **Status: pre-alpha** — Fake driver fully functional. OSC experimental. Native stub. Not for production/live use.
> **AI 调音师** → [mixingagent](https://github.com/Inkotake/mixingagent)

## 开发状态

| 模块 | 状态 | 说明 |
|------|------|------|
| Fake driver | ✅ 可用 | 48ch+16bus+8DCA+8FX+8Matrix, 10 fault profiles, 动态信号传播 |
| OSC driver | ⚠️ 实验 | UDP 2222/2223 框架完成, WING path 已通过 propmap 验证, 需实机 truth test |
| Native/libwing | ❌ stub | 仅集成 60,748 propmap 数据, Rust sidecar get/set 返回 NOT_IMPLEMENTED |
| MCP tools | ✅ 91 tools | 完整覆盖设备/通道/母线/路由/话放/EQ/动态/FX/DCA/场景/计量/紧急 |
| 安全引擎 | ✅ | prepare→apply, 精确确认, MATERIAL_STATE_CHANGED, SHA-256 hash, JSONL audit |
| 测试 | ✅ 122 tests | 11 文件, CI: Node 18/20/22 |
| Raw tools | ❌ 禁用 | 需要 WING_MODE=developer_raw + WING_ENABLE_RAW=1 + WING_RAW_UNLOCK |

## 快速开始

```bash
pnpm install && pnpm build
WING_DRIVER=fake WING_MODE=rehearsal_safe node packages/wing-console-mcp/dist/server.js
```

**Claude Code 配置** (`.claude/mcp.json`):
```json
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

## 项目结构

```
wing-mcp/
├── packages/
│   ├── wing-console-mcp/  # MCP 服务器 — 91 tools, 安全引擎, 3 drivers
│   └── fake-wing/          # 仿真 WING + 故障注入 profiles
├── rust/wing-native-sidecar/  # Rust JSON-RPC 边车 (libwing, stub)
├── docs/                   # 工具参考, 架构, 设置指南, 路线图
├── mcp-spec/               # 工具规范 (YAML + JSON Schema)
└── issues/                 # 18 开发任务卡
```

## 工具分类 (91 tools)

| 分类 | 数量 | 示例 |
|------|------|------|
| 设备 | 3 | discover, connect, status |
| Schema | 2 | schema_search, param_resolve |
| 参数 | 3 | param_get, param_set_prepare/apply |
| 通道 | 6 | channel_list/get, adjust_fader, set_mute |
| 发送 | 3 | send_get, send_adjust_prepare/apply |
| 路由 | 4 | routing_trace/get, routing_set_prepare/apply |
| 话放/幻象 | 5 | headamp_get/set, phantom_set_prepare/apply |
| EQ | 3 | eq_get, eq_set_band_prepare/apply |
| Gate/Comp | 6 | gate_get/set, comp_get/set |
| FX | 5 | fx_slot_list/get, fx_slot_set_model_prepare/apply |
| DCA | 6 | dca_list/get, set_mute, adjust_fader |
| Mute Group | 3 | mute_group_list, mute_group_set_prepare/apply |
| Main LR | 5 | main_get, adjust_fader, set_mute |
| Matrix | 5 | matrix_list, set_mute, adjust_fader |
| 场景 | 4 | scene_list, recall, snapshot_save |
| 视图 | 5 | quick_check, summary, snapshot, strip, path_trace |
| Meters | 3 | meter_read, signal_check |
| 诊断 | 4 | diagnosis_start/next_step/prepare_fix/apply_fix |
| USB 录音 | 5 | recorder_get, record/stop_prepare/apply |
| 紧急 | 5 | emergency_stop/apply/status/reset/apply |
| Bulk | 3 | param_bulk_get, debug_dump_state |
| Raw | 4 | raw_osc/native_prepare/apply (默认禁用) |

## 安全模型

```
Read → Risk Classify → Policy → Confirm (exact text match) → Apply → Readback → Audit (SHA-256)
```

| 模式 | 写入 | 最大风险 | 适用场景 |
|------|------|---------|---------|
| `read_only` | 否 | none | 演出现场 |
| `rehearsal_safe` | 是 | medium | 排练/试音 |
| `maintenance` | 是 | critical | 空场调试 |
| `developer_raw` | 是 | critical + raw | 开发测试 |

## 环境变量

```bash
WING_DRIVER=fake|osc|native    # 驱动选择
WING_HOST=192.168.1.62         # WING IP (osc/native)
WING_MODE=rehearsal_safe       # 运行模式
WING_AUDIT_DIR=./data/audit    # 审计日志目录
WING_ENABLE_RAW=0              # 启用 raw tools
WING_RAW_UNLOCK=               # raw tools 解锁口令
WING_ALLOW_UNVERIFIED_OSC_PATHS=0  # 允许未验证 OSC 路径
WING_HARDWARE_TEST=0           # 硬件测试门禁
```

## 测试

```bash
pnpm test  # 122 tests (11 files): unit + integration + safety pipeline
```

## License

MIT

# Changelog

## 0.1.0 (2026-05-13)

### Initial Release — pre-alpha

**91 MCP tools** across 16 categories, fake driver only. Native/OSC are stubs.

#### Tools
- Device: discover, connect, get_status
- Schema: schema_search, param_resolve (with AliasResolver)
- Params: get, set_prepare/apply, bulk_get
- Channels: list, get, adjust_fader_prepare/apply, set_mute_prepare/apply
- Sends: get, adjust_prepare/apply
- Routing: trace, get, set_prepare/apply
- Headamp: get, set_prepare/apply, phantom_set_prepare/apply
- EQ: get, set_band_prepare/apply (4-band)
- Gate: get, set_prepare/apply
- Compressor: get, set_prepare/apply
- FX: slot_list, slot_get, slot_set_model_prepare/apply
- DCA: list, get, set_mute_prepare/apply, adjust_fader_prepare/apply
- Mute Group: list, set_prepare/apply
- Main LR: get, adjust_fader_prepare/apply, set_mute_prepare/apply
- Matrix: list, set_mute_prepare/apply, adjust_fader_prepare/apply
- Scenes: list, recall_prepare/apply, snapshot_save_prepare/apply
- Meters: catalog, read, signal_check
- Views: quick_check, state_summary, state_snapshot, channel_strip, signal_path_trace
- Diagnosis: start, next_step, prepare_fix, apply_fix
- USB Recorder: get, record_prepare/apply, stop_prepare/apply
- Emergency: stop, stop_apply, status, reset, reset_apply
- Bulk: param_bulk_get, debug_dump_state
- Raw: osc_prepare/apply, native_prepare/apply (disabled by default)

#### Safety Engine
- RiskEngine: tool+target risk classification with elevation
- PolicyEngine: 4-mode enforcement (read_only, rehearsal_safe, maintenance, developer_raw)
- ConfirmationManager: UUID tickets, 5min TTL, _prepare/_apply name normalization
- Critical exact confirmation text matching
- State drift detection (material change between prepare and apply)
- Tolerant float comparison (0.15 dB, 0.001 linear)
- RateLimiter: 12 writes/min, 2s interval, 10s critical cooldown, emergency bypass
- AuditLogger: in-memory + JSONL persistence (data/audit/YYYY-MM-DD.jsonl)
- Runtime input validation (channel/bus/DCA ranges, enum checks)

#### Drivers
- FakeWingDriver: 48ch + 16bus + 8DCA + 8FX + 8Matrix, independent meter params, 6 fault profiles
- OscDriver: real UDP 2222 discovery + UDP 2223 OSC 1.0 encode/decode with canonical path mapping
- NativeDriver: JSON-RPC stub (delegates to Rust sidecar)
- Rust sidecar: JSON-RPC over stdin/stdout, UDP 2222 WING? discovery

#### Tests — 91 passing (8 files)
- 21 unit: RiskEngine, PolicyEngine, ConfirmationManager, AuditLogger
- 6 unit: RateLimiter
- 10 unit: ConfirmationManager valuesEqual, critical exact match, state drift
- 19 integration: FakeWingDriver + ChangePlanner prepare/apply
- 8 integration: view tools (quick_check, summary, snapshot, strip, path_trace)
- 4 integration: channel tools (list, get, fader/mute prepare→apply cycles)
- 14 integration: meters, headamp, scenes, processing, FX, bulk, USB
- 9 integration: E2E safety pipeline (prepare→apply→readback→audit)

#### CI
- GitHub Actions: Node 18/20/22 build matrix + test

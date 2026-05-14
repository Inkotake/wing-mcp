# Changelog

## 0.1.0-pre (2026-05-13)

### Sprint 0-4 Complete — Safety Kernel Hardened

**Safety:**
- high + critical both require exact confirmation text match
- MATERIAL_STATE_CHANGED error code for state drift detection
- Confirmation text SHA-256 hashed in audit (never stored raw)
- Emergency snapshot save before mute, snapshot-based restore (Main LR last)
- No-snapshot restore refused

**MCP Server:**
- Tool annotations: readOnlyHint, destructiveHint, idempotentHint, openWorldHint
- structuredContent on successful tool results
- WING_MODE validated at startup with clear error

**FakeWing:**
- Dynamic signal propagation: mute/fader/source/gate changes update meter graph
- Channel: input→gate→mute→fader→post_fader
- Main LR: sums active channel post-fader contributions
- 10 fault profiles for no-sound testing

**OSC Driver:**
- Real UDP 2222 discovery (broadcast + direct probe)
- UDP 2223 OSC 1.0 encode/decode
- Address-correlated query response matching (not FIFO)
- Canonical→OSC path mapping (WARNING: may use X32-style paths, needs WING hardware verification)

**Drivers:**
- NativeDriver: JSON-RPC stub (delegates to Rust sidecar)
- OscDriver: UDP-based with OSC codec
- FakeWingDriver: 48ch + 16bus + 8DCA + 8FX + 8Matrix

**CI:**
- GitHub Actions: Node 18/20/22 build matrix + test

**Tests:** 107 passing (9 files)

### Known Limitations
- Native driver is a stub (requires libwing hardware integration)
- OSC path mapping unverified (needs WING Remote Protocols truth test)
- No rolling window cumulative delta protection
- No hardware test gate implementation

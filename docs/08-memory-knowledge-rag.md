# 08. Memory, Knowledge, and RAG

## 1. Knowledge sources

```text
global_docs/
  behringer/
    wing-manual.md or link
    wing-remote-protocols.md or link
    wing-midi-remote.md or link
  live_sound/
    no-sound-troubleshooting.md
    gain-staging.md
    phantom-power-safety.md
    feedback-handling.md
    monitor-mixing.md

room_docs/
  room-a/
    patch-sheet.md
    wiring-diagram.svg
    speaker-processor.md
    default-wing-scene.md
    mic-inventory.md
    common-failures.md

band_docs/
  band-foo/
    channel-list.md
    preferred-monitor-mixes.md
    rehearsal-history.md
```

Do not bundle vendor PDFs unless licensing permits. Store links and extracted notes created by the user/team.

## 2. Memory types

| Type | Description | Example | Write policy |
|---|---|---|---|
| semantic | Long-term facts | Room A main speakers are XLR 7/8 | confirmed or documented |
| episodic | Incident history | CH7 cable failed on 2026-05-10 | tool/user observed |
| procedural | Reusable workflows | No-sound diagnosis order | maintained in repo |
| preference | Band/user preference | Drummer wants click +4 dB | user confirmation required |
| safety | Hard limits | AI cannot control Main LR in Room B | admin only |
| operational | Current session state | diagnosing Vocal 1 no sound | automatic, TTL |

## 3. MemoryRecord schema

```ts
export interface MemoryRecord {
  id: string;
  type: "semantic" | "episodic" | "procedural" | "preference" | "safety" | "operational";
  scope: "global" | "room" | "band" | "user" | "device" | "session";
  scopeId: string;
  text: string;
  structured?: Record<string, unknown>;
  source: {
    kind: "user_confirmed" | "tool_observed" | "document" | "agent_inferred";
    ref?: string;
  };
  confidence: number;
  createdAt: string;
  updatedAt: string;
  expiresAt?: string;
  requiresReview?: boolean;
}
```

## 4. sound-memory-mcp tools

```text
sound_memory_search
sound_memory_get
sound_memory_write_prepare
sound_memory_write_apply
sound_room_get_topology
sound_room_get_patch_sheet
sound_room_update_patch_prepare
sound_room_update_patch_apply
sound_incident_log
sound_incident_summarize
```

## 5. Search ranking

Ranking should combine：

```text
score = semantic_similarity
      + scope_boost(room/band/device)
      + recency_boost(for incidents)
      + confidence_boost
      + source_quality_boost
      - stale_penalty
```

## 6. Memory write rules

- Tool-observed state can be logged automatically.
- User preference requires explicit confirmation.
- AI-inferred memory must set `requiresReview: true`.
- Safety memory is admin-only.
- Patch/routing memory should include evidence.
- Do not silently update room patch sheet from a single ambiguous user statement.

## 7. RAG response rule

When using memory in diagnosis, model must distinguish：

```text
- live telemetry says ...
- room memory says ...
- user just reported ...
- I infer ...
```

Never trust stale memory over live WING telemetry.

## 8. Suggested storage

Development:

```text
SQLite for metadata/audit/incidents
Markdown/YAML files for room docs
LanceDB / sqlite-vss / Qdrant for vector search
```

Production:

```text
Postgres + pgvector or Qdrant
object storage for docs
append-only audit log
encrypted secrets
```

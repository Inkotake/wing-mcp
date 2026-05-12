#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import * as fs from "node:fs";
import * as path from "node:path";

// ============================================================================
// Configuration
// ============================================================================

const WING_MODE = (process.env.WING_MODE as string) ?? "rehearsal_safe";
const WING_MEMORY_PATH =
  process.env.WING_MEMORY_PATH ?? path.join(process.cwd(), ".wing-memory.json");
const WING_ADMIN_KEY = process.env.WING_ADMIN_KEY ?? "";

const isAdmin = WING_MODE === "maintenance" || WING_MODE === "developer_raw";
const SESSION_ID = `ses_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
let liveMode = false;

// ============================================================================
// Types
// ============================================================================

export type MemoryType =
  | "semantic"
  | "episodic"
  | "procedural"
  | "preference"
  | "safety"
  | "operational";

export type MemoryScope = "global" | "room" | "band" | "user" | "device" | "session";

export type SourceKind = "user_confirmed" | "tool_observed" | "document" | "agent_inferred";

export interface MemorySource {
  kind: SourceKind;
  ref?: string;
}

export interface MemoryRecord {
  id: string;
  type: MemoryType;
  scope: MemoryScope;
  scopeId: string;
  text: string;
  structured?: Record<string, unknown>;
  source: MemorySource;
  confidence: number;
  createdAt: string;
  updatedAt: string;
  expiresAt?: string;
  requiresReview?: boolean;
}

export interface RoomTopology {
  roomId: string;
  name: string;
  device: { model: string; ip: string; firmware?: string };
  patchSheet: PatchSheet;
  bandPreferences: BandPreference[];
  incidents: IncidentRecord[];
  updatedAt: string;
}

export interface PatchSheet {
  roomId: string;
  channels: Array<{
    ch: number;
    name: string;
    source: string;
    phantom: boolean;
    notes?: string;
  }>;
  buses: Array<{
    bus: number;
    name: string;
    destination: string;
    notes?: string;
  }>;
}

export interface BandPreference {
  id: string;
  performer: string;
  category: string;
  key: string;
  value: string;
  notes?: string;
}

export interface IncidentRecord {
  id: string;
  timestamp: string;
  roomId: string;
  type: "no_sound" | "feedback" | "routing" | "hardware" | "other";
  target: string;
  description: string;
  resolution: string;
  auditId?: string;
}

export interface SearchResult<T> {
  item: T;
  score: number;
  breakdown: {
    semantic: number;
    scopeBoost: number;
    recencyBoost: number;
    confidenceBoost: number;
    stalePenalty: number;
  };
}

interface PendingWrite {
  id: string;
  tool: string;
  target: string;
  memory: Omit<MemoryRecord, "id" | "createdAt" | "updatedAt">;
  expiresAt: number;
  createdAt: number;
  requiresExactConfirmation: boolean;
  exactConfirmationTemplate?: string;
}

interface ToolResult<T = unknown> {
  ok: boolean;
  data?: T;
  warnings?: Array<{ code: string; message: string }>;
  errors?: Array<{ code: string; message: string; details?: unknown }>;
  audit_id?: string;
  next_actions?: Array<{ tool: string; description: string; args?: Record<string, unknown> }>;
  human_summary: string;
}

// ============================================================================
// Zod Schemas
// ============================================================================

const MemoryTypeSchema = z.enum([
  "semantic",
  "episodic",
  "procedural",
  "preference",
  "safety",
  "operational",
]);

const MemoryScopeSchema = z.enum([
  "global",
  "room",
  "band",
  "user",
  "device",
  "session",
]);

const SourceKindSchema = z.enum([
  "user_confirmed",
  "tool_observed",
  "document",
  "agent_inferred",
]);

const MemorySourceSchema = z.object({
  kind: SourceKindSchema,
  ref: z.string().optional(),
});

const MemoryRecordSchema = z.object({
  id: z.string(),
  type: MemoryTypeSchema,
  scope: MemoryScopeSchema,
  scopeId: z.string(),
  text: z.string(),
  structured: z.record(z.unknown()).optional(),
  source: MemorySourceSchema,
  confidence: z.number().min(0).max(1),
  createdAt: z.string(),
  updatedAt: z.string(),
  expiresAt: z.string().optional(),
  requiresReview: z.boolean().optional(),
});

const SoundMemorySearchInputSchema = z.object({
  query: z.string().min(1).describe("Search query string"),
  types: z.array(MemoryTypeSchema).optional().describe("Filter by memory types"),
  scope: MemoryScopeSchema.optional().describe("Filter by scope"),
  scopeId: z.string().optional().describe("Filter by scope ID (e.g. roomId)"),
  limit: z.number().int().min(1).max(100).default(20).describe("Max results to return"),
  min_confidence: z.number().min(0).max(1).default(0).describe("Minimum confidence threshold"),
});

const SoundMemoryGetInputSchema = z.object({
  id: z.string().min(1).describe("Memory record ID"),
});

const MemoryWritePrepareInputSchema = z.object({
  type: MemoryTypeSchema.describe("Memory type"),
  scope: MemoryScopeSchema.describe("Memory scope (global/room/band/user/device/session)"),
  scopeId: z.string().min(1).describe("Scope identifier (e.g. room name, band name)"),
  text: z.string().min(1).describe("Human-readable memory content"),
  structured: z.record(z.unknown()).optional().describe("Optional structured data"),
  source: MemorySourceSchema.describe("Source of this memory (user_confirmed/tool_observed/document/agent_inferred)"),
  confidence: z.number().min(0).max(1).default(0.8).describe("Confidence 0-1"),
  expiresAt: z.string().optional().describe("Optional ISO expiration timestamp"),
});

const MemoryWriteApplyInputSchema = z.object({
  confirmation_id: z.string().min(1).describe("Confirmation ID from sound_memory_write_prepare"),
  confirmed: z.boolean().describe("Whether the user confirmed the write"),
  exact_confirmation_text: z.string().optional().describe("Exact confirmation text if required"),
});

const SoundRoomGetTopologyInputSchema = z.object({
  room_id: z.string().min(1).describe("Room identifier"),
});

const SoundRoomGetPatchSheetInputSchema = z.object({
  room_id: z.string().min(1).describe("Room identifier"),
});

const PatchChannelSchema = z.object({
  ch: z.number().int().min(1).max(128),
  name: z.string(),
  source: z.string(),
  phantom: z.boolean(),
  notes: z.string().optional(),
});

const PatchBusSchema = z.object({
  bus: z.number().int().min(1).max(64),
  name: z.string(),
  destination: z.string(),
  notes: z.string().optional(),
});

const PatchSheetInputSchema = z.object({
  channels: z.array(PatchChannelSchema),
  buses: z.array(PatchBusSchema),
});

const RoomPatchPrepareInputSchema = z.object({
  room_id: z.string().min(1).describe("Room identifier"),
  patch: PatchSheetInputSchema.describe("Updated patch sheet"),
});

const RoomPatchApplyInputSchema = z.object({
  confirmation_id: z.string().min(1).describe("Confirmation ID from sound_room_update_patch_prepare"),
  confirmed: z.boolean().describe("Whether the user confirmed the update"),
  exact_confirmation_text: z.string().optional().describe("Exact confirmation text if required"),
});

const IncidentTypeSchema = z.enum(["no_sound", "feedback", "routing", "hardware", "other"]);

const SoundIncidentLogInputSchema = z.object({
  room_id: z.string().min(1).describe("Room identifier"),
  type: IncidentTypeSchema.describe("Incident type"),
  target: z.string().min(1).describe("Affected target (e.g. channel name, bus name)"),
  description: z.string().min(1).describe("What happened"),
  resolution: z.string().default("pending").describe("How it was or will be resolved"),
  audit_id: z.string().optional().describe("Related audit record ID"),
});

const SoundIncidentSummarizeInputSchema = z.object({
  room_id: z.string().min(1).describe("Room identifier"),
  since: z.string().optional().describe("ISO timestamp to filter incidents from"),
  limit: z.number().int().min(1).max(200).default(50).describe("Max incidents to include"),
});

// ============================================================================
// Storage
// ============================================================================

const memories: Map<string, MemoryRecord> = new Map();
const pendingWrites: Map<string, PendingWrite> = new Map();
const rooms: Map<string, RoomTopology> = new Map();
const incidents: Map<string, IncidentRecord> = new Map();

let writeCounter = 0;

function nextId(prefix: string): string {
  writeCounter++;
  return `${prefix}_${Date.now()}_${writeCounter.toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

function nowISO(): string {
  return new Date().toISOString();
}

function ensureRoom(roomId: string): RoomTopology {
  if (!rooms.has(roomId)) {
    const topology: RoomTopology = {
      roomId,
      name: roomId,
      device: { model: "WING", ip: "unknown" },
      patchSheet: { roomId, channels: [], buses: [] },
      bandPreferences: [],
      incidents: [],
      updatedAt: nowISO(),
    };
    rooms.set(roomId, topology);
  }
  return rooms.get(roomId)!;
}

// Persistence
function saveToDisk(): void {
  try {
    const data = {
      memories: Array.from(memories.values()),
      rooms: Array.from(rooms.values()),
      incidents: Array.from(incidents.values()),
      savedAt: nowISO(),
    };
    fs.writeFileSync(WING_MEMORY_PATH, JSON.stringify(data, null, 2), "utf-8");
  } catch (e) {
    console.error(`[sound-memory-mcp] Failed to persist to ${WING_MEMORY_PATH}: ${e}`);
  }
}

function loadFromDisk(): void {
  try {
    if (fs.existsSync(WING_MEMORY_PATH)) {
      const raw = fs.readFileSync(WING_MEMORY_PATH, "utf-8");
      const data = JSON.parse(raw);
      if (Array.isArray(data.memories)) {
        for (const m of data.memories) {
          const parsed = MemoryRecordSchema.safeParse(m);
          if (parsed.success) {
            memories.set(parsed.data.id, parsed.data);
          }
        }
      }
      if (Array.isArray(data.rooms)) {
        for (const r of data.rooms) {
          rooms.set(r.roomId, r);
        }
      }
      if (Array.isArray(data.incidents)) {
        for (const inc of data.incidents) {
          incidents.set(inc.id, inc);
        }
      }
      console.error(`[sound-memory-mcp] Loaded ${memories.size} memories, ${rooms.size} rooms, ${incidents.size} incidents from ${WING_MEMORY_PATH}`);
    }
  } catch (e) {
    console.error(`[sound-memory-mcp] Failed to load from ${WING_MEMORY_PATH}: ${e}`);
  }
}

// Auto-persist debounce
let saveTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleSave(): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(saveToDisk, 2000);
}

// ============================================================================
// Search & Ranking
// ============================================================================

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 0);
}

/**
 * Compute a cheap semantic similarity score via token overlap (Jaccard-like).
 * In production this would use LanceDB / sqlite-vss / Qdrant embeddings.
 */
function semanticSimilarity(query: string, text: string): number {
  const queryTokens = new Set(tokenize(query));
  if (queryTokens.size === 0) return 0;

  const textTokens = tokenize(text);
  if (textTokens.length === 0) return 0;

  let matches = 0;
  const seen = new Set<string>();
  for (const t of textTokens) {
    if (queryTokens.has(t) && !seen.has(t)) {
      matches++;
      seen.add(t);
    }
  }

  // Jaccard-like: intersection / union, but biased toward having at least some matches
  const union = queryTokens.size + textTokens.length - matches;
  return union === 0 ? 0 : matches / Math.min(queryTokens.size, textTokens.length);
}

/**
 * Scope boost: room/band/device scope gets priority over global/session.
 */
function scopeBoost(scope: MemoryScope): number {
  switch (scope) {
    case "room":
      return 0.15;
    case "band":
      return 0.12;
    case "device":
      return 0.10;
    case "user":
      return 0.08;
    case "session":
      return 0.05;
    case "global":
      return 0.0;
  }
}

/**
 * Recency boost: more recent memories score higher.
 * Episodic/incident memories get stronger recency weighting.
 */
function recencyBoost(createdAt: string, type: MemoryType): number {
  const ageMs = Date.now() - new Date(createdAt).getTime();
  const ageHours = ageMs / (1000 * 60 * 60);

  if (type === "episodic" || type === "operational") {
    // Episodic/operational decays faster — half-life ~48 hours
    return Math.max(0, 0.20 * Math.exp(-ageHours / 48));
  }
  // Other memories decay slower — half-life ~30 days
  return Math.max(0, 0.10 * Math.exp(-ageHours / 720));
}

/**
 * Confidence boost: higher confidence = higher score.
 */
function confidenceBoost(confidence: number): number {
  return confidence * 0.15;
}

/**
 * Stale penalty: expired or requires-review memories are penalized.
 */
function stalePenalty(record: MemoryRecord): number {
  let penalty = 0;
  if (record.expiresAt && new Date(record.expiresAt) < new Date()) {
    penalty += 0.4;
  }
  if (record.requiresReview) {
    penalty += 0.15;
  }
  if (record.source.kind === "agent_inferred") {
    penalty += 0.05;
  }
  return penalty;
}

/**
 * Rank memories by combined score.
 *
 * score = semantic_similarity
 *       + scope_boost
 *       + recency_boost
 *       + confidence_boost
 *       - stale_penalty
 */
function rankMemories(
  query: string,
  records: MemoryRecord[],
): SearchResult<MemoryRecord>[] {
  return records
    .map((record) => {
      // Search across text + structured data
      let searchText = record.text;
      if (record.structured) {
        try {
          searchText += " " + JSON.stringify(record.structured);
        } catch {
          // ignore un-stringifiable structured data
        }
      }

      const semantic = semanticSimilarity(query, searchText);
      const sBoost = scopeBoost(record.scope);
      const rBoost = recencyBoost(record.createdAt, record.type);
      const cBoost = confidenceBoost(record.confidence);
      const sPenalty = stalePenalty(record);

      const score = semantic + sBoost + rBoost + cBoost - sPenalty;

      return {
        item: record,
        score: Math.max(0, score),
        breakdown: {
          semantic,
          scopeBoost: sBoost,
          recencyBoost: rBoost,
          confidenceBoost: cBoost,
          stalePenalty: sPenalty,
        },
      };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score);
}

// ============================================================================
// Memory Write Policy
// ============================================================================

interface WritePolicyDecision {
  allowed: boolean;
  requiresConfirmation: boolean;
  exactConfirmationTemplate?: string;
  setRequiresReview: boolean;
  rejectReason?: string;
}

function evaluateWritePolicy(
  memory: Omit<MemoryRecord, "id" | "createdAt" | "updatedAt">,
): WritePolicyDecision {
  // Rule 1: Safety memory is admin-only
  if (memory.type === "safety" && !isAdmin) {
    return {
      allowed: false,
      requiresConfirmation: false,
      setRequiresReview: false,
      rejectReason:
        "Safety memory is admin-only. Set WING_MODE=maintenance or WING_MODE=developer_raw to write safety memories.",
    };
  }

  // Rule 2: AI-inferred memory must set requiresReview
  if (memory.source.kind === "agent_inferred") {
    return {
      allowed: true,
      requiresConfirmation: true,
      exactConfirmationTemplate: `AI inferred this memory: "${memory.text}". Review and confirm to store.`,
      setRequiresReview: true,
    };
  }

  // Rule 3: User preference requires explicit confirmation
  if (memory.type === "preference") {
    return {
      allowed: true,
      requiresConfirmation: true,
      exactConfirmationTemplate: `Confirm saving preference: "${memory.text}" for scope ${memory.scope}/${memory.scopeId}.`,
      setRequiresReview: false,
    };
  }

  // Rule 4: Tool-observed state can be logged automatically (no prepare needed if not safety/preference/inferred)
  if (memory.source.kind === "tool_observed") {
    return {
      allowed: true,
      requiresConfirmation: false,
      setRequiresReview: false,
    };
  }

  // Rule 5: User-confirmed or document-based memories: apply if confidence is high
  if (memory.source.kind === "user_confirmed" || memory.source.kind === "document") {
    const needsConfirm = memory.confidence < 0.7;
    return {
      allowed: true,
      requiresConfirmation: needsConfirm,
      exactConfirmationTemplate: needsConfirm
        ? `Low confidence (${(memory.confidence * 100).toFixed(0)}%). Confirm saving: "${memory.text}"?`
        : undefined,
      setRequiresReview: memory.confidence < 0.7,
    };
  }

  // Default: require confirmation
  return {
    allowed: true,
    requiresConfirmation: true,
    exactConfirmationTemplate: `Confirm writing memory: "${memory.text}"`,
    setRequiresReview: false,
  };
}

// ============================================================================
// Prepare/Apply write state
// ============================================================================

function createPendingWrite(
  tool: string,
  target: string,
  memory: Omit<MemoryRecord, "id" | "createdAt" | "updatedAt">,
  policy: WritePolicyDecision,
): PendingWrite {
  const id = nextId("pending");
  const pending: PendingWrite = {
    id,
    tool,
    target,
    memory,
    expiresAt: Date.now() + 5 * 60 * 1000, // 5 minute expiry
    createdAt: Date.now(),
    requiresExactConfirmation: policy.requiresConfirmation,
    exactConfirmationTemplate: policy.exactConfirmationTemplate,
  };
  pendingWrites.set(id, pending);
  return pending;
}

function clearExpiredPendingWrites(): void {
  const now = Date.now();
  for (const [id, pw] of pendingWrites) {
    if (pw.expiresAt < now) {
      pendingWrites.delete(id);
    }
  }
}

function applyPendingWrite(confirmationId: string): {
  record: MemoryRecord;
  pending: PendingWrite;
} {
  const pending = pendingWrites.get(confirmationId);
  if (!pending) {
    throw new Error(`Confirmation ID ${confirmationId} not found or expired`);
  }
  if (pending.expiresAt < Date.now()) {
    pendingWrites.delete(confirmationId);
    throw new Error(`Confirmation ID ${confirmationId} has expired`);
  }

  pendingWrites.delete(confirmationId);

  const id = nextId("mem");
  const now = nowISO();
  const record: MemoryRecord = {
    ...pending.memory,
    id,
    createdAt: now,
    updatedAt: now,
  };

  memories.set(id, record);

  // Also index into room topology if scope is "room"
  if (pending.memory.scope === "room") {
    const room = ensureRoom(pending.memory.scopeId);
    room.updatedAt = now;
    rooms.set(room.roomId, room);
  }

  scheduleSave();

  return { record, pending };
}

// ============================================================================
// Tool Handlers
// ============================================================================

// -- sound_memory_search -------------------------------------------------------

async function handleSoundMemorySearch(
  args: z.infer<typeof SoundMemorySearchInputSchema>,
): Promise<ToolResult<SearchResult<MemoryRecord>[]>> {
  const parsed = SoundMemorySearchInputSchema.safeParse(args);
  if (!parsed.success) {
    return {
      ok: false,
      errors: [{ code: "PARAM_NOT_FOUND", message: parsed.error.message }],
      human_summary: `参数错误：${parsed.error.message}`,
    };
  }

  const { query, types, scope, scopeId, limit, min_confidence } = parsed.data;

  // Filter candidates
  let candidates = Array.from(memories.values());

  // Skip expired memories
  candidates = candidates.filter((m) => {
    if (!m.expiresAt) return true;
    return new Date(m.expiresAt) >= new Date();
  });

  if (types && types.length > 0) {
    candidates = candidates.filter((m) => types.includes(m.type));
  }
  if (scope) {
    candidates = candidates.filter((m) => m.scope === scope);
  }
  if (scopeId) {
    candidates = candidates.filter((m) =>
      m.scopeId.toLowerCase().includes(scopeId.toLowerCase()),
    );
  }
  if (min_confidence > 0) {
    candidates = candidates.filter((m) => m.confidence >= min_confidence);
  }

  // Rank
  const ranked = rankMemories(query, candidates);
  const results = ranked.slice(0, limit);

  const summary =
    results.length === 0
      ? `未找到与 "${query}" 相关的记忆。`
      : `找到 ${results.length} 条相关记忆：${results
          .slice(0, 3)
          .map((r) => `"${r.item.text.substring(0, 60)}${r.item.text.length > 60 ? "..." : ""}" (score: ${r.score.toFixed(2)})`)
          .join("；")}${results.length > 3 ? ` ...及 ${results.length - 3} 条` : ""}`;

  return {
    ok: true,
    data: results,
    human_summary: summary,
  };
}

// -- sound_memory_get -----------------------------------------------------------

async function handleSoundMemoryGet(
  args: z.infer<typeof SoundMemoryGetInputSchema>,
): Promise<ToolResult<MemoryRecord>> {
  const parsed = SoundMemoryGetInputSchema.safeParse(args);
  if (!parsed.success) {
    return {
      ok: false,
      errors: [{ code: "PARAM_NOT_FOUND", message: parsed.error.message }],
      human_summary: `参数错误：${parsed.error.message}`,
    };
  }

  const record = memories.get(parsed.data.id);
  if (!record) {
    return {
      ok: false,
      errors: [{ code: "PARAM_NOT_FOUND", message: `Memory ${parsed.data.id} not found` }],
      human_summary: `未找到记忆 ${parsed.data.id}`,
    };
  }

  // Check expiry
  if (record.expiresAt && new Date(record.expiresAt) < new Date()) {
    return {
      ok: true,
      data: record,
      warnings: [{ code: "PARAM_EXPIRED", message: "This memory has expired" }],
      human_summary: `记忆 ${record.id} 已过期："${record.text}"`,
    };
  }

  return {
    ok: true,
    data: record,
    human_summary: `记忆 ${record.id}："${record.text}"`,
  };
}

// -- sound_memory_write_prepare ------------------------------------------------

async function handleSoundMemoryWritePrepare(
  args: z.infer<typeof MemoryWritePrepareInputSchema>,
): Promise<ToolResult<{ confirmation_id: string; requires_confirmation: boolean; exact_confirmation_text?: string }>> {
  const parsed = MemoryWritePrepareInputSchema.safeParse(args);
  if (!parsed.success) {
    return {
      ok: false,
      errors: [{ code: "PARAM_NOT_FOUND", message: parsed.error.message }],
      human_summary: `参数错误：${parsed.error.message}`,
    };
  }

  // Prevent writes in read_only mode
  if (WING_MODE === "read_only") {
    return {
      ok: false,
      errors: [
        {
          code: "POLICY_DENIED",
          message: "Cannot write memories in read_only mode. Set WING_MODE to rehearsal_safe or maintenance.",
        },
      ],
      human_summary: "只读模式下不能写入记忆。",
    };
  }

  // Prevent writes in live mode for non-safety memories
  if (liveMode && parsed.data.type !== "safety") {
    return {
      ok: false,
      errors: [
        {
          code: "LIVE_MODE_DENIED",
          message: "Memory writes are restricted in live mode.",
        },
      ],
      human_summary: "现场模式下不能写入记忆。",
    };
  }

  const memory = {
    type: parsed.data.type,
    scope: parsed.data.scope,
    scopeId: parsed.data.scopeId,
    text: parsed.data.text,
    structured: parsed.data.structured,
    source: parsed.data.source,
    confidence: parsed.data.confidence,
    expiresAt: parsed.data.expiresAt,
    requiresReview: parsed.data.source.kind === "agent_inferred",
  };

  // Evaluate policy
  const policy = evaluateWritePolicy(memory);
  if (!policy.allowed) {
    return {
      ok: false,
      errors: [{ code: "POLICY_DENIED", message: policy.rejectReason ?? "Write denied by policy" }],
      human_summary: `写入被拒绝：${policy.rejectReason ?? "策略限制"}`,
    };
  }

  // Apply requiresReview from policy
  if (policy.setRequiresReview) {
    memory.requiresReview = true;
  }

  const pending = createPendingWrite("sound_memory_write_prepare", memory.scopeId, memory, policy);

  if (policy.requiresConfirmation) {
    return {
      ok: true,
      data: {
        confirmation_id: pending.id,
        requires_confirmation: true,
        exact_confirmation_text: policy.exactConfirmationTemplate,
      },
      human_summary: `准备写入记忆。请确认：${policy.exactConfirmationTemplate}`,
    };
  }

  // For tool_observed (auto-apply), we skip confirmation and apply immediately
  // But we still return the prepare result — caller uses the confirmation_id
  return {
    ok: true,
    data: {
      confirmation_id: pending.id,
      requires_confirmation: false,
    },
    human_summary: `准备写入记忆（自动确认）："${memory.text}"`,
  };
}

// -- sound_memory_write_apply --------------------------------------------------

async function handleSoundMemoryWriteApply(
  args: z.infer<typeof MemoryWriteApplyInputSchema>,
): Promise<ToolResult<MemoryRecord>> {
  const parsed = MemoryWriteApplyInputSchema.safeParse(args);
  if (!parsed.success) {
    return {
      ok: false,
      errors: [{ code: "PARAM_NOT_FOUND", message: parsed.error.message }],
      human_summary: `参数错误：${parsed.error.message}`,
    };
  }

  const { confirmation_id, confirmed } = parsed.data;

  try {
    const pending = pendingWrites.get(confirmation_id);
    if (!pending) {
      return {
        ok: false,
        errors: [
          {
            code: "RISK_CONFIRMATION_REQUIRED",
            message: `Confirmation ID ${confirmation_id} not found or expired. Use sound_memory_write_prepare first.`,
          },
        ],
        human_summary: `确认ID ${confirmation_id} 未找到或已过期，请先调用 write_prepare。`,
      };
    }

    if (!confirmed && pending.requiresExactConfirmation) {
      pendingWrites.delete(confirmation_id);
      return {
        ok: true,
        data: undefined,
        human_summary: "写入已取消。用户未确认。",
      };
    }

    // Exact confirmation check
    if (pending.requiresExactConfirmation && pending.exactConfirmationTemplate) {
      const provided = parsed.data.exact_confirmation_text?.trim().toLowerCase() ?? "";
      const expected = pending.exactConfirmationTemplate.trim().toLowerCase();
      if (provided !== expected) {
        return {
          ok: false,
          errors: [
            {
              code: "RISK_CONFIRMATION_REQUIRED",
              message: `Exact confirmation text mismatch. Expected: "${pending.exactConfirmationTemplate.trim()}"`,
            },
          ],
          human_summary: `确认文本不匹配。需要原文确认："${pending.exactConfirmationTemplate.trim()}"`,
        };
      }
    }

    const { record } = applyPendingWrite(confirmation_id);

    return {
      ok: true,
      data: record,
      audit_id: `aud_${record.id}`,
      human_summary: `记忆已保存：${record.id} — "${record.text}" (${record.type}, ${record.scope}/${record.scopeId})`,
    };
  } catch (e: any) {
    return {
      ok: false,
      errors: [{ code: "PROTOCOL_ERROR", message: e.message }],
      human_summary: `写入失败：${e.message}`,
    };
  }
}

// -- sound_room_get_topology ---------------------------------------------------

async function handleSoundRoomGetTopology(
  args: z.infer<typeof SoundRoomGetTopologyInputSchema>,
): Promise<ToolResult<RoomTopology>> {
  const parsed = SoundRoomGetTopologyInputSchema.safeParse(args);
  if (!parsed.success) {
    return {
      ok: false,
      errors: [{ code: "PARAM_NOT_FOUND", message: parsed.error.message }],
      human_summary: `参数错误：${parsed.error.message}`,
    };
  }

  const room = ensureRoom(parsed.data.room_id);

  // Merge incidents from the global incidents map that belong to this room
  const roomIncidents: IncidentRecord[] = [];
  for (const inc of incidents.values()) {
    if (inc.roomId === room.roomId) {
      roomIncidents.push(inc);
    }
  }
  room.incidents = roomIncidents;

  return {
    ok: true,
    data: room,
    human_summary: `房间 ${room.name}：${room.device.model} @ ${room.device.ip}, ${room.patchSheet.channels.length} 通道, ${room.patchSheet.buses.length} 总线, ${room.bandPreferences.length} 偏好设置, ${room.incidents.length} 事件记录`,
  };
}

// -- sound_room_get_patch_sheet ------------------------------------------------

async function handleSoundRoomGetPatchSheet(
  args: z.infer<typeof SoundRoomGetPatchSheetInputSchema>,
): Promise<ToolResult<PatchSheet>> {
  const parsed = SoundRoomGetPatchSheetInputSchema.safeParse(args);
  if (!parsed.success) {
    return {
      ok: false,
      errors: [{ code: "PARAM_NOT_FOUND", message: parsed.error.message }],
      human_summary: `参数错误：${parsed.error.message}`,
    };
  }

  const room = ensureRoom(parsed.data.room_id);

  return {
    ok: true,
    data: room.patchSheet,
    human_summary: `${room.name} patch sheet: ${room.patchSheet.channels.length} channels, ${room.patchSheet.buses.length} buses`,
  };
}

// -- sound_room_update_patch_prepare -------------------------------------------

async function handleSoundRoomUpdatePatchPrepare(
  args: z.infer<typeof RoomPatchPrepareInputSchema>,
): Promise<ToolResult<{ confirmation_id: string; summary: { added_channels: number; removed_channels: number; added_buses: number; removed_buses: number } }>> {
  const parsed = RoomPatchPrepareInputSchema.safeParse(args);
  if (!parsed.success) {
    return {
      ok: false,
      errors: [{ code: "PARAM_NOT_FOUND", message: parsed.error.message }],
      human_summary: `参数错误：${parsed.error.message}`,
    };
  }

  if (WING_MODE === "read_only") {
    return {
      ok: false,
      errors: [{ code: "POLICY_DENIED", message: "Cannot update patch sheet in read_only mode" }],
      human_summary: "只读模式下不能更新 patch sheet。",
    };
  }

  const room = ensureRoom(parsed.data.room_id);
  const oldChCount = room.patchSheet.channels.length;
  const oldBusCount = room.patchSheet.buses.length;
  const newPatch = parsed.data.patch;

  const summary = {
    added_channels: Math.max(0, newPatch.channels.length - oldChCount),
    removed_channels: Math.max(0, oldChCount - newPatch.channels.length),
    added_buses: Math.max(0, newPatch.buses.length - oldBusCount),
    removed_buses: Math.max(0, oldBusCount - newPatch.buses.length),
  };

  // Create a pending write for this patch update (reuse the memory write system)
  const memory: Omit<MemoryRecord, "id" | "createdAt" | "updatedAt"> = {
    type: "semantic",
    scope: "room",
    scopeId: parsed.data.room_id,
    text: `Patch sheet updated for ${room.name}: ${newPatch.channels.length} channels, ${newPatch.buses.length} buses`,
    structured: { patch: newPatch },
    source: { kind: "user_confirmed" },
    confidence: 0.9,
  };

  const policy = evaluateWritePolicy(memory);
  const pending = createPendingWrite("sound_room_update_patch_prepare", parsed.data.room_id, memory, policy);

  return {
    ok: true,
    data: {
      confirmation_id: pending.id,
      summary,
    },
    human_summary: `准备更新 ${room.name} patch sheet。变更：通道 ${oldChCount}->${newPatch.channels.length}，总线 ${oldBusCount}->${newPatch.buses.length}。确认ID: ${pending.id}`,
  };
}

// -- sound_room_update_patch_apply ---------------------------------------------

async function handleSoundRoomUpdatePatchApply(
  args: z.infer<typeof RoomPatchApplyInputSchema>,
): Promise<ToolResult<PatchSheet>> {
  const parsed = RoomPatchApplyInputSchema.safeParse(args);
  if (!parsed.success) {
    return {
      ok: false,
      errors: [{ code: "PARAM_NOT_FOUND", message: parsed.error.message }],
      human_summary: `参数错误：${parsed.error.message}`,
    };
  }

  const { confirmation_id, confirmed } = parsed.data;

  try {
    const pending = pendingWrites.get(confirmation_id);
    if (!pending) {
      return {
        ok: false,
        errors: [
          {
            code: "RISK_CONFIRMATION_REQUIRED",
            message: `Confirmation ID ${confirmation_id} not found or expired.`,
          },
        ],
        human_summary: `确认ID ${confirmation_id} 未找到或已过期。`,
      };
    }

    if (!confirmed) {
      pendingWrites.delete(confirmation_id);
      return {
        ok: true,
        data: undefined,
        human_summary: "Patch sheet 更新已取消。",
      };
    }

    // Read the structured patch from the pending write
    const newPatch = pending.memory.structured?.patch as PatchSheet | undefined;
    if (!newPatch) {
      pendingWrites.delete(confirmation_id);
      return {
        ok: false,
        errors: [{ code: "PROTOCOL_ERROR", message: "No patch data in pending write" }],
        human_summary: "pending write 中没有 patch 数据。",
      };
    }

    const roomId = pending.memory.scopeId;
    const room = ensureRoom(roomId);
    room.patchSheet = { ...newPatch, roomId };
    room.updatedAt = nowISO();
    rooms.set(roomId, room);

    // Apply the memory write as well
    const { record } = applyPendingWrite(confirmation_id);

    return {
      ok: true,
      data: room.patchSheet,
      audit_id: `aud_${record.id}`,
      human_summary: `已更新 ${room.name} patch sheet：${newPatch.channels.length} 通道, ${newPatch.buses.length} 总线。`,
    };
  } catch (e: any) {
    return {
      ok: false,
      errors: [{ code: "PROTOCOL_ERROR", message: e.message }],
      human_summary: `更新 patch sheet 失败：${e.message}`,
    };
  }
}

// -- sound_incident_log --------------------------------------------------------

async function handleSoundIncidentLog(
  args: z.infer<typeof SoundIncidentLogInputSchema>,
): Promise<ToolResult<IncidentRecord>> {
  const parsed = SoundIncidentLogInputSchema.safeParse(args);
  if (!parsed.success) {
    return {
      ok: false,
      errors: [{ code: "PARAM_NOT_FOUND", message: parsed.error.message }],
      human_summary: `参数错误：${parsed.error.message}`,
    };
  }

  const room = ensureRoom(parsed.data.room_id);

  const record: IncidentRecord = {
    id: nextId("inc"),
    timestamp: nowISO(),
    roomId: parsed.data.room_id,
    type: parsed.data.type,
    target: parsed.data.target,
    description: parsed.data.description,
    resolution: parsed.data.resolution,
    auditId: parsed.data.audit_id,
  };

  incidents.set(record.id, record);
  room.incidents.push(record);
  room.updatedAt = nowISO();
  rooms.set(room.roomId, room);

  // Also create an episodic memory for the incident
  const memRecord: MemoryRecord = {
    id: nextId("mem"),
    type: "episodic",
    scope: "room",
    scopeId: parsed.data.room_id,
    text: `${parsed.data.type}: ${parsed.data.target} — ${parsed.data.description}`,
    structured: {
      incidentId: record.id,
      incidentType: record.type,
      target: record.target,
      resolution: record.resolution,
    },
    source: { kind: "tool_observed" },
    confidence: 0.9,
    createdAt: nowISO(),
    updatedAt: nowISO(),
  };
  memories.set(memRecord.id, memRecord);

  scheduleSave();

  return {
    ok: true,
    data: record,
    human_summary: `事件已记录：${record.id} — ${parsed.data.type}: ${parsed.data.target} "${parsed.data.description}" (${room.name})`,
  };
}

// -- sound_incident_summarize --------------------------------------------------

async function handleSoundIncidentSummarize(
  args: z.infer<typeof SoundIncidentSummarizeInputSchema>,
): Promise<ToolResult<{
  roomId: string;
  total: number;
  since?: string;
  byType: Record<string, number>;
  byTarget: Record<string, number>;
  latest: IncidentRecord[];
  recurringTargets: Array<{ target: string; count: number; lastIncident: string }>;
}>> {
  const parsed = SoundIncidentSummarizeInputSchema.safeParse(args);
  if (!parsed.success) {
    return {
      ok: false,
      errors: [{ code: "PARAM_NOT_FOUND", message: parsed.error.message }],
      human_summary: `参数错误：${parsed.error.message}`,
    };
  }

  const { room_id, since, limit } = parsed.data;
  const sinceDate = since ? new Date(since) : new Date(0);

  // Collect incidents for the room
  let roomIncidents: IncidentRecord[] = [];
  for (const inc of incidents.values()) {
    if (inc.roomId !== room_id) continue;
    if (new Date(inc.timestamp) < sinceDate) continue;
    roomIncidents.push(inc);
  }

  // Also check incidents inline in room topology
  const room = rooms.get(room_id);
  if (room) {
    for (const inc of room.incidents) {
      if (new Date(inc.timestamp) < sinceDate) continue;
      if (!roomIncidents.find((r) => r.id === inc.id)) {
        roomIncidents.push(inc);
      }
    }
  }

  // Sort by timestamp descending
  roomIncidents.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  const total = roomIncidents.length;
  const cut = roomIncidents.slice(0, limit);

  // Aggregate by type
  const byType: Record<string, number> = {};
  for (const inc of roomIncidents) {
    byType[inc.type] = (byType[inc.type] ?? 0) + 1;
  }

  // Aggregate by target
  const byTarget: Record<string, number> = {};
  for (const inc of roomIncidents) {
    byTarget[inc.target] = (byTarget[inc.target] ?? 0) + 1;
  }

  // Find recurring targets (more than 1 incident)
  const recurringTargets = Object.entries(byTarget)
    .filter(([, count]) => count > 1)
    .map(([target, count]) => {
      const last = roomIncidents
        .filter((i) => i.target === target)
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];
      return {
        target,
        count,
        lastIncident: last?.timestamp ?? "",
      };
    })
    .sort((a, b) => b.count - a.count);

  const summaryText =
    total === 0
      ? `房间 ${room_id} 没有事件记录${since ? ` (自 ${since})` : ""}。`
      : `${room_id} 共 ${total} 条事件${since ? ` (自 ${since})` : ""}。类型：${Object.entries(byType)
          .map(([t, c]) => `${t} (${c})`)
          .join(", ")}。${recurringTargets.length > 0
            ? `重复目标：${recurringTargets
                .slice(0, 3)
                .map((r) => `${r.target} (${r.count}次)`)
                .join(", ")}。`
            : ""}`;

  return {
    ok: true,
    data: {
      roomId: room_id,
      total,
      since: since ?? undefined,
      byType,
      byTarget,
      latest: cut,
      recurringTargets,
    },
    human_summary: summaryText,
  };
}

// ============================================================================
// Tool Registry
// ============================================================================

const allTools: Record<
  string,
  {
    description: string;
    inputSchema: Record<string, unknown>;
    handler: (args: unknown, context?: Record<string, unknown>) => Promise<ToolResult>;
  }
> = {
  sound_memory_search: {
    description:
      "Search room knowledge, incidents, and preferences by query. Use this to find relevant memories, past incidents, band preferences, and room configuration. Returns ranked results with semantic similarity, scope boost, recency boost, and confidence scoring. Risk: none. Read-only.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query string" },
        types: {
          type: "array",
          items: {
            type: "string",
            enum: ["semantic", "episodic", "procedural", "preference", "safety", "operational"],
          },
          description: "Filter by memory types",
        },
        scope: {
          type: "string",
          enum: ["global", "room", "band", "user", "device", "session"],
          description: "Filter by scope",
        },
        scopeId: { type: "string", description: "Filter by scope ID (e.g. roomId)" },
        limit: {
          type: "number",
          description: "Max results to return (default 20, max 100)",
          default: 20,
        },
        min_confidence: {
          type: "number",
          description: "Minimum confidence threshold 0-1 (default 0)",
          default: 0,
        },
      },
      required: ["query"],
    },
    handler: (args: unknown) => handleSoundMemorySearch(args as z.infer<typeof SoundMemorySearchInputSchema>),
  },

  sound_memory_get: {
    description:
      "Get a specific memory record by its ID. Use this to retrieve full details of a memory record found via sound_memory_search. Risk: none. Read-only.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Memory record ID" },
      },
      required: ["id"],
    },
    handler: (args: unknown) => handleSoundMemoryGet(args as z.infer<typeof SoundMemoryGetInputSchema>),
  },

  sound_memory_write_prepare: {
    description:
      "Prepare to write a new memory record. This is the first step of the prepare/apply pattern. Use this before sound_memory_write_apply. Memory write rules: tool_observed state is logged automatically; user preferences require confirmation; AI-inferred memories set requiresReview=true; safety memories are admin-only. Risk: depends on memory type (safety=high, preference=low, operational=low). Write behavior: prepare/apply/audit.",
    inputSchema: {
      type: "object",
      properties: {
        type: {
          type: "string",
          enum: ["semantic", "episodic", "procedural", "preference", "safety", "operational"],
          description: "Memory type",
        },
        scope: {
          type: "string",
          enum: ["global", "room", "band", "user", "device", "session"],
          description: "Memory scope",
        },
        scopeId: { type: "string", description: "Scope identifier (e.g. room name, band name)" },
        text: { type: "string", description: "Human-readable memory content" },
        structured: {
          type: "object",
          description: "Optional structured data associated with this memory",
        },
        source: {
          type: "object",
          properties: {
            kind: {
              type: "string",
              enum: ["user_confirmed", "tool_observed", "document", "agent_inferred"],
              description: "Source of this memory",
            },
            ref: { type: "string", description: "Optional reference (e.g. URL, document path)" },
          },
          required: ["kind"],
          description: "Source of this memory",
        },
        confidence: {
          type: "number",
          description: "Confidence 0-1 (default 0.8)",
          default: 0.8,
        },
        expiresAt: {
          type: "string",
          description: "Optional ISO expiration timestamp",
        },
      },
      required: ["type", "scope", "scopeId", "text", "source"],
    },
    handler: (args: unknown) =>
      handleSoundMemoryWritePrepare(args as z.infer<typeof MemoryWritePrepareInputSchema>),
  },

  sound_memory_write_apply: {
    description:
      "Apply a pending memory write using the confirmation_id from sound_memory_write_prepare. For auto-applied writes (tool_observed), confirmation is not required. For user preferences or safety writes, exact confirmation text must match. Risk: depends on memory type. Write behavior: apply/readback/audit.",
    inputSchema: {
      type: "object",
      properties: {
        confirmation_id: {
          type: "string",
          description: "Confirmation ID from sound_memory_write_prepare",
        },
        confirmed: {
          type: "boolean",
          description: "Whether the user confirmed the write. Set to false to cancel.",
        },
        exact_confirmation_text: {
          type: "string",
          description: "Exact confirmation text if required by the prepare step",
        },
      },
      required: ["confirmation_id", "confirmed"],
    },
    handler: (args: unknown) =>
      handleSoundMemoryWriteApply(args as z.infer<typeof MemoryWriteApplyInputSchema>),
  },

  sound_room_get_topology: {
    description:
      "Get the full room topology including device info, patch sheet, band preferences, and incident history. Use this when you need a complete picture of a room's setup. Risk: none. Read-only.",
    inputSchema: {
      type: "object",
      properties: {
        room_id: { type: "string", description: "Room identifier" },
      },
      required: ["room_id"],
    },
    handler: (args: unknown) =>
      handleSoundRoomGetTopology(args as z.infer<typeof SoundRoomGetTopologyInputSchema>),
  },

  sound_room_get_patch_sheet: {
    description:
      "Get the patch sheet for a specific room. Returns channel assignments (ch, name, source, phantom, notes) and bus assignments (bus, name, destination, notes). Use this before modifying any routing or checking phantom power status. Risk: none. Read-only.",
    inputSchema: {
      type: "object",
      properties: {
        room_id: { type: "string", description: "Room identifier" },
      },
      required: ["room_id"],
    },
    handler: (args: unknown) =>
      handleSoundRoomGetPatchSheet(args as z.infer<typeof SoundRoomGetPatchSheetInputSchema>),
  },

  sound_room_update_patch_prepare: {
    description:
      "Prepare a patch sheet update for a room. This is the first step of the prepare/apply pattern. Returns a confirmation_id that must be used with sound_room_update_patch_apply. The updated patch includes channels and buses arrays. Do not silently update room patch sheet from a single ambiguous user statement. Risk: medium. Write behavior: prepare/apply/audit.",
    inputSchema: {
      type: "object",
      properties: {
        room_id: { type: "string", description: "Room identifier" },
        patch: {
          type: "object",
          properties: {
            channels: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  ch: { type: "number", description: "Channel number" },
                  name: { type: "string", description: "Channel name" },
                  source: { type: "string", description: "Source description (e.g. 'XLR 1', 'Stage Box A Ch5')" },
                  phantom: { type: "boolean", description: "Phantom power (48V) status" },
                  notes: { type: "string", description: "Optional notes" },
                },
                required: ["ch", "name", "source", "phantom"],
              },
              description: "Channel patch assignments",
            },
            buses: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  bus: { type: "number", description: "Bus number" },
                  name: { type: "string", description: "Bus name" },
                  destination: { type: "string", description: "Destination description" },
                  notes: { type: "string", description: "Optional notes" },
                },
                required: ["bus", "name", "destination"],
              },
              description: "Bus patch assignments",
            },
          },
          required: ["channels", "buses"],
          description: "Updated patch sheet",
        },
      },
      required: ["room_id", "patch"],
    },
    handler: (args: unknown) =>
      handleSoundRoomUpdatePatchPrepare(args as z.infer<typeof RoomPatchPrepareInputSchema>),
  },

  sound_room_update_patch_apply: {
    description:
      "Apply a pending patch sheet update using the confirmation_id from sound_room_update_patch_prepare. The patch sheet is read back and stored. Risk: medium. Write behavior: apply/readback/audit.",
    inputSchema: {
      type: "object",
      properties: {
        confirmation_id: {
          type: "string",
          description: "Confirmation ID from sound_room_update_patch_prepare",
        },
        confirmed: {
          type: "boolean",
          description: "Whether the user confirmed the update. Set to false to cancel.",
        },
        exact_confirmation_text: {
          type: "string",
          description: "Exact confirmation text if required",
        },
      },
      required: ["confirmation_id", "confirmed"],
    },
    handler: (args: unknown) =>
      handleSoundRoomUpdatePatchApply(args as z.infer<typeof RoomPatchApplyInputSchema>),
  },

  sound_incident_log: {
    description:
      "Log a new incident for a room. Records the incident type, affected target, description, and resolution. Automatically creates an episodic memory record. Use this to document no-sound events, feedback issues, routing problems, hardware failures, or other incidents. Risk: none. Write behavior: auto-apply/audit.",
    inputSchema: {
      type: "object",
      properties: {
        room_id: { type: "string", description: "Room identifier" },
        type: {
          type: "string",
          enum: ["no_sound", "feedback", "routing", "hardware", "other"],
          description: "Incident type",
        },
        target: { type: "string", description: "Affected target (e.g. channel name, bus name)" },
        description: { type: "string", description: "What happened" },
        resolution: {
          type: "string",
          description: "How it was or will be resolved",
          default: "pending",
        },
        audit_id: { type: "string", description: "Related audit record ID" },
      },
      required: ["room_id", "type", "target", "description"],
    },
    handler: (args: unknown) =>
      handleSoundIncidentLog(args as z.infer<typeof SoundIncidentLogInputSchema>),
  },

  sound_incident_summarize: {
    description:
      "Summarize incidents for a room. Returns total count, breakdown by type and target, recurring targets, and the latest incidents. Use this to identify patterns, frequently failing equipment, or recurring issues. Risk: none. Read-only.",
    inputSchema: {
      type: "object",
      properties: {
        room_id: { type: "string", description: "Room identifier" },
        since: {
          type: "string",
          description: "ISO timestamp to filter incidents from (e.g. '2026-01-01T00:00:00Z')",
        },
        limit: {
          type: "number",
          description: "Max incidents to include in detailed list (default 50)",
          default: 50,
        },
      },
      required: ["room_id"],
    },
    handler: (args: unknown) =>
      handleSoundIncidentSummarize(args as z.infer<typeof SoundIncidentSummarizeInputSchema>),
  },
};

// ============================================================================
// MCP Server Setup
// ============================================================================

const server = new Server(
  {
    name: "sound-memory-mcp",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
      resources: {},
      prompts: {},
    },
  },
);

// Tool context
const toolContext = {
  mode: WING_MODE,
  sessionId: SESSION_ID,
  isAdmin,
  liveMode,
};

// -- List tools ----------------------------------------------------------------

server.setRequestHandler(ListToolsRequestSchema, async () => {
  const toolList = Object.entries(allTools).map(([name, tool]) => ({
    name,
    description: tool.description,
    inputSchema: tool.inputSchema,
  }));

  return { tools: toolList };
});

// -- Call tool ----------------------------------------------------------------

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const toolName = request.params.name;
  const toolArgs = request.params.arguments ?? {};

  const tool = allTools[toolName];
  if (!tool) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            ok: false,
            errors: [
              {
                code: "PARAM_NOT_FOUND",
                message: `Tool ${toolName} not found.`,
              },
            ],
            human_summary: `Tool ${toolName} not found.`,
          }),
        },
      ],
      isError: true,
    };
  }

  try {
    const result: ToolResult = await tool.handler(toolArgs, toolContext);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result),
        },
      ],
      isError: !result.ok,
    };
  } catch (e: any) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            ok: false,
            errors: [{ code: "PROTOCOL_ERROR", message: e.message }],
            human_summary: `Tool execution error: ${e.message}`,
          }),
        },
      ],
      isError: true,
    };
  }
});

// -- Resources ----------------------------------------------------------------

server.setRequestHandler(ListResourcesRequestSchema, async () => ({
  resources: [
    {
      uri: "memory://search",
      name: "Memory Search",
      description: "Search across all memory records",
      mimeType: "application/json",
    },
    {
      uri: "room://current/topology",
      name: "Room Topology",
      description: "Current room topology with device, patch, preferences, and incidents",
      mimeType: "application/json",
    },
    {
      uri: "memory://recent-incidents",
      name: "Recent Incidents",
      description: "Recent incident records across all rooms",
      mimeType: "application/json",
    },
  ],
}));

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const uri = request.params.uri;

  switch (uri) {
    case "memory://search": {
      const all = Array.from(memories.values());
      return {
        contents: [
          {
            uri,
            mimeType: "application/json",
            text: JSON.stringify({ total: all.length, memories: all.slice(0, 50) }),
          },
        ],
      };
    }
    case "room://current/topology": {
      const allRooms = Array.from(rooms.values());
      return {
        contents: [
          {
            uri,
            mimeType: "application/json",
            text: JSON.stringify({ rooms: allRooms }),
          },
        ],
      };
    }
    case "memory://recent-incidents": {
      const allIncidents = Array.from(incidents.values())
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, 20);
      return {
        contents: [
          {
            uri,
            mimeType: "application/json",
            text: JSON.stringify({ incidents: allIncidents }),
          },
        ],
      };
    }
    default:
      throw new Error(`Resource ${uri} not found`);
  }
});

// -- Prompts ------------------------------------------------------------------

server.setRequestHandler(ListPromptsRequestSchema, async () => ({
  prompts: [
    {
      name: "incident_report",
      description: "Generate an incident report for a room",
      arguments: [
        { name: "room_id", description: "Room identifier", required: true },
        { name: "since", description: "ISO timestamp to filter from", required: false },
      ],
    },
    {
      name: "room_setup_recall",
      description: "Recall the full setup for a room",
      arguments: [
        { name: "room_id", description: "Room identifier", required: true },
      ],
    },
  ],
}));

server.setRequestHandler(GetPromptRequestSchema, async (request) => {
  const name = request.params.name;
  const args = request.params.arguments ?? {};

  switch (name) {
    case "incident_report": {
      const roomId = (args.room_id as string) ?? "unknown";
      const since = (args.since as string) ?? "";
      const sinceClause = since ? ` since ${since}` : "";
      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `Generate an incident report for room "${roomId}"${sinceClause}. Use sound_incident_summarize to get incident data, then analyze patterns, recurring targets, and resolution effectiveness. Highlight any equipment that has failed multiple times. Suggest preventive measures.`,
            },
          },
        ],
      };
    }
    case "room_setup_recall": {
      const roomId = (args.room_id as string) ?? "unknown";
      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `Recall the full setup for room "${roomId}". Use sound_room_get_topology to get the complete room configuration. Report: device model and firmware, patch sheet summary (channel count, any phantom-powered channels, bus routing), band/performer preferences, and recent incident history. Note any stale or review-required memories.`,
            },
          },
        ],
      };
    }
    default:
      throw new Error(`Prompt ${name} not found`);
  }
});

// ============================================================================
// Cleanup & Start
// ============================================================================

// Clear expired pending writes every 2 minutes
setInterval(() => {
  clearExpiredPendingWrites();
}, 120000);

async function main(): Promise<void> {
  // Load persisted data
  loadFromDisk();

  // Log startup info to stderr (not stdout — stdout is the MCP protocol channel)
  console.error(
    `[sound-memory-mcp] Starting server — mode: ${WING_MODE}, admin: ${isAdmin}, memory path: ${WING_MEMORY_PATH}, session: ${SESSION_ID}`,
  );
  console.error(`[sound-memory-mcp] Loaded ${memories.size} memories, ${rooms.size} rooms, ${incidents.size} incidents`);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error("[sound-memory-mcp] Ready");
}

main().catch((err) => {
  console.error("[sound-memory-mcp] Fatal error:", err);
  process.exit(1);
});

/**
 * Sound Memory MCP - 房间知识库、Patch Sheet、事件记忆
 *
 * Stores and retrieves:
 * - Room topology (devices, patch, routing)
 * - Patch sheets (channel assignments, names)
 * - Band/performer preferences
 * - Incident history
 */

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
  category: string; // "monitor_mix", "eq", "fx", "general"
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

// In-memory storage (replace with SQLite + vector store in production)
const rooms: Map<string, RoomTopology> = new Map();

export function getOrCreateRoom(roomId: string): RoomTopology {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, {
      roomId,
      name: roomId,
      device: { model: "WING", ip: "unknown" },
      patchSheet: { roomId, channels: [], buses: [] },
      bandPreferences: [],
      incidents: [],
      updatedAt: new Date().toISOString(),
    });
  }
  return rooms.get(roomId)!;
}

export function searchMemory(query: string): {
  rooms: RoomTopology[];
  incidents: IncidentRecord[];
  preferences: BandPreference[];
} {
  const q = query.toLowerCase();
  const results = {
    rooms: [] as RoomTopology[],
    incidents: [] as IncidentRecord[],
    preferences: [] as BandPreference[],
  };

  for (const room of rooms.values()) {
    if (room.name.toLowerCase().includes(q) || room.device.model.toLowerCase().includes(q)) {
      results.rooms.push(room);
    }
    for (const incident of room.incidents) {
      if (incident.description.toLowerCase().includes(q) || incident.target.toLowerCase().includes(q)) {
        results.incidents.push(incident);
      }
    }
    for (const pref of room.bandPreferences) {
      if (pref.performer.toLowerCase().includes(q) || pref.value.toLowerCase().includes(q)) {
        results.preferences.push(pref);
      }
    }
  }

  return results;
}

export function addIncident(roomId: string, incident: Omit<IncidentRecord, "id" | "timestamp">): IncidentRecord {
  const room = getOrCreateRoom(roomId);
  const record: IncidentRecord = {
    ...incident,
    id: `inc_${Date.now()}`,
    timestamp: new Date().toISOString(),
  };
  room.incidents.push(record);
  room.updatedAt = new Date().toISOString();
  return record;
}

export function updatePatchSheet(roomId: string, patch: PatchSheet): void {
  const room = getOrCreateRoom(roomId);
  room.patchSheet = { ...patch, roomId };
  room.updatedAt = new Date().toISOString();
}

export function addPreference(roomId: string, pref: Omit<BandPreference, "id">): BandPreference {
  const room = getOrCreateRoom(roomId);
  const record: BandPreference = {
    ...pref,
    id: `pref_${Date.now()}`,
  };
  room.bandPreferences.push(record);
  room.updatedAt = new Date().toISOString();
  return record;
}

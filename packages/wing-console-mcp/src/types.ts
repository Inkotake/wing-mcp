import { z } from "zod";

export type DriverKind = "native" | "osc" | "fake";
export type Risk = "none" | "low" | "medium" | "high" | "critical";
export type Mode = "read_only" | "rehearsal_safe" | "maintenance" | "developer_raw";

export const VALID_MODES: Mode[] = ["read_only", "rehearsal_safe", "maintenance", "developer_raw"];

export function validateMode(s: string): Mode {
  if (VALID_MODES.includes(s as Mode)) return s as Mode;
  throw new Error(`Invalid WING_MODE: "${s}". Must be one of: ${VALID_MODES.join(", ")}`);
}

export type ErrorCode =
  | "DEVICE_NOT_FOUND"
  | "DEVICE_DISCONNECTED"
  | "PARAM_NOT_FOUND"
  | "PARAM_READ_ONLY"
  | "PARAM_EXPIRED"
  | "VALUE_OUT_OF_RANGE"
  | "RISK_CONFIRMATION_REQUIRED"
  | "POLICY_DENIED"
  | "MATERIAL_STATE_CHANGED"
  | "READBACK_MISMATCH"
  | "DRIVER_TIMEOUT"
  | "PROTOCOL_ERROR"
  | "RAW_DISABLED"
  | "LIVE_MODE_DENIED";

export interface WingDevice {
  id: string;
  ip: string;
  name?: string;
  model?: string;
  serial?: string;
  firmware?: string;
}

export type WingValue =
  | { type: "bool"; value: boolean }
  | { type: "int"; value: number }
  | { type: "float"; value: number; unit?: string }
  | { type: "string"; value: string }
  | { type: "node"; value: Record<string, unknown> };

export interface MeterFrame {
  timestamp: string;
  meters: Array<{ target: string; rmsDbfs: number; peakDbfs: number; present: boolean }>;
}

export interface ChangeRequest {
  tool: string;
  target: string;
  oldValue: unknown;
  requestedValue: unknown;
  risk: Risk;
  reason: string;
}

export interface PolicyDecision {
  allowed: boolean;
  requiresConfirmation: boolean;
  exactConfirmationTemplate?: string;
  reasons: string[];
}

export interface AuditRecord {
  id: string;
  timestamp: string;
  session_id: string;
  operator_id?: string;
  mode: Mode;
  risk: Risk;
  tool: string;
  target: string;
  reason: string;
  old_value: unknown;
  requested_value: unknown;
  readback_value: unknown;
  confirmation_text?: string;
  result: "success" | "denied" | "failed" | "readback_mismatch";
  driver: DriverKind;
}

export interface ToolResult<T = unknown> {
  ok: boolean;
  data?: T;
  warnings?: Warning[];
  errors?: ToolError[];
  audit_id?: string;
  next_actions?: SuggestedAction[];
  human_summary: string;
}

export interface Warning {
  code: ErrorCode;
  message: string;
}

export interface ToolError {
  code: ErrorCode;
  message: string;
  details?: unknown;
}

export interface SuggestedAction {
  tool: string;
  description: string;
  args?: Record<string, unknown>;
}

export interface ConfirmationTicket {
  id: string;
  tool: string;
  target: string;
  risk: Risk;
  oldValue: unknown;
  requestedValue: unknown;
  reason: string;
  exactConfirmationText: string;
  expiresAt: number;
  createdAt: number;
}

// Risk classification map
export const RISK_MAP: Record<string, Risk> = {
  wing_discover: "none",
  wing_connect: "none",
  wing_get_status: "none",
  wing_schema_search: "none",
  wing_param_resolve: "none",
  wing_param_get: "none",
  wing_param_set_prepare: "medium",
  wing_param_set_apply: "medium",
  wing_channel_list: "none",
  wing_channel_get: "none",
  wing_channel_adjust_fader_prepare: "medium",
  wing_channel_adjust_fader_apply: "medium",
  wing_channel_set_mute_prepare: "medium",
  wing_channel_set_mute_apply: "medium",
  wing_send_get: "none",
  wing_send_adjust_prepare: "medium",
  wing_send_adjust_apply: "medium",
  wing_routing_trace: "none",
  wing_routing_get: "none",
  wing_routing_set_prepare: "critical",
  wing_routing_set_apply: "critical",
  wing_headamp_get: "none",
  wing_headamp_set_prepare: "high",
  wing_headamp_set_apply: "high",
  wing_phantom_set_prepare: "critical",
  wing_phantom_set_apply: "critical",
  wing_scene_list: "none",
  wing_scene_recall_prepare: "critical",
  wing_scene_recall_apply: "critical",
  wing_snapshot_save_prepare: "medium",
  wing_snapshot_save_apply: "medium",
  wing_meter_catalog: "none",
  wing_meter_read: "none",
  wing_signal_check: "none",
  sound_diagnosis_start: "none",
  sound_diagnosis_next_step: "none",
  sound_diagnosis_prepare_fix: "medium",
  sound_diagnosis_apply_fix: "medium",
  // View tools
  wing_quick_check: "none",
  wing_state_summary: "none",
  wing_state_snapshot: "none",
  wing_channel_strip: "none",
  wing_signal_path_trace: "none",
  // Processing tools
  wing_eq_get: "none",
  wing_eq_set_band_prepare: "medium",
  wing_eq_set_band_apply: "medium",
  wing_gate_get: "none",
  wing_gate_set_prepare: "high",
  wing_gate_set_apply: "high",
  wing_comp_get: "none",
  wing_comp_set_prepare: "medium",
  wing_comp_set_apply: "medium",
  wing_fx_slot_list: "none",
  wing_fx_slot_get: "none",
  wing_fx_slot_set_model_prepare: "high",
  wing_fx_slot_set_model_apply: "high",
  // Group tools
  wing_dca_list: "none",
  wing_dca_get: "none",
  wing_dca_set_mute_prepare: "high",
  wing_dca_set_mute_apply: "high",
  wing_dca_adjust_fader_prepare: "high",
  wing_dca_adjust_fader_apply: "high",
  wing_mute_group_list: "none",
  wing_mute_group_set_prepare: "high",
  wing_mute_group_set_apply: "high",
  wing_main_get: "none",
  wing_main_adjust_fader_prepare: "high",
  wing_main_adjust_fader_apply: "high",
  wing_main_set_mute_prepare: "high",
  wing_main_set_mute_apply: "high",
  wing_matrix_list: "none",
  wing_matrix_set_mute_prepare: "high",
  wing_matrix_set_mute_apply: "high",
  wing_matrix_adjust_fader_prepare: "high",
  wing_matrix_adjust_fader_apply: "high",
  // Bulk tools
  wing_param_bulk_get: "none",
  wing_debug_dump_state: "none",
  wing_usb_recorder_get: "none",
  wing_usb_recorder_record_prepare: "high",
  wing_usb_recorder_record_apply: "high",
  wing_usb_recorder_stop_prepare: "high",
  wing_usb_recorder_stop_apply: "high",
  // Emergency tools
  wing_emergency_stop: "critical",
  wing_emergency_stop_apply: "critical",
  wing_emergency_status: "none",
  wing_emergency_reset: "high",
  wing_emergency_reset_apply: "high",
  // Raw tools
  wing_raw_osc_prepare: "critical",
  wing_raw_osc_apply: "critical",
  wing_raw_native_prepare: "critical",
  wing_raw_native_apply: "critical",
};

// Zod schemas
export const WingDeviceSchema = z.object({
  id: z.string(),
  ip: z.string(),
  name: z.string().optional(),
  model: z.string().optional(),
  serial: z.string().optional(),
  firmware: z.string().optional(),
});

export const AuditRecordSchema = z.object({
  id: z.string(),
  timestamp: z.string(),
  session_id: z.string(),
  operator_id: z.string().optional(),
  mode: z.enum(["read_only", "rehearsal_safe", "maintenance", "developer_raw"]),
  risk: z.enum(["none", "low", "medium", "high", "critical"]),
  tool: z.string(),
  target: z.string(),
  reason: z.string(),
  old_value: z.unknown(),
  requested_value: z.unknown(),
  readback_value: z.unknown(),
  confirmation_text: z.string().optional(),
  result: z.enum(["success", "denied", "failed", "readback_mismatch"]),
  driver: z.enum(["native", "osc", "fake"]),
});

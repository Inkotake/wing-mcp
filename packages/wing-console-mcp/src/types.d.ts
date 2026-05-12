import { z } from "zod";
export type DriverKind = "native" | "osc" | "wapi" | "fake";
export type Risk = "none" | "low" | "medium" | "high" | "critical";
export type Mode = "read_only" | "rehearsal_safe" | "maintenance" | "developer_raw";
export type ErrorCode = "DEVICE_NOT_FOUND" | "DEVICE_DISCONNECTED" | "PARAM_NOT_FOUND" | "PARAM_READ_ONLY" | "VALUE_OUT_OF_RANGE" | "RISK_CONFIRMATION_REQUIRED" | "POLICY_DENIED" | "READBACK_MISMATCH" | "DRIVER_TIMEOUT" | "PROTOCOL_ERROR" | "RAW_DISABLED" | "LIVE_MODE_DENIED";
export interface WingDevice {
    id: string;
    ip: string;
    name?: string;
    model?: string;
    serial?: string;
    firmware?: string;
}
export type WingValue = {
    type: "bool";
    value: boolean;
} | {
    type: "int";
    value: number;
} | {
    type: "float";
    value: number;
    unit?: string;
} | {
    type: "string";
    value: string;
} | {
    type: "node";
    value: Record<string, unknown>;
};
export interface MeterFrame {
    timestamp: string;
    meters: Array<{
        target: string;
        rmsDbfs: number;
        peakDbfs: number;
        present: boolean;
    }>;
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
export declare const RISK_MAP: Record<string, Risk>;
export declare const WingDeviceSchema: z.ZodObject<{
    id: z.ZodString;
    ip: z.ZodString;
    name: z.ZodOptional<z.ZodString>;
    model: z.ZodOptional<z.ZodString>;
    serial: z.ZodOptional<z.ZodString>;
    firmware: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    id: string;
    ip: string;
    name?: string | undefined;
    model?: string | undefined;
    serial?: string | undefined;
    firmware?: string | undefined;
}, {
    id: string;
    ip: string;
    name?: string | undefined;
    model?: string | undefined;
    serial?: string | undefined;
    firmware?: string | undefined;
}>;
export declare const AuditRecordSchema: z.ZodObject<{
    id: z.ZodString;
    timestamp: z.ZodString;
    session_id: z.ZodString;
    operator_id: z.ZodOptional<z.ZodString>;
    mode: z.ZodEnum<["read_only", "rehearsal_safe", "maintenance", "developer_raw"]>;
    risk: z.ZodEnum<["none", "low", "medium", "high", "critical"]>;
    tool: z.ZodString;
    target: z.ZodString;
    reason: z.ZodString;
    old_value: z.ZodUnknown;
    requested_value: z.ZodUnknown;
    readback_value: z.ZodUnknown;
    confirmation_text: z.ZodOptional<z.ZodString>;
    result: z.ZodEnum<["success", "denied", "failed", "readback_mismatch"]>;
    driver: z.ZodEnum<["native", "osc", "wapi", "fake"]>;
}, "strip", z.ZodTypeAny, {
    id: string;
    timestamp: string;
    session_id: string;
    mode: "read_only" | "rehearsal_safe" | "maintenance" | "developer_raw";
    risk: "none" | "low" | "medium" | "high" | "critical";
    tool: string;
    target: string;
    reason: string;
    result: "success" | "denied" | "failed" | "readback_mismatch";
    driver: "native" | "osc" | "wapi" | "fake";
    operator_id?: string | undefined;
    old_value?: unknown;
    requested_value?: unknown;
    readback_value?: unknown;
    confirmation_text?: string | undefined;
}, {
    id: string;
    timestamp: string;
    session_id: string;
    mode: "read_only" | "rehearsal_safe" | "maintenance" | "developer_raw";
    risk: "none" | "low" | "medium" | "high" | "critical";
    tool: string;
    target: string;
    reason: string;
    result: "success" | "denied" | "failed" | "readback_mismatch";
    driver: "native" | "osc" | "wapi" | "fake";
    operator_id?: string | undefined;
    old_value?: unknown;
    requested_value?: unknown;
    readback_value?: unknown;
    confirmation_text?: string | undefined;
}>;
//# sourceMappingURL=types.d.ts.map
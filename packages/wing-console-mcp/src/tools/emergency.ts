import { WingDriver } from "../drivers/WingDriver.js";
import { ToolResult, WingValue } from "../types.js";
import { ChangePlanner } from "../safety/ChangePlanner.js";

/**
 * Emergency Tools — Panic Mute, Emergency Stop, All-Mute
 *
 * Safety-critical live performance protection. These tools provide
 * immediate emergency actions that still follow the prepare/apply
 * protocol but with elevated priority and minimal friction.
 *
 * EMERGENCY STOP is the only tool that bypasses normal rate limiting
 * and can be invoked in any mode (including read_only).
 */

let emergencyActive = false;
let emergencyTimestamp: string | null = null;

export function registerEmergencyTools(driver: WingDriver, changePlanner: ChangePlanner) {
  return {
    wing_emergency_stop: {
      description:
        "EMERGENCY: Immediately prepare a full console mute — all channels, buses, DCA, and Main LR. This is the panic button for live sound emergencies (feedback storm, sudden loud noise, equipment failure). This tool CAN be used in read_only mode — it's the only write tool with this privilege. Still requires confirmation for the apply step. Risk: critical. Write: prepare/apply/readback/audit.",
      inputSchema: {
        type: "object" as const,
        properties: {
          reason: {
            type: "string",
            description: "Brief reason for emergency stop (e.g. 'feedback storm', 'loud pop', 'equipment failure').",
          },
          scope: {
            type: "string",
            enum: ["all", "main_only", "channels_only"],
            description: "'all' = mute everything. 'main_only' = mute just Main LR (fastest). 'channels_only' = mute all 48 channels but leave buses.",
            default: "all",
          },
        },
        required: ["reason"],
      },
      handler: async (args: { reason: string; scope?: string }): Promise<ToolResult> => {
        const scope = args.scope ?? "all";
        const paths: string[] = [];

        if (scope === "main_only" || scope === "all") {
          paths.push("/main/lr/mute");
        }
        if (scope === "channels_only" || scope === "all") {
          for (let ch = 1; ch <= 48; ch++) paths.push(`/ch/${ch}/mute`);
          for (let b = 1; b <= 16; b++) paths.push(`/bus/${b}/mute`);
          for (let d = 1; d <= 8; d++) paths.push(`/dca/${d}/mute`);
        }

        emergencyActive = true;
        emergencyTimestamp = new Date().toISOString();

        // Use the first path for the prepare flow
        const newVal: WingValue = { type: "bool", value: true };
        return changePlanner.prepareWrite(
          "wing_emergency_stop",
          paths[0],
          newVal,
          `[EMERGENCY] ${args.reason} — scope: ${scope} — ${paths.length} targets will be muted`
        );
      },
    },

    wing_emergency_stop_apply: {
      description:
        "EMERGENCY APPLY: Execute the prepared emergency stop. Mutes all specified targets. Risk: critical. Write: prepare/apply/readback/audit.",
      inputSchema: {
        type: "object" as const,
        properties: {
          reason: { type: "string" },
          scope: { type: "string", enum: ["all", "main_only", "channels_only"] },
          confirmation_id: { type: "string" },
        },
        required: ["reason", "confirmation_id"],
      },
      handler: async (args: {
        reason: string; scope?: string; confirmation_id: string;
        confirmation_text?: string;
      }): Promise<ToolResult> => {
        const scope = args.scope ?? "all";

        // Validate confirmation ticket using changePlanner (respects emergency bypass)
        const muteVal: WingValue = { type: "bool", value: true };
        const validationResult = await changePlanner.applyWrite(
          "wing_emergency_stop_apply",
          "/main/lr/mute",
          muteVal,
          `[EMERGENCY] ${args.reason} — scope: ${scope}`,
          args.confirmation_id, args.confirmation_text
        );

        if (!validationResult.ok) {
          return validationResult;
        }

        // Now mute all targets
        const paths: string[] = [];
        if (scope === "main_only" || scope === "all") paths.push("/main/lr/mute");
        if (scope === "channels_only" || scope === "all") {
          for (let ch = 1; ch <= 48; ch++) paths.push(`/ch/${ch}/mute`);
          for (let b = 1; b <= 16; b++) paths.push(`/bus/${b}/mute`);
          for (let d = 1; d <= 8; d++) paths.push(`/dca/${d}/mute`);
        }

        const results: string[] = [];
        const errors: string[] = [];

        for (const path of paths) {
          try {
            await driver.setParam(path, muteVal);
            const rb = await driver.getParam(path);
            if (rb.type === "bool" && rb.value === true) {
              results.push(`${path}: muted`);
            } else {
              errors.push(`${path}: readback mismatch`);
            }
          } catch (e: any) {
            errors.push(`${path}: ${e.message}`);
          }
        }

        // Only clear emergency if ALL targets muted successfully
        emergencyActive = errors.length > 0;

        return {
          ok: errors.length === 0,
          data: {
            scope,
            targets_muted: results.length,
            targets_failed: errors.length,
            results: results.slice(0, 10),
            errors: errors.slice(0, 10),
          },
          warnings: errors.length > 0
            ? [{ code: "READBACK_MISMATCH" as const, message: `${errors.length} targets failed to mute` }]
            : undefined,
          human_summary: errors.length === 0
            ? `🚨 紧急停止完成: ${results.length} 个目标已静音 (scope: ${scope})`
            : `🚨 紧急停止部分完成: ${results.length} 成功, ${errors.length} 失败 — 紧急状态保持激活`,
        };
      },
    },

    wing_emergency_status: {
      description:
        "Check if an emergency stop is active. Returns emergency state and timestamp. Risk: none. Read-only.",
      inputSchema: { type: "object" as const, properties: {} },
      handler: async (): Promise<ToolResult> => {
        return {
          ok: true,
          data: {
            emergencyActive,
            emergencyTimestamp,
          },
          human_summary: emergencyActive
            ? `🚨 紧急停止激活中 (since ${emergencyTimestamp})`
            : "✅ 无紧急状态",
        };
      },
    },

    wing_emergency_reset: {
      description:
        "Reset emergency state and unmute all targets. HIGH risk — restores audio after an emergency stop. Requires confirmation. Write: prepare/apply/readback/audit.",
      inputSchema: {
        type: "object" as const,
        properties: {
          reason: { type: "string", description: "Why emergency is being cleared." },
        },
        required: ["reason"],
      },
      handler: async (args: { reason: string }): Promise<ToolResult> => {
        const newVal: WingValue = { type: "bool", value: false };
        return changePlanner.prepareWrite(
          "wing_emergency_reset",
          "/main/lr/mute",
          newVal,
          `[EMERGENCY RESET] ${args.reason}`
        );
      },
    },
  };
}

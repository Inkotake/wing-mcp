import { WingDriver } from "../drivers/WingDriver.js";
import { ToolResult, WingValue } from "../types.js";
import { ChangePlanner } from "../safety/ChangePlanner.js";
import { valuesEqual } from "../safety/ConfirmationManager.js";
import { BatchChangePlanner } from "../safety/BatchChangePlanner.js";

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
// Snapshot of mute/fader states saved before emergency stop, used for safe restore
let emergencySnapshot: Array<{ path: string; oldValue: WingValue }> | null = null;

export function registerEmergencyTools(
  driver: WingDriver,
  changePlanner: ChangePlanner,
  batchPlanner?: BatchChangePlanner,
) {
  const bp = batchPlanner;
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

        // Always include Main LR as the primary emergency target for prepare
        paths.push("/main/lr/mute");
        if (scope === "channels_only" || scope === "all") {
          for (let ch = 1; ch <= 48; ch++) paths.push(`/ch/${ch}/mute`);
          for (let b = 1; b <= 16; b++) paths.push(`/bus/${b}/mute`);
          for (let d = 1; d <= 8; d++) paths.push(`/dca/${d}/mute`);
        }

        // DO NOT set emergencyActive here — only in apply
        const newVal: WingValue = { type: "bool", value: true };
        return changePlanner.prepareWrite(
          "wing_emergency_stop",
          "/main/lr/mute",  // canonical target for all emergency scopes
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

        // Validate confirmation ticket via changePlanner (uses Main LR as canonical target)
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

        // Emergency is now active
        emergencyActive = true;
        emergencyTimestamp = new Date().toISOString();

        // Compute the full target list to mute
        const paths: string[] = [];
        if (scope === "main_only" || scope === "all") paths.push("/main/lr/mute");
        if (scope === "channels_only") {
          // channels_only = mute channels only, leave buses/DCAs alone
          for (let ch = 1; ch <= 48; ch++) paths.push(`/ch/${ch}/mute`);
        }
        if (scope === "all") {
          for (let ch = 1; ch <= 48; ch++) paths.push(`/ch/${ch}/mute`);
          for (let b = 1; b <= 16; b++) paths.push(`/bus/${b}/mute`);
          for (let d = 1; d <= 8; d++) paths.push(`/dca/${d}/mute`);
        }

        // Save snapshot BEFORE muting (for safe restore later)
        const snapshot: Array<{ path: string; oldValue: WingValue }> = [];
        for (const path of paths) {
          try {
            const oldVal = await driver.getParam(path);
            snapshot.push({ path, oldValue: oldVal });
          } catch {
            snapshot.push({ path, oldValue: { type: "bool", value: false } });
          }
        }
        emergencySnapshot = snapshot;

        // Use BatchChangePlanner for per-target read/write/readback/audit
        let batchResult: { successCount: number; failCount: number; operations: Array<{ target: string }> };
        if (bp) {
          const result = await bp.executeBatch(
            paths.slice(1).map(p => ({ target: p, requestedValue: muteVal, reason: `[EMERGENCY] ${args.reason}` })),
            "wing_emergency_stop_apply", args.confirmation_id, args.confirmation_text,
          );
          batchResult = { successCount: result.successCount, failCount: result.failCount, operations: result.operations };
        } else {
          // Fallback: simple mute loop
          let ok = 0, fail = 0;
          const ops: Array<{ target: string }> = [];
          for (const path of paths.slice(1)) {
            try { await driver.setParam(path, muteVal); ok++; ops.push({ target: path }); }
            catch { fail++; }
          }
          batchResult = { successCount: ok + 1, failCount: fail, operations: ops }; // +1 for Main LR already done
        }

        // Only clear emergency if ALL targets muted successfully
        emergencyActive = batchResult.failCount > 0;

        return {
          ok: batchResult.failCount === 0,
          data: {
            scope,
            targets_processed: batchResult.successCount + batchResult.failCount,
            targets_muted: batchResult.successCount,
            targets_failed: batchResult.failCount,
          },
          warnings: batchResult.failCount > 0
            ? [{ code: "READBACK_MISMATCH" as const, message: `${batchResult.failCount} targets failed to mute` }]
            : undefined,
          human_summary: batchResult.failCount === 0
            ? `🚨 紧急停止完成: ${batchResult.successCount} 个目标已静音 (scope: ${scope})`
            : `🚨 紧急停止部分完成: ${batchResult.successCount} 成功, ${batchResult.failCount} 失败 — 紧急状态保持激活`,
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
            snapshotAvailable: emergencySnapshot !== null && emergencySnapshot.length > 0,
            snapshotTargetCount: emergencySnapshot?.length ?? 0,
          },
          human_summary: emergencyActive
            ? `🚨 紧急停止激活中 (since ${emergencyTimestamp}, snapshot: ${emergencySnapshot?.length ?? 0} targets)`
            : "✅ 无紧急状态",
        };
      },
    },

    wing_emergency_reset: {
      description:
        "Reset emergency state and unmute all targets (Main LR + all channels/buses/DCAs that were muted). HIGH risk — restores audio. Requires confirmation. Write: prepare/apply/readback/audit.",
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
          `[EMERGENCY RESET] ${args.reason} — will unmute Main LR + all channels/buses/DCAs`
        );
      },
    },

    wing_emergency_reset_apply: {
      description: "Apply emergency reset: unmute Main LR and all channels/buses/DCAs. HIGH risk. Write: prepare/apply/readback/audit.",
      inputSchema: {
        type: "object" as const,
        properties: {
          reason: { type: "string" },
          confirmation_id: { type: "string" },
          confirmation_text: { type: "string" },
        },
        required: ["reason", "confirmation_id"],
      },
      handler: async (args: {
        reason: string; confirmation_id: string; confirmation_text?: string;
      }): Promise<ToolResult> => {
        // Require a snapshot to restore from — refuse blind unmute
        if (!emergencySnapshot || emergencySnapshot.length === 0) {
          return {
            ok: false,
            errors: [{ code: "POLICY_DENIED", message: "No emergency snapshot available. Cannot blindly unmute — restore manually." }],
            human_summary: "⚠️ 无紧急快照，拒绝自动恢复。请手动逐步解除静音。",
          };
        }

        const unmuteVal: WingValue = { type: "bool", value: false };

        // Validate the Main LR unmute via changePlanner first
        const validationResult = await changePlanner.applyWrite(
          "wing_emergency_reset_apply",
          "/main/lr/mute",
          unmuteVal,
          `[EMERGENCY RESET] ${args.reason} — restoring from snapshot`,
          args.confirmation_id,
          args.confirmation_text
        );

        if (!validationResult.ok) return validationResult;

        // Restore from snapshot: each target back to its pre-emergency value
        const results: string[] = [];
        const errors: string[] = [];

        // Restore in safe order: Main LR LAST
        const mainEntry = emergencySnapshot.find(s => s.path === "/main/lr/mute");
        const otherEntries = emergencySnapshot.filter(s => s.path !== "/main/lr/mute");

        for (const { path, oldValue } of [...otherEntries, ...(mainEntry ? [mainEntry] : [])]) {
          try {
            await driver.setParam(path, oldValue);
            const rb = await driver.getParam(path);
            if (valuesEqual(rb, oldValue)) {
              results.push(`${path}: restored to ${JSON.stringify(oldValue)}`);
            } else {
              errors.push(`${path}: readback mismatch (expected ${JSON.stringify(oldValue)}, got ${JSON.stringify(rb)})`);
            }
          } catch (e: any) {
            errors.push(`${path}: ${e.message}`);
          }
        }

        emergencyActive = errors.length > 0;
        emergencyTimestamp = null;
        emergencySnapshot = null;

        return {
          ok: errors.length === 0,
          data: { targets_restored: results.length, targets_failed: errors.length },
          human_summary: errors.length === 0
            ? `✅ 紧急状态已解除: ${results.length} 个目标已恢复至紧急前状态`
            : `⚠️ 紧急状态部分解除: ${results.length} 成功, ${errors.length} 失败 — 紧急状态保持激活`,
        };
      },
    },
  };
}

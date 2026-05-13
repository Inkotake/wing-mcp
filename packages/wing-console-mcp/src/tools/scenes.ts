import { WingDriver } from "../drivers/WingDriver.js";
import { ToolResult, WingValue } from "../types.js";
import { ChangePlanner } from "../safety/ChangePlanner.js";

export function registerSceneTools(driver: WingDriver, changePlanner: ChangePlanner) {
  return {
    wing_scene_list: {
      description:
        "Use this to list available scenes/snapshots on the WING console. Risk: none. Read-only.",
      inputSchema: {
        type: "object" as const,
        properties: {},
      },
      handler: async (): Promise<ToolResult> => {
        try {
          const current = await driver.getParam("/scene/current");
          const scenes: Array<{ index: number; name: string }> = [];
          for (let i = 0; i < 10; i++) {
            try {
              const name = await driver.getParam(`/scene/${i}/name`);
              if (name.type === "string" && name.value) {
                scenes.push({ index: i, name: name.value });
              }
            } catch {
              // Scene may not exist
            }
          }
          return {
            ok: true,
            data: {
              current: current.type === "int" ? current.value : -1,
              scenes,
            },
            human_summary: `当前场景: ${current.type === "int" ? `Scene ${current.value}` : "未知"}。可用场景：${scenes.map((s) => `${s.index}: ${s.name}`).join(", ") || "无"}`,
          };
        } catch (e: any) {
          return {
            ok: false,
            errors: [{ code: "PROTOCOL_ERROR" as const, message: e.message }],
            human_summary: `获取场景列表失败：${e.message}`,
          };
        }
      },
    },

    wing_scene_recall_prepare: {
      description:
        "Use this to prepare recalling a scene/snapshot. CRITICAL risk — will change current mixer state, potentially causing silence or feedback. Risk: critical. Write: prepare/apply/readback/audit.",
      inputSchema: {
        type: "object" as const,
        properties: {
          scene_index: { type: "number", description: "Scene index to recall." },
          reason: { type: "string", description: "Why this scene recall is needed. Must acknowledge risk." },
        },
        required: ["scene_index", "reason"],
      },
      handler: async (args: {
        scene_index: number;
        reason: string;
      }): Promise<ToolResult> => {
        // Recall a scene — this is a destructive action that replaces current console state
        const path = `/scene/${args.scene_index}/recall`;
        const newVal: WingValue = { type: "int", value: 1 }; // 1 = trigger recall
        return changePlanner.prepareWrite("wing_scene_recall_prepare", path, newVal, args.reason);
      },
    },

    wing_scene_recall_apply: {
      description:
        "Use this to apply a prepared scene recall. CRITICAL risk. Requires exact confirmation with risk acknowledgment. Risk: critical. Write: prepare/apply/readback/audit.",
      inputSchema: {
        type: "object" as const,
        properties: {
          scene_index: { type: "number", description: "Scene index (must match prepare)." },
          reason: { type: "string", description: "Why this scene recall is needed." },
          confirmation_id: { type: "string", description: "Confirmation ID from prepare step." },
        },
        required: ["scene_index", "reason", "confirmation_id"],
      },
      handler: async (args: {
        scene_index: number;
        reason: string;
        confirmation_id: string;
        confirmation_text?: string;
      }): Promise<ToolResult> => {
        const path = `/scene/${args.scene_index}/recall`;
        const newVal: WingValue = { type: "int", value: 1 };
        return changePlanner.applyWrite(
          "wing_scene_recall_apply",
          path,
          newVal,
          args.reason,
          args.confirmation_id, args.confirmation_text
        );
      },
    },

    wing_snapshot_save_prepare: {
      description:
        "Use this to prepare saving a new snapshot. Risk: medium. Write: prepare/apply/readback/audit.",
      inputSchema: {
        type: "object" as const,
        properties: {
          name: { type: "string", description: "Name for the new snapshot." },
          reason: { type: "string", description: "Why this snapshot is being saved." },
        },
        required: ["name", "reason"],
      },
      handler: async (args: { name: string; reason: string }): Promise<ToolResult> => {
        // Snapshot save is a special action - we write to a name parameter
        const path = "/scene/next/name";
        const newVal: WingValue = { type: "string", value: args.name };
        return changePlanner.prepareWrite("wing_snapshot_save_prepare", path, newVal, args.reason);
      },
    },

    wing_snapshot_save_apply: {
      description:
        "Use this to apply a prepared snapshot save. Risk: medium. Write: prepare/apply/readback/audit.",
      inputSchema: {
        type: "object" as const,
        properties: {
          name: { type: "string", description: "Snapshot name (must match prepare)." },
          reason: { type: "string", description: "Why this snapshot is being saved." },
          confirmation_id: { type: "string", description: "Confirmation ID from prepare step." },
        },
        required: ["name", "reason", "confirmation_id"],
      },
      handler: async (args: {
        name: string;
        reason: string;
        confirmation_id: string;
        confirmation_text?: string;
      }): Promise<ToolResult> => {
        const path = "/scene/next/name";
        const newVal: WingValue = { type: "string", value: args.name };
        return changePlanner.applyWrite(
          "wing_snapshot_save_apply",
          path,
          newVal,
          args.reason,
          args.confirmation_id, args.confirmation_text
        );
      },
    },
  };
}

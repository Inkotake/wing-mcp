import { WingDriver } from "../drivers/WingDriver.js";
import { ToolResult } from "../types.js";
import { wingPropmap, WingPropmap } from "../schema/WingPropmap.js";

// Pre-built schema catalog for quick lookup (fallback when propmap not loaded)
const SCHEMA_CATALOG: Array<{ path: string; description: string; aliases: string[]; risk: string }> = [
  { path: "/ch/{n}/mute", description: "Channel {n} mute on/off", aliases: ["channel mute", "mute channel", "静音"], risk: "medium" },
  { path: "/ch/{n}/fader", description: "Channel {n} fader level (dB)", aliases: ["channel fader", "fader", "推子", "音量"], risk: "medium" },
  { path: "/ch/{n}/name", description: "Channel {n} scribble strip name", aliases: ["channel name", "名称", "标签"], risk: "low" },
  { path: "/ch/{n}/source", description: "Channel {n} input source", aliases: ["channel source", "input patch", "信号源"], risk: "medium" },
  { path: "/ch/{n}/pan", description: "Channel {n} pan position", aliases: ["pan", "声道", "声像"], risk: "low" },
  { path: "/ch/{n}/eq/high/gain", description: "Channel {n} high EQ gain", aliases: ["高频", "high eq", "高音"], risk: "medium" },
  { path: "/ch/{n}/eq/hi_mid/gain", description: "Channel {n} hi-mid EQ gain", aliases: ["中高频", "hi mid eq"], risk: "medium" },
  { path: "/ch/{n}/eq/lo_mid/gain", description: "Channel {n} lo-mid EQ gain", aliases: ["中低频", "lo mid eq"], risk: "medium" },
  { path: "/ch/{n}/eq/low/gain", description: "Channel {n} low EQ gain", aliases: ["低频", "low eq", "低音"], risk: "medium" },
  { path: "/ch/{n}/gate/threshold", description: "Channel {n} noise gate threshold", aliases: ["噪声门", "gate", "门限"], risk: "medium" },
  { path: "/ch/{n}/comp/threshold", description: "Channel {n} compressor threshold", aliases: ["压缩", "compressor", "压限"], risk: "medium" },
  { path: "/ch/{n}/send/{b}/level", description: "Channel {n} send to Bus {b} level", aliases: ["发送", "send", "aux", "监听发送", "耳返发送"], risk: "medium" },
  { path: "/main/lr/mute", description: "Main LR mute", aliases: ["主输出静音", "main mute", "总输出静音"], risk: "high" },
  { path: "/main/lr/fader", description: "Main LR fader level", aliases: ["主输出推子", "main fader", "总输出", "主扩"], risk: "high" },
  { path: "/bus/{n}/mute", description: "Bus {n} mute", aliases: ["bus mute", "编组静音", "母线静音"], risk: "medium" },
  { path: "/bus/{n}/fader", description: "Bus {n} fader level", aliases: ["bus fader", "编组推子", "母线推子"], risk: "medium" },
  { path: "/headamp/local/{n}/gain", description: "Local input {n} headamp gain", aliases: ["话放增益", "gain", "输入增益", "headamp"], risk: "high" },
  { path: "/headamp/local/{n}/phantom", description: "Local input {n} 48V phantom power", aliases: ["幻象电源", "phantom", "48v", "+48v"], risk: "critical" },
  { path: "/dca/{n}/mute", description: "DCA {n} mute", aliases: ["dca mute", "dca静音"], risk: "high" },
  { path: "/dca/{n}/fader", description: "DCA {n} fader level", aliases: ["dca fader", "dca推子"], risk: "high" },
  { path: "/scene/current", description: "Current scene number", aliases: ["当前场景", "scene"], risk: "critical" },
];

export function registerSchemaTools(driver: WingDriver) {
  return {
    wing_schema_search: {
      description:
        "Use this to find WING parameters by natural language, canonical path, or alias. Search by keyword, Chinese, or English. Risk: none. Read-only.",
      inputSchema: {
        type: "object" as const,
        properties: {
          query: {
            type: "string",
            description: "Search query — can be English, Chinese, canonical path, or natural language.",
          },
        },
        required: ["query"],
      },
      handler: async (args: { query: string }): Promise<ToolResult> => {
        const q = args.query.toLowerCase();
        // Search static catalog first
        const catalogResults = SCHEMA_CATALOG.filter(
          (entry) =>
            entry.path.toLowerCase().includes(q) ||
            entry.description.toLowerCase().includes(q) ||
            entry.aliases.some((a) => a.includes(q))
        );
        // Also search WING propmap if loaded
        let propmapResults: Array<{ fullname: string; longname: string; type: string }> = [];
        if (wingPropmap.isLoaded()) {
          propmapResults = wingPropmap.search(q, 10).map(e => ({
            fullname: e.fullname,
            longname: e.longname ?? e.name,
            type: e.type,
          }));
        }
        const totalResults = catalogResults.length + propmapResults.length;
        return {
          ok: true,
          data: { catalog: catalogResults, propmap: propmapResults },
          human_summary:
            totalResults > 0
              ? `找到 ${totalResults} 个匹配 (catalog: ${catalogResults.length}, propmap: ${propmapResults.length})`
              : `未找到匹配 "${args.query}" 的参数`,
        };
      },
    },

    wing_param_resolve: {
      description:
        "Use this to resolve user phrases like 'main vocal', 'drummer ears', '主唱' to WING mixer targets (channel, bus, send). Uses alias and context resolution. Risk: none. Read-only.",
      inputSchema: {
        type: "object" as const,
        properties: {
          phrase: {
            type: "string",
            description: "User phrase to resolve, e.g. 'main vocal', '主唱', 'drummer monitor', '鼓手耳返'.",
          },
          room_id: {
            type: "string",
            description: "Optional room identifier to look up patch sheet.",
          },
        },
        required: ["phrase"],
      },
      handler: async (args: { phrase: string; room_id?: string }, context?: { aliasResolver?: any }): Promise<ToolResult> => {
        const phrase = args.phrase.toLowerCase();

        // Try AliasResolver first (dynamic, loaded from room memory)
        if (context?.aliasResolver) {
          const resolved = context.aliasResolver.resolve(args.phrase);
          if (resolved) {
            return {
              ok: true,
              data: { resolved: { phrase: args.phrase, target: resolved } },
              human_summary: `"${args.phrase}" 解析为 ${resolved} (from resolver)`,
            };
          }
        }

        // Fall back to hardcoded mappings
        const mappings: Array<{ phrase: string; target: string; channel?: number }> = [
          { phrase: "main vocal", target: "CH 1", channel: 1 },
          { phrase: "主唱", target: "CH 1", channel: 1 },
          { phrase: "vocal 1", target: "CH 1", channel: 1 },
          { phrase: "vocal 2", target: "CH 2", channel: 2 },
          { phrase: "guitar", target: "CH 3", channel: 3 },
          { phrase: "吉他", target: "CH 3", channel: 3 },
          { phrase: "bass", target: "CH 4", channel: 4 },
          { phrase: "贝斯", target: "CH 4", channel: 4 },
          { phrase: "drums", target: "CH 5", channel: 5 },
          { phrase: "鼓", target: "CH 5", channel: 5 },
          { phrase: "keyboard", target: "CH 6", channel: 6 },
          { phrase: "键盘", target: "CH 6", channel: 6 },
          { phrase: "drummer monitor", target: "Bus 1", channel: 1 },
          { phrase: "鼓手耳返", target: "Bus 1", channel: 1 },
          { phrase: "main lr", target: "Main LR", channel: 0 },
          { phrase: "主扩", target: "Main LR", channel: 0 },
          { phrase: "主输出", target: "Main LR", channel: 0 },
          { phrase: "click", target: "CH 12", channel: 12 },
          { phrase: "节拍器", target: "CH 12", channel: 12 },
          { phrase: "kick", target: "CH 5", channel: 5 },
          { phrase: "底鼓", target: "CH 5", channel: 5 },
          { phrase: "snare", target: "CH 6", channel: 6 },
          { phrase: "军鼓", target: "CH 6", channel: 6 },
          { phrase: "overhead", target: "CH 7", channel: 7 },
          { phrase: "吊镲", target: "CH 7", channel: 7 },
          { phrase: "spd", target: "CH 11", channel: 11 },
          { phrase: "打击垫", target: "CH 11", channel: 11 },
        ];

        const matches = mappings.filter(
          (m) => m.phrase.includes(phrase) || phrase.includes(m.phrase)
        );

        if (matches.length === 0) {
          return {
            ok: true,
            data: { resolved: null, candidates: [] },
            human_summary: `无法将 "${args.phrase}" 解析到已知目标。请使用 wing_schema_search 查找参数，或提供更具体的目标。`,
          };
        }

        const best = matches[0];
        return {
          ok: true,
          data: {
            resolved: best,
            candidates: matches,
          },
          human_summary: `"${args.phrase}" 解析为 ${best.target}${best.channel ? ` (Channel ${best.channel})` : ""}`,
        };
      },
    },
  };
}

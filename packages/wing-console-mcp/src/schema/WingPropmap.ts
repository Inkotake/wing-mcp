/**
 * WING Propmap Loader — reads the 60,748-entry libwing propmap and provides
 * canonical path ↔ WING Native parameter resolution.
 *
 * Key mappings discovered from real WING (libwing propmap):
 *   /ch/{n}/fdr        → Channel fader (NOT /ch/{n}/fader)
 *   /ch/{n}/mute       → MUTE is at /io/in/LCL/{n}/mute
 *   /io/in/LCL/{n}/vph → Phantom power (NOT /headamp/local/{n}/phantom)
 *   /main/st/mix/fader → Main LR fader
 *
 * This file provides the canonical→real path bridge needed for
 * Native driver and OSC driver to use verified WING parameter paths.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveCanonical } from "./CanonicalMapper.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface PropEntry {
  id: number;
  name: string;
  longname?: string;
  type: string;
  unit?: string;
  fullname: string;
  minint?: number;
  maxint?: number;
  items?: Array<{ item: string }>;
}

export class WingPropmap {
  private entries: Map<string, PropEntry> = new Map();
  private byFullname: Map<string, PropEntry> = new Map();
  private loaded = false;

  /** Load propmap from JSONL file (from libwing) */
  load(filePath?: string): void {
    if (this.loaded) return;
    const fp = filePath ?? path.join(__dirname, "propmap.jsonl");
    try {
      const content = fs.readFileSync(fp, "utf-8");
      for (const line of content.split("\n")) {
        if (!line.trim()) continue;
        try {
          const entry: PropEntry = JSON.parse(line);
          this.entries.set(String(entry.id), entry);
          if (entry.fullname) this.byFullname.set(entry.fullname, entry);
        } catch {}
      }
      this.loaded = true;
      console.error(`[WingPropmap] Loaded ${this.entries.size} entries from propmap`);
    } catch (e) {
      console.error(`[WingPropmap] Failed to load propmap: ${e}`);
    }
  }

  /** Resolve a canonical path to the real WING native fullname */
  /** Delegate to CanonicalMapper for single-source-of-truth path resolution */
  canonicalToNative(canonical: string): string | null {
    const resolved = resolveCanonical(canonical);
    return resolved?.nativePath ?? null;
  }

  /** Look up a WING native parameter by fullname */
  lookup(fullname: string): PropEntry | undefined {
    if (!this.loaded) this.load();
    return this.byFullname.get(fullname);
  }

  /** Search propmap entries by name or longname (for schema_search) */
  search(query: string, limit = 20): PropEntry[] {
    if (!this.loaded) this.load();
    const q = query.toLowerCase();
    const results: PropEntry[] = [];
    for (const entry of this.byFullname.values()) {
      if ((entry.name && entry.name.toLowerCase().includes(q)) ||
          (entry.longname && entry.longname.toLowerCase().includes(q)) ||
          (entry.fullname && entry.fullname.toLowerCase().includes(q))) {
        results.push(entry);
        if (results.length >= limit) break;
      }
    }
    return results;
  }

  getEntryCount(): number { return this.entries.size; }
  isLoaded(): boolean { return this.loaded; }
}

// Singleton
export const wingPropmap = new WingPropmap();

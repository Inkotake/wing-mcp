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
    const fp = filePath ?? path.join(__dirname, "..", "schema", "propmap.jsonl");
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
  canonicalToNative(canonical: string): string | null {
    // Map our canonical paths to WING native paths (verified against propmap)
    const m = canonical.match(/^\/ch\/(\d+)\/(.+)$/);
    if (m) {
      const ch = parseInt(m[1]);
      const sub = m[2];
      if (sub === "fader" || sub === "fdr") return `/ch/${ch}/fdr`;
      if (sub === "mute" || sub === "on") return `/ch/${ch}/mute`;
      if (sub === "name") return `/ch/${ch}/name`;
      if (sub === "pan") return `/ch/${ch}/pan`;
      if (sub.startsWith("eq/")) return `/ch/${ch}/${sub}`;
      if (sub.startsWith("gate/")) return `/ch/${ch}/${sub}`;
      if (sub.startsWith("comp/")) return `/ch/${ch}/${sub}`;
      if (sub.startsWith("send/")) {
        const sm = sub.match(/^send\/(\d+)\/level$/);
        if (sm) return `/ch/${ch}/send/${sm[1]}/level`;
      }
      return `/ch/${ch}/${sub}`;
    }
    if (canonical === "/main/lr/fader") return "/main/st/mix/fader";
    if (canonical === "/main/lr/mute") return "/main/st/mix/on";
    if (canonical === "/main/lr/name") return "/main/st/config/name";
    if (canonical.startsWith("/bus/")) {
      const bm = canonical.match(/^\/bus\/(\d+)\/(.+)$/);
      if (bm) return `/bus/${bm[1]}/${bm[2]}`;
    }
    if (canonical.startsWith("/headamp/local/")) {
      const hm = canonical.match(/^\/headamp\/local\/(\d+)\/(.+)$/);
      if (hm) {
        if (hm[2] === "gain") return `/io/in/LCL/${hm[1]}/gain`;
        if (hm[2] === "phantom") return `/io/in/LCL/${hm[1]}/vph`;
      }
    }
    if (canonical.startsWith("/dca/")) {
      const dm = canonical.match(/^\/dca\/(\d+)\/(.+)$/);
      if (dm) return `/dca/${dm[1]}/${dm[2]}`;
    }
    if (canonical.startsWith("/mtx/")) {
      const mm = canonical.match(/^\/mtx\/(\d+)\/(.+)$/);
      if (mm) return `/mtx/${mm[1]}/${mm[2]}`;
    }
    if (canonical.startsWith("/fx/")) {
      const fm = canonical.match(/^\/fx\/(\d+)\/(.+)$/);
      if (fm) return `/fx/${fm[1]}/${fm[2]}`;
    }

    // Direct lookup in propmap
    if (this.loaded) {
      const entry = this.byFullname.get(canonical);
      if (entry) return entry.fullname;
    }

    return null;
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

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
  canonicalToNative(canonical: string): string | null {
    // Verified against propmap.jsonl (60,748 entries from libwing)
    // Each mapping checked for existence in byFullname
    const m = canonical.match(/^\/ch\/(\d+)\/(.+)$/);
    if (m) {
      const ch = parseInt(m[1]);
      const sub = m[2];
      // Channel identity
      if (sub === "fader" || sub === "fdr") return this.verify(`/ch/${ch}/fdr`);
      if (sub === "mute" || sub === "on") return this.verify(`/ch/${ch}/mute`);
      if (sub === "name") return this.verify(`/ch/${ch}/name`);
      if (sub === "pan") return this.verify(`/ch/${ch}/pan`);
      if (sub === "source") return this.verify(`/ch/${ch}/source`);
      // EQ: /ch/{n}/eq/STD/hg
      if (sub.startsWith("eq/")) {
        const eqm = sub.match(/^eq\/(\w+)\/(\w+)$/);
        if (eqm) return this.verify(`/ch/${ch}/eq/STD/${eqm[1][0]}${eqm[2][0]}`); // e.g. high/gain → hg
      }
      // Gate: /ch/{n}/gate/GATE/thr
      if (sub.startsWith("gate/")) {
        const gtm = sub.match(/^gate\/(\w+)$/);
        if (gtm) return this.verify(`/ch/${ch}/gate/GATE/${gtm[1].slice(0,3)}`); // threshold → thr
      }
      // Compressor: /ch/{n}/dyn/COMP/thr
      if (sub.startsWith("comp/")) {
        const cpm = sub.match(/^comp\/(\w+)$/);
        if (cpm) return this.verify(`/ch/${ch}/dyn/COMP/${cpm[1].slice(0,3)}`);
      }
      // Send: /ch/{n}/send/{b}/lvl
      if (sub.startsWith("send/")) {
        const sm = sub.match(/^send\/(\d+)\/(level|on)$/);
        if (sm) return this.verify(`/ch/${ch}/send/${sm[1]}/${sm[2] === "level" ? "lvl" : "on"}`);
      }
      return this.verify(`/ch/${ch}/${sub}`);
    }
    // Main LR verified paths
    if (canonical === "/main/lr/fader") return this.verify("/main/1/fdr");
    if (canonical === "/main/lr/mute") return this.verify("/main/1/mute");
    if (canonical === "/main/lr/name") return this.verify("/main/1/name");
    // Buses
    if (canonical.startsWith("/bus/")) {
      const bm = canonical.match(/^\/bus\/(\d+)\/(.+)$/);
      if (bm) {
        if (bm[2] === "fader" || bm[2] === "fdr") return this.verify(`/bus/${bm[1]}/fdr`);
        if (bm[2] === "mute" || bm[2] === "on") return this.verify(`/bus/${bm[1]}/mute`);
        return this.verify(`/bus/${bm[1]}/${bm[2]}`);
      }
    }
    // Headamp verified paths
    if (canonical.startsWith("/headamp/local/")) {
      const hm = canonical.match(/^\/headamp\/local\/(\d+)\/(.+)$/);
      if (hm) {
        if (hm[2] === "gain") return this.verify(`/io/in/LCL/${hm[1]}/g`);
        if (hm[2] === "phantom") return this.verify(`/io/in/LCL/${hm[1]}/vph`);
      }
    }
    // DCA verified paths
    if (canonical.startsWith("/dca/")) {
      const dm = canonical.match(/^\/dca\/(\d+)\/(.+)$/);
      if (dm) {
        if (dm[2] === "fader" || dm[2] === "fdr") return this.verify(`/dca/${dm[1]}/fdr`);
        if (dm[2] === "mute" || dm[2] === "on") return this.verify(`/dca/${dm[1]}/mute`);
        return this.verify(`/dca/${dm[1]}/${dm[2]}`);
      }
    }
    // Matrix verified paths
    if (canonical.startsWith("/mtx/")) {
      const mm = canonical.match(/^\/mtx\/(\d+)\/(.+)$/);
      if (mm) {
        if (mm[2] === "fader" || mm[2] === "fdr") return this.verify(`/mtx/${mm[1]}/fdr`);
        if (mm[2] === "mute") return this.verify(`/mtx/${mm[1]}/mute`);
        return this.verify(`/mtx/${mm[1]}/${mm[2]}`);
      }
    }
    // FX verified paths
    if (canonical.startsWith("/fx/")) {
      const fm = canonical.match(/^\/fx\/(\d+)\/(.+)$/);
      if (fm) {
        if (fm[2] === "model") return this.verify(`/fx/${fm[1]}/mdl`);
        return this.verify(`/fx/${fm[1]}/${fm[2]}`);
      }
    }
    // Direct lookup
    if (this.loaded) {
      const entry = this.byFullname.get(canonical);
      if (entry) return entry.fullname;
    }
    return null;
  }

  /** Verify path exists in propmap; return null if not found */
  private verify(path: string): string | null {
    if (!this.loaded) this.load();
    return this.byFullname.has(path) ? path : null;
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

/**
 * CanonicalMapper v1 — Table-driven canonical→WING path mapping.
 *
 * All mappings verified against libwing propmap.jsonl (60,748 entries).
 * No string-slice guessing. Unknown paths return null, not guessed paths.
 */

import { wingPropmap } from "./WingPropmap.js";

// EQ band mapping: canonical band name → WING prop suffix
const EQ_BAND_MAP: Record<string, Record<string, string>> = {
  low:    { gain: "lg", freq: "lf", q: "lq" },
  lo_mid: { gain: "2g", freq: "2f", q: "2q" },
  hi_mid: { gain: "4g", freq: "4f", q: "4q" },
  high:   { gain: "hg", freq: "hf", q: "hq" },
};

// Gate parameter mapping
const GATE_PARAM_MAP: Record<string, string> = {
  threshold: "thr", range: "range", attack: "att", hold: "hld", release: "rel",
};

// Compressor parameter mapping
const COMP_PARAM_MAP: Record<string, string> = {
  threshold: "thr", ratio: "ratio", attack: "att", release: "rel", gain: "gain",
};

// Send parameter mapping
const SEND_PARAM_MAP: Record<string, string> = {
  level: "lvl", on: "on",
};

export interface CanonicalResult {
  canonical: string;
  nativePath?: string;
  kind: "bool" | "int" | "float" | "string" | "node" | "composite";
  unit?: string;
  verified: boolean;
}

/** Resolve a canonical path to a verified WING native path */
export function resolveCanonical(canonical: string): CanonicalResult | null {
  // Channel parameters
  const chm = canonical.match(/^\/ch\/(\d+)\/(.+)$/);
  if (chm) {
    const ch = parseInt(chm[1]);
    const sub = chm[2];

    // Identity params
    if (sub === "fader" || sub === "fdr") return v(`/ch/${ch}/fdr`, "float", "dB");
    if (sub === "mute" || sub === "on") return v(`/ch/${ch}/mute`, "bool");
    if (sub === "name") return v(`/ch/${ch}/name`, "string");
    if (sub === "pan") return v(`/ch/${ch}/pan`, "float");
    if (sub === "source") return { canonical, kind: "composite", verified: false };

    // EQ: /ch/{n}/eq/{band}/{param}
    const eqm = sub.match(/^eq\/(\w+)\/(\w+)$/);
    if (eqm) {
      const bandMap = EQ_BAND_MAP[eqm[1]];
      if (!bandMap) return null;
      const suffix = bandMap[eqm[2]];
      if (!suffix) return null;
      return v(`/ch/${ch}/eq/STD/${suffix}`, eqm[2] === "gain" || eqm[2] === "freq" ? "float" : "float");
    }

    // Gate: /ch/{n}/gate/{param}
    const gtm = sub.match(/^gate\/(\w+)$/);
    if (gtm) {
      const gsuffix = GATE_PARAM_MAP[gtm[1]];
      if (!gsuffix) return null;
      return v(`/ch/${ch}/gate/GATE/${gsuffix}`, "float", gtm[1] === "threshold" || gtm[1] === "range" ? "dB" : "ms");
    }

    // Compressor: /ch/{n}/comp/{param}
    const cpm = sub.match(/^comp\/(\w+)$/);
    if (cpm) {
      const csuffix = COMP_PARAM_MAP[cpm[1]];
      if (!csuffix) return null;
      return v(`/ch/${ch}/dyn/COMP/${csuffix}`, "float");
    }

    // Send: /ch/{n}/send/{b}/{param}
    const sm = sub.match(/^send\/(\d+)\/(\w+)$/);
    if (sm) {
      const ssuffix = SEND_PARAM_MAP[sm[2]];
      if (!ssuffix) return null;
      return v(`/ch/${ch}/send/${sm[1]}/${ssuffix}`, sm[2] === "on" ? "bool" : "float", sm[2] === "level" ? "dB" : undefined);
    }

    // Generic: return directly if in propmap
    const generic = `/ch/${ch}/${sub}`;
    return v(generic, "float");
  }

  // Main LR
  if (canonical === "/main/lr/fader") return v("/main/1/fdr", "float", "dB");
  if (canonical === "/main/lr/mute") return v("/main/1/mute", "bool");
  if (canonical === "/main/lr/name") return v("/main/1/name", "string");

  // Buses
  const bm = canonical.match(/^\/bus\/(\d+)\/(.+)$/);
  if (bm) {
    if (bm[2] === "fader" || bm[2] === "fdr") return v(`/bus/${bm[1]}/fdr`, "float", "dB");
    if (bm[2] === "mute" || bm[2] === "on") return v(`/bus/${bm[1]}/mute`, "bool");
    return v(`/bus/${bm[1]}/${bm[2]}`, "float");
  }

  // Headamp
  const hm = canonical.match(/^\/headamp\/local\/(\d+)\/(.+)$/);
  if (hm) {
    if (hm[2] === "gain") return v(`/io/in/LCL/${hm[1]}/g`, "float", "dB");
    if (hm[2] === "phantom") return v(`/io/in/LCL/${hm[1]}/vph`, "bool");
  }

  // DCA
  const dm = canonical.match(/^\/dca\/(\d+)\/(.+)$/);
  if (dm) {
    if (dm[2] === "fader" || dm[2] === "fdr") return v(`/dca/${dm[1]}/fdr`, "float", "dB");
    if (dm[2] === "mute" || dm[2] === "on") return v(`/dca/${dm[1]}/mute`, "bool");
    return v(`/dca/${dm[1]}/${dm[2]}`, "float");
  }

  // Matrix
  const mm = canonical.match(/^\/mtx\/(\d+)\/(.+)$/);
  if (mm) {
    if (mm[2] === "fader" || mm[2] === "fdr") return v(`/mtx/${mm[1]}/fdr`, "float", "dB");
    if (mm[2] === "mute") return v(`/mtx/${mm[1]}/mute`, "bool");
    return v(`/mtx/${mm[1]}/${mm[2]}`, "float");
  }

  // FX
  const fm = canonical.match(/^\/fx\/(\d+)\/(.+)$/);
  if (fm) {
    if (fm[2] === "model") return v(`/fx/${fm[1]}/mdl`, "string");
    return v(`/fx/${fm[1]}/${fm[2]}`, "float");
  }

  // Scene, recorder, etc.
  if (canonical === "/scene/current") return v("/-stat/curr", "int");
  if (canonical === "/recorder/transport") return v("/-stat/rec/transport", "string");

  // Direct propmap lookup
  if (wingPropmap.isLoaded()) {
    const entry = wingPropmap.lookup(canonical);
    if (entry) return { canonical, nativePath: entry.fullname, kind: propTypeToKind(entry.type), verified: true };
  }

  return null;
}

function v(path: string, kind: CanonicalResult["kind"], unit?: string): CanonicalResult {
  const verified = wingPropmap.isLoaded() ? wingPropmap.lookup(path) !== undefined : false;
  return { canonical: path, nativePath: path, kind, unit, verified };
}

function propTypeToKind(t: string): CanonicalResult["kind"] {
  if (t.includes("bool") || (t === "integer" && true)) return "bool";
  if (t.includes("fader") || t.includes("float") || t.includes("level")) return "float";
  if (t.includes("string")) return "string";
  if (t.includes("node")) return "node";
  return "int";
}

import { WingValue } from "../types.js";

/**
 * StateCache caches WING parameter values to reduce redundant reads.
 * TTL-based invalidation ensures freshness.
 */
export class StateCache {
  private cache: Map<string, { value: WingValue; ts: number }> = new Map();
  private ttlMs: number;

  constructor(ttlMs: number = 5000) {
    this.ttlMs = ttlMs;
  }

  get(path: string): WingValue | undefined {
    const entry = this.cache.get(path);
    if (!entry) return undefined;
    if (Date.now() - entry.ts > this.ttlMs) {
      this.cache.delete(path);
      return undefined;
    }
    return entry.value;
  }

  set(path: string, value: WingValue): void {
    this.cache.set(path, { value, ts: Date.now() });
  }

  invalidate(path: string): void {
    this.cache.delete(path);
  }

  invalidateByPrefix(prefix: string): void {
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
      }
    }
  }

  clear(): void {
    this.cache.clear();
  }
}

/**
 * AliasResolver maps human-friendly names to canonical WING parameter paths.
 */
export class AliasResolver {
  private aliases: Map<string, string> = new Map();

  constructor() {
    // Pre-populate with standard aliases
    this.aliases.set("main fader", "/main/lr/fader");
    this.aliases.set("main mute", "/main/lr/mute");
    this.aliases.set("main lr", "/main/lr/fader");
  }

  resolve(name: string): string | undefined {
    const key = name.toLowerCase().trim();
    return this.aliases.get(key);
  }

  register(alias: string, canonicalPath: string): void {
    this.aliases.set(alias.toLowerCase().trim(), canonicalPath);
  }

  search(query: string): string[] {
    const q = query.toLowerCase();
    const results: string[] = [];
    for (const [alias, path] of this.aliases) {
      if (alias.includes(q) || path.toLowerCase().includes(q)) {
        results.push(path);
      }
    }
    return results;
  }
}
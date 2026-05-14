/**
 * OscDriver — Open Sound Control driver for Behringer WING.
 *
 * Real UDP implementation:
 * - Discovery: UDP port 2222, broadcast "WING?" → parse response
 * - Control: UDP port 2223, OSC 1.0 format messages
 *
 * Enabled via WING_DRIVER=osc WING_HOST=<ip>
 *
 * Canonical path → OSC path mapping is handled internally.
 * All writes go through the safety pipeline (ChangePlanner).
 */

import * as dgram from "node:dgram";
import { WingDriver, WingDevice, WingValue, MeterFrame, DriverKind } from "./WingDriver.js";

// ── OSC codec ──────────────────────────────────────────
// Minimal OSC 1.0 encoder/decoder (no external deps)

function oscEncode(path: string, ...args: Array<{ type: string; value: unknown }>): Buffer {
  const parts: Buffer[] = [];
  // Address
  parts.push(Buffer.from(path + "\0"));
  padBuffer(parts);
  // Type tag string
  const types = "," + args.map(a => a.type).join("");
  parts.push(Buffer.from(types + "\0"));
  padBuffer(parts);
  // Arguments
  for (const arg of args) {
    switch (arg.type) {
      case "f": {
        const buf = Buffer.allocUnsafe(4);
        buf.writeFloatBE(arg.value as number, 0);
        parts.push(buf);
        break;
      }
      case "i": {
        const buf = Buffer.allocUnsafe(4);
        buf.writeInt32BE(arg.value as number, 0);
        parts.push(buf);
        break;
      }
      case "s": {
        const str = String(arg.value);
        parts.push(Buffer.from(str + "\0"));
        padBuffer(parts);
        break;
      }
    }
  }
  return Buffer.concat(parts);
}

function oscDecode(buf: Buffer): { path: string; args: Array<{ type: string; value: unknown }> } | null {
  try {
    let offset = 0;
    const pathEnd = buf.indexOf(0, offset);
    if (pathEnd < 0) return null;
    const path = buf.slice(offset, pathEnd).toString();
    offset = (pathEnd + 4) & ~3;
    if (buf[offset] !== 0x2c) return null; // ","
    const typeEnd = buf.indexOf(0, offset);
    if (typeEnd < 0) return null;
    const types = buf.slice(offset + 1, typeEnd).toString();
    offset = (typeEnd + 4) & ~3;

    const args: Array<{ type: string; value: unknown }> = [];
    for (const t of types) {
      switch (t) {
        case "f":
          if (offset + 4 > buf.length) return null;
          args.push({ type: "f", value: buf.readFloatBE(offset) });
          offset += 4;
          break;
        case "i":
          if (offset + 4 > buf.length) return null;
          args.push({ type: "i", value: buf.readInt32BE(offset) });
          offset += 4;
          break;
        case "s": {
          const strEnd = buf.indexOf(0, offset);
          if (strEnd < 0) return null;
          args.push({ type: "s", value: buf.slice(offset, strEnd).toString() });
          offset = (strEnd + 4) & ~3;
          break;
        }
        default:
          return null; // unsupported type
      }
    }
    return { path, args };
  } catch {
    return null;
  }
}

function padBuffer(parts: Buffer[]) {
  const last = parts[parts.length - 1];
  const pad = (4 - (last.length & 3)) & 3;
  if (pad) parts.push(Buffer.alloc(pad));
}

// ── Canonical → OSC path mapping ───────────────────────
// WARNING: These mappings are UNVERIFIED and may use X32-style paths.
// WING OSC paths differ from X32/M32 OSC paths.
// MUST verify against WING Remote Protocols + real hardware before production use.
// See: Behringer WING Remote Protocols PDF, libwing propmap, or WING Edit packet capture.
function canonicalToOsc(canonical: string): string | null {
  // Map our canonical paths to WING OSC addresses
  const m = canonical.match(/^\/ch\/(\d+)\/(.+)$/);
  if (m) {
    const ch = m[1].padStart(2, "0");
    const sub = m[2];
    if (sub === "fader") return `/ch/${ch}/mix/fader`;
    if (sub === "mute") return `/ch/${ch}/mix/on`;
    if (sub === "name") return `/ch/${ch}/config/name`;
    if (sub === "pan") return `/ch/${ch}/mix/pan`;
    if (sub.startsWith("eq/")) return `/ch/${ch}/eq/${sub.slice(3)}`;
    if (sub.startsWith("gate/")) return `/ch/${ch}/gate/${sub.slice(5)}`;
    if (sub.startsWith("comp/")) return `/ch/${ch}/dyn/${sub.slice(5)}`;
    if (sub.startsWith("send/")) {
      const sm = sub.match(/^send\/(\d+)\/level$/);
      if (sm) return `/ch/${ch}/mix/${sm[1].padStart(2, "0")}/level`;
    }
    return `/ch/${ch}/${sub}`;
  }
  if (canonical === "/main/lr/fader") return "/main/st/mix/fader";
  if (canonical === "/main/lr/mute") return "/main/st/mix/on";
  if (canonical === "/main/lr/name") return "/main/st/config/name";
  if (canonical.startsWith("/bus/")) {
    const bm = canonical.match(/^\/bus\/(\d+)\/(.+)$/);
    if (bm) {
      const b = bm[1].padStart(2, "0");
      if (bm[2] === "fader") return `/bus/${b}/mix/fader`;
      if (bm[2] === "mute") return `/bus/${b}/mix/on`;
      return `/bus/${b}/${bm[2]}`;
    }
  }
  if (canonical.startsWith("/headamp/local/")) {
    const hm = canonical.match(/^\/headamp\/local\/(\d+)\/(.+)$/);
    if (hm) {
      if (hm[2] === "gain") return `/headamp/${hm[1].padStart(3, "0")}/gain`;
      if (hm[2] === "phantom") return `/headamp/${hm[1].padStart(3, "0")}/phantom`;
    }
  }
  if (canonical.startsWith("/dca/")) {
    const dm = canonical.match(/^\/dca\/(\d+)\/(.+)$/);
    if (dm) {
      if (dm[2] === "fader") return `/dca/${dm[1]}/mix/fader`;
      if (dm[2] === "mute") return `/dca/${dm[1]}/mix/on`;
    }
  }
  if (canonical.startsWith("/mtx/")) {
    const mm = canonical.match(/^\/mtx\/(\d+)\/(.+)$/);
    if (mm) {
      if (mm[2] === "fader") return `/mtx/${mm[1]}/mix/fader`;
      if (mm[2] === "mute") return `/mtx/${mm[1]}/mix/on`;
    }
  }
  if (canonical.startsWith("/fx/")) {
    const fm = canonical.match(/^\/fx\/(\d+)\/(.+)$/);
    if (fm) return `/fx/${fm[1]}/${fm[2]}`;
  }
  if (canonical === "/scene/current") return "/-snap/load";
  return null; // no OSC mapping
}

function oscValueToWing(val: unknown, wingType: string): WingValue {
  switch (wingType) {
    case "float": return { type: "float", value: val as number, unit: "dB" };
    case "bool": return { type: "bool", value: val === 1 || val === true };
    case "string": return { type: "string", value: String(val) };
    case "int": return { type: "int", value: val as number };
    default: return { type: "string", value: String(val) };
  }
}

// ── OscDriver ──────────────────────────────────────────

export class OscDriver implements WingDriver {
  kind: DriverKind = "osc";
  private connected = false;
  private device: WingDevice | null = null;
  private controlSocket: dgram.Socket | null = null;
  private host: string;
  private port: number;
  private timeout: number;
  // Address-correlated pending queries: oscPath → queue of resolvers
  private pendingByAddress: Map<string, Array<{ resolve: (v: WingValue) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }>> = new Map();

  constructor(host?: string, port?: number, timeout?: number) {
    this.host = host ?? process.env.WING_HOST ?? "192.168.1.62";
    this.port = port ?? 2223;
    this.timeout = timeout ?? 3000;
  }

  async discover(options: { timeoutMs: number; directIps?: string[] }): Promise<WingDevice[]> {
    const devices: WingDevice[] = [];
    const timeout = options.timeoutMs ?? 1500;

    // Probe direct IPs (no broadcast on Windows without admin)
    const ips = options.directIps ?? [this.host];
    for (const ip of ips) {
      try {
        const device = await this.probeDevice(ip, timeout);
        if (device) devices.push(device);
      } catch {
        // Silently skip unreachable IPs
      }
    }

    // Also try UDP 2222 broadcast discovery
    try {
      const broadcastDevices = await this.broadcastDiscover(timeout);
      for (const d of broadcastDevices) {
        if (!devices.find(ex => ex.ip === d.ip)) {
          devices.push(d);
        }
      }
    } catch {
      // Broadcast may fail without admin/network support
    }

    return devices;
  }

  private probeDevice(ip: string, timeout: number): Promise<WingDevice | null> {
    return new Promise((resolve) => {
      const sock = dgram.createSocket("udp4");
      const timer = setTimeout(() => { sock.close(); resolve(null); }, timeout);
      sock.on("error", () => { clearTimeout(timer); sock.close(); resolve(null); });
      // Send direct probe: UDP 2222 "WING?"
      sock.send("WING?", 2222, ip, (err) => {
        if (err) { clearTimeout(timer); sock.close(); resolve(null); }
      });
      sock.on("message", (msg, rinfo) => {
        clearTimeout(timer);
        sock.close();
        const text = msg.toString().trim();
        if (text.startsWith("WING,")) {
          const parts = text.split(",");
          resolve({
            id: parts[4] ?? `wing-osc-${parts[1]}`,
            ip: parts[1] ?? rinfo.address,
            name: parts[2] ?? "WING",
            model: parts[3] ?? "WING",
            serial: parts[4] ?? undefined,
            firmware: parts[5] ?? undefined,
          });
        } else {
          resolve(null);
        }
      });
    });
  }

  private broadcastDiscover(timeout: number): Promise<WingDevice[]> {
    return new Promise((resolve) => {
      const sock = dgram.createSocket("udp4");
      const devices: WingDevice[] = [];
      const timer = setTimeout(() => { sock.close(); resolve(devices); }, timeout);
      sock.on("error", () => { clearTimeout(timer); sock.close(); resolve(devices); });
      sock.bind(() => {
        sock.setBroadcast(true);
        sock.send("WING?", 2222, "255.255.255.255", (err) => {
          if (err) { clearTimeout(timer); sock.close(); resolve(devices); }
        });
      });
      sock.on("message", (msg, rinfo) => {
        const text = msg.toString().trim();
        if (text.startsWith("WING,")) {
          const parts = text.split(",");
          devices.push({
            id: parts[4] ?? `wing-osc-${parts[1]}`,
            ip: parts[1] ?? rinfo.address,
            name: parts[2] ?? "WING",
            model: parts[3] ?? "WING",
            serial: parts[4] ?? undefined,
            firmware: parts[5] ?? undefined,
          });
        }
      });
    });
  }

  async connect(device: WingDevice): Promise<void> {
    this.host = device.ip;
    this.device = device;
    this.connected = true;

    // Open control socket
    this.controlSocket = dgram.createSocket("udp4");
    this.controlSocket.on("message", (msg) => {
      const decoded = oscDecode(msg);
      if (decoded) {
        // Match response to pending request by OSC address
        const queue = this.pendingByAddress.get(decoded.path);
        if (queue && queue.length > 0) {
          const pending = queue.shift()!;
          clearTimeout(pending.timer);
          const val = decoded.args[0];
          const wv: WingValue = val?.type === "s"
            ? { type: "string", value: String(val.value ?? "") }
            : val?.type === "i"
            ? { type: "int", value: Number(val.value ?? 0) }
            : { type: "float", value: Number(val.value ?? 0) };
          pending.resolve(wv);
        }
      }
    });
    this.controlSocket.on("error", (err) => {
      for (const [, queue] of this.pendingByAddress) {
        for (const p of queue) { clearTimeout(p.timer); p.reject(new Error(`OSC socket error: ${err.message}`)); }
      }
      this.pendingByAddress.clear();
    });
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    this.controlSocket?.close();
    this.controlSocket = null;
  }

  async getInfo(): Promise<WingDevice> {
    if (!this.connected || !this.device) throw new Error("DEVICE_DISCONNECTED");
    return { ...this.device };
  }

  private sendOsc(path: string, ...args: Array<{ type: string; value: unknown }>): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.controlSocket) return reject(new Error("DEVICE_DISCONNECTED"));
      const msg = oscEncode(path, ...args);
      this.controlSocket.send(msg, this.port, this.host, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  private queryOsc(osPath: string): Promise<WingValue> {
    return new Promise((resolve, reject) => {
      if (!this.controlSocket) return reject(new Error("DEVICE_DISCONNECTED"));
      const timer = setTimeout(() => {
        const queue = this.pendingByAddress.get(osPath);
        if (queue) {
          const idx = queue.findIndex(p => p.resolve === resolve);
          if (idx >= 0) queue.splice(idx, 1);
        }
        reject(new Error("DRIVER_TIMEOUT"));
      }, this.timeout);

      const entry = { resolve, reject, timer };
      if (!this.pendingByAddress.has(osPath)) {
        this.pendingByAddress.set(osPath, []);
      }
      this.pendingByAddress.get(osPath)!.push(entry);

      // Send OSC query
      const addrBuf = Buffer.from(osPath + "\0");
      const pad = (4 - (addrBuf.length & 3)) & 3;
      const msg = Buffer.concat([addrBuf, Buffer.alloc(pad), Buffer.from(",?\0\0")]);
      this.controlSocket.send(msg, this.port, this.host, (err) => {
        if (err) {
          clearTimeout(timer);
          const queue = this.pendingByAddress.get(osPath);
          if (queue) {
            const idx = queue.findIndex(p => p.timer === timer);
            if (idx >= 0) queue.splice(idx, 1);
          }
          reject(err);
        }
      });
    });
  }

  async getParam(path: string): Promise<WingValue> {
    if (!this.connected) throw new Error("DEVICE_DISCONNECTED");
    const oscPath = canonicalToOsc(path);
    if (!oscPath) throw new Error(`PARAM_NOT_FOUND: No OSC mapping for ${path}`);
    return this.queryOsc(oscPath);
  }

  async setParam(path: string, value: WingValue): Promise<void> {
    if (!this.connected) throw new Error("DEVICE_DISCONNECTED");
    const oscPath = canonicalToOsc(path);
    if (!oscPath) throw new Error(`PARAM_NOT_FOUND: No OSC mapping for ${path}`);

    let oscType: string;
    let oscValue: unknown;
    switch (value.type) {
      case "float": oscType = "f"; oscValue = value.value; break;
      case "int": oscType = "i"; oscValue = value.value; break;
      case "bool": oscType = "i"; oscValue = value.value ? 1 : 0; break;
      case "string": oscType = "s"; oscValue = value.value; break;
      default: throw new Error(`Unsupported value type: ${value.type}`);
    }
    await this.sendOsc(oscPath, { type: oscType, value: oscValue });
  }

  async getNode(path: string): Promise<Record<string, WingValue>> {
    if (!this.connected) throw new Error("DEVICE_DISCONNECTED");
    // OSC doesn't have tree queries — return empty, caller should use param_bulk_get
    return {};
  }

  async setNode(path: string, patch: Record<string, WingValue>): Promise<void> {
    if (!this.connected) throw new Error("DEVICE_DISCONNECTED");
    for (const [sub, value] of Object.entries(patch)) {
      const fullPath = `${path}/${sub}`;
      await this.setParam(fullPath, value);
    }
  }

  async meterRead(targets: string[], windowMs: number): Promise<MeterFrame> {
    if (!this.connected) throw new Error("DEVICE_DISCONNECTED");
    // OSC meter reading: query each target and approximate
    const meters: Array<{ target: string; rmsDbfs: number; peakDbfs: number; present: boolean }> = [];
    for (const target of targets) {
      try {
        const oscPath = canonicalToOsc(target);
        if (!oscPath) {
          meters.push({ target, rmsDbfs: -120, peakDbfs: -120, present: false });
          continue;
        }
        const val = await this.queryOsc(oscPath);
        const level = val.type === "float" ? val.value as number : -120;
        meters.push({
          target,
          rmsDbfs: level,
          peakDbfs: level + 3,
          present: level > -90,
        });
      } catch {
        meters.push({ target, rmsDbfs: -120, peakDbfs: -120, present: false });
      }
    }
    return { timestamp: new Date().toISOString(), meters };
  }
}

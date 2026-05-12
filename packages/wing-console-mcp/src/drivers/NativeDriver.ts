/**
 * NativeDriver — libwing Native Protocol driver via Rust sidecar.
 *
 * PRIMARY driver for Behringer WING communication.
 * Communicates with the wing-native-sidecar Rust process via JSON-RPC over stdin/stdout.
 *
 * The Rust sidecar wraps libwing (or direct Native TCP protocol) and exposes:
 * - discover: UDP 2222 broadcast "WING?" → parse response
 * - connect: TCP connection to WING Native port
 * - getParam/setParam: Native protocol get/set
 * - getNode/setNode: tree navigation
 * - meterRead: meter subscription stream
 *
 * Architecture:
 *   TypeScript (this file) → JSON-RPC stdio → Rust sidecar → libwing → WING
 *
 * Fallback: OscDriver when sidecar is unavailable.
 * Testing: FakeWingDriver for CI/development.
 */

import { WingDriver, WingDevice, WingValue, MeterFrame, DriverKind } from "./WingDriver.js";

export class NativeDriver implements WingDriver {
  kind: DriverKind = "native";

  private connected = false;
  private device: WingDevice | null = null;
  private sidecarProcess: any = null;

  constructor(private sidecarCommand: string = "wing-native-sidecar") {}

  async discover(options: { timeoutMs: number; directIps?: string[] }): Promise<WingDevice[]> {
    // Delegate to sidecar: {"jsonrpc":"2.0","method":"discover","params":{"timeout_ms":1500}}
    // Response: {"jsonrpc":"2.0","result":{"devices":[...]}}
    // STUB: Returns empty until sidecar is implemented
    const devices: WingDevice[] = [];
    if (options.directIps) {
      for (const ip of options.directIps) {
        devices.push({
          id: `wing-native-${ip.replace(/\./g, "-")}`,
          ip,
          name: `WING @ ${ip}`,
          model: "WING",
        });
      }
    }
    return devices;
  }

  async connect(device: WingDevice): Promise<void> {
    this.device = device;
    this.connected = true;
    // TODO: Spawn sidecar process: spawn(this.sidecarCommand, [device.ip])
    // TODO: Establish JSON-RPC handshake
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    // TODO: Send shutdown to sidecar, kill process
  }

  async getInfo(): Promise<WingDevice> {
    if (!this.connected || !this.device) throw new Error("DEVICE_DISCONNECTED");
    return { ...this.device };
  }

  async getParam(path: string): Promise<WingValue> {
    if (!this.connected) throw new Error("DEVICE_DISCONNECTED");
    // TODO: JSON-RPC call to sidecar: {"method":"get_param","params":{"path":"..."}}
    throw new Error("PROTOCOL_ERROR: Native driver is a stub. Build the Rust sidecar first.");
  }

  async setParam(path: string, value: WingValue): Promise<void> {
    if (!this.connected) throw new Error("DEVICE_DISCONNECTED");
    // TODO: JSON-RPC call to sidecar: {"method":"set_param","params":{"path":"...","value":{...}}}
    throw new Error("PROTOCOL_ERROR: Native driver is a stub. Build the Rust sidecar first.");
  }

  async getNode(path: string): Promise<Record<string, WingValue>> {
    if (!this.connected) throw new Error("DEVICE_DISCONNECTED");
    throw new Error("PROTOCOL_ERROR: Native driver is a stub. Build the Rust sidecar first.");
  }

  async setNode(path: string, patch: Record<string, WingValue>): Promise<void> {
    if (!this.connected) throw new Error("DEVICE_DISCONNECTED");
    throw new Error("PROTOCOL_ERROR: Native driver is a stub. Build the Rust sidecar first.");
  }

  async meterRead(targets: string[], windowMs: number): Promise<MeterFrame> {
    if (!this.connected) throw new Error("DEVICE_DISCONNECTED");
    throw new Error("PROTOCOL_ERROR: Native driver is a stub. Build the Rust sidecar first.");
  }
}

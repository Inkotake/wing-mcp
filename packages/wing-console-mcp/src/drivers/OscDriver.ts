/**
 * OscDriver — Open Sound Control driver for Behringer WING.
 *
 * Communicates via UDP port 2223 using OSC 1.0/1.1 protocol.
 * This is a stub implementation. Real implementation requires:
 * - UDP socket management (dgram)
 * - OSC message codec (osc-min or similar)
 * - WING OSC address space mapping
 * - Timeout/retry logic
 * - Readback verification
 *
 * Enabled only when WING_DRIVER=osc.
 */

import { WingDriver, WingDevice, WingValue, MeterFrame, DriverKind } from "./WingDriver.js";

export class OscDriver implements WingDriver {
  kind: DriverKind = "osc";

  private connected = false;
  private device: WingDevice | null = null;

  constructor(private host: string = "192.168.1.62", private port: number = 2223) {}

  async discover(options: { timeoutMs: number; directIps?: string[] }): Promise<WingDevice[]> {
    // TODO: UDP broadcast on port 2222, send "WING?" and parse "WING,<ip>,<name>,<model>,<serial>,<firmware>"
    // For now, return direct IP probe results
    const devices: WingDevice[] = [];
    if (options.directIps) {
      for (const ip of options.directIps) {
        devices.push({
          id: `wing-osc-${ip.replace(/\./g, "-")}`,
          ip,
          name: `WING @ ${ip}`,
          model: "WING",
        });
      }
    }
    return devices;
  }

  async connect(device: WingDevice): Promise<void> {
    this.host = device.ip;
    this.device = device;
    this.connected = true;
    // TODO: Establish UDP socket, send initial status query
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    // TODO: Close UDP socket
  }

  async getInfo(): Promise<WingDevice> {
    if (!this.connected || !this.device) throw new Error("DEVICE_DISCONNECTED");
    return { ...this.device };
  }

  async getParam(path: string): Promise<WingValue> {
    if (!this.connected) throw new Error("DEVICE_DISCONNECTED");
    // TODO: Send OSC query, await response, parse value
    throw new Error("PROTOCOL_ERROR: OSC driver is a stub. Use fake driver for testing.");
  }

  async setParam(path: string, value: WingValue): Promise<void> {
    if (!this.connected) throw new Error("DEVICE_DISCONNECTED");
    // TODO: Send OSC set message, await ack
    throw new Error("PROTOCOL_ERROR: OSC driver is a stub. Use fake driver for testing.");
  }

  async getNode(path: string): Promise<Record<string, WingValue>> {
    if (!this.connected) throw new Error("DEVICE_DISCONNECTED");
    // TODO: Bulk OSC query
    throw new Error("PROTOCOL_ERROR: OSC driver is a stub. Use fake driver for testing.");
  }

  async setNode(path: string, patch: Record<string, WingValue>): Promise<void> {
    if (!this.connected) throw new Error("DEVICE_DISCONNECTED");
    // TODO: Bulk OSC set
    throw new Error("PROTOCOL_ERROR: OSC driver is a stub. Use fake driver for testing.");
  }

  async meterRead(targets: string[], windowMs: number): Promise<MeterFrame> {
    if (!this.connected) throw new Error("DEVICE_DISCONNECTED");
    // TODO: Subscribe to meter stream or poll
    throw new Error("PROTOCOL_ERROR: OSC driver is a stub. Use fake driver for testing.");
  }
}

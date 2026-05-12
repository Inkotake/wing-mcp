export type DriverKind = "native" | "osc" | "wapi" | "fake";

export interface WingDevice {
  id: string;
  ip: string;
  name?: string;
  model?: string;
  serial?: string;
  firmware?: string;
}

export type WingValue =
  | { type: "bool"; value: boolean }
  | { type: "int"; value: number }
  | { type: "float"; value: number; unit?: string }
  | { type: "string"; value: string }
  | { type: "node"; value: Record<string, unknown> };

export interface MeterFrame {
  timestamp: string;
  meters: Array<{ target: string; rmsDbfs: number; peakDbfs: number; present: boolean }>;
}

export interface WingDriver {
  kind: DriverKind;
  discover(options: { timeoutMs: number; directIps?: string[] }): Promise<WingDevice[]>;
  connect(device: WingDevice): Promise<void>;
  disconnect(): Promise<void>;
  getInfo(): Promise<WingDevice>;
  getParam(path: string): Promise<WingValue>;
  setParam(path: string, value: WingValue): Promise<void>;
  getNode(path: string): Promise<Record<string, WingValue>>;
  setNode(path: string, patch: Record<string, WingValue>): Promise<void>;
  meterRead(targets: string[], windowMs: number): Promise<MeterFrame>;
}

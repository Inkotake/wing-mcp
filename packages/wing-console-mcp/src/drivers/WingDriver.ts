import { DriverKind, WingDevice, WingValue, MeterFrame } from "../types.js";

export { DriverKind, WingDevice, WingValue, MeterFrame };

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

/**
 * FakeWingDriver - A fully simulated WING console for development and CI testing.
 * Supports parameter tree, meter simulation, and fault injection.
 */
export class FakeWingDriver implements WingDriver {
  kind: DriverKind = "fake";

  private connected = false;
  private device: WingDevice;
  private params: Map<string, WingValue> = new Map();
  private faultConfig: {
    timeoutProbability: number;
    disconnectProbability: number;
    readbackMismatchProbability: number;
  } = { timeoutProbability: 0, disconnectProbability: 0, readbackMismatchProbability: 0 };

  constructor() {
    this.device = {
      id: "fake-wing-001",
      ip: "127.0.0.1",
      name: "Fake WING",
      model: "WING",
      serial: "FAKE-SN-001",
      firmware: "3.0.0-fake",
    };
    this.initParams();
  }

  private initParams() {
    // Initialize a realistic parameter tree
    const baseParams: Array<[string, WingValue]> = [];

    const add = (pairs: Array<[string, WingValue]>) => {
      for (const [p, v] of pairs) baseParams.push([p, v]);
    };

    // Device
    add([
      ["/device/name", { type: "string", value: "Fake WING" }],
      ["/device/model", { type: "string", value: "WING" }],
      ["/device/firmware", { type: "string", value: "3.0.0" }],
      ["/device/serial", { type: "string", value: "FAKE-SN-001" }],
    ]);

    // Channels (48 channels)
    for (let ch = 1; ch <= 48; ch++) add(this.makeChannelParams(ch));

    // Main LR
    add([
      ["/main/lr/fader", { type: "float", value: 0.0, unit: "dB" }],
      ["/main/lr/mute", { type: "bool", value: false }],
      ["/main/lr/name", { type: "string", value: "Main LR" }],
    ]);

    // Buses
    for (let b = 1; b <= 16; b++) add(this.makeBusParams(b));

    // Headamp for inputs
    for (let i = 1; i <= 48; i++) {
      add([
        [`/headamp/local/${i}/gain`, { type: "float", value: 30.0, unit: "dB" }],
        [`/headamp/local/${i}/phantom`, { type: "bool", value: false }],
      ]);
    }

    // Scenes, DCA, Mute groups, Matrix, FX, Recorder
    add([
      ["/scene/current", { type: "int", value: 0 }],
      ["/scene/0/name", { type: "string", value: "Scene 0 - Empty" }],
    ]);
    // DCA 1-8
    for (let d = 1; d <= 8; d++) {
      add([
        [`/dca/${d}/name`, { type: "string", value: `DCA ${d}` }],
        [`/dca/${d}/mute`, { type: "bool", value: false }],
        [`/dca/${d}/fader`, { type: "float", value: 0.0, unit: "dB" }],
      ]);
    }
    // Mute Groups 1-6
    for (let g = 1; g <= 6; g++) {
      add([[`/mutegroup/${g}/mute`, { type: "bool", value: false }]]);
    }
    // Matrix 1-8
    for (let m = 1; m <= 8; m++) {
      add([
        [`/mtx/${m}/name`, { type: "string", value: `Matrix ${m}` }],
        [`/mtx/${m}/mute`, { type: "bool", value: false }],
        [`/mtx/${m}/fader`, { type: "float", value: 0.0, unit: "dB" }],
      ]);
    }
    // FX slots 1-8
    const fxModels = ["Hall Reverb", "Stereo Delay", "Plate Reverb", "Chorus", "Flanger", "Phaser", "Tremolo", "DeEsser"];
    for (let f = 1; f <= 8; f++) {
      add([
        [`/fx/${f}/model`, { type: "string", value: fxModels[f - 1] }],
        [`/fx/${f}/on`, { type: "bool", value: f <= 2 }],
      ]);
    }
    // Recorder
    add([
      ["/recorder/transport", { type: "string", value: "stopped" }],
    ]);

    for (const [path, value] of baseParams) {
      this.params.set(path, value);
    }
  }

  private makeChannelParams(ch: number): Array<[string, WingValue]> {
    return [
      [`/ch/${ch}/name`, { type: "string", value: `CH ${ch}` }],
      [`/ch/${ch}/mute`, { type: "bool", value: false }],
      [`/ch/${ch}/fader`, { type: "float", value: 0.0, unit: "dB" }],
      [`/ch/${ch}/pan`, { type: "float", value: 0.0, unit: "%" }],
      [`/ch/${ch}/source`, { type: "string", value: `Local ${ch}` }],
      // EQ - 4-band
      [`/ch/${ch}/eq/on`, { type: "bool", value: true }],
      [`/ch/${ch}/eq/high/gain`, { type: "float", value: 0.0, unit: "dB" }],
      [`/ch/${ch}/eq/high/freq`, { type: "float", value: 8000, unit: "Hz" }],
      [`/ch/${ch}/eq/high/q`, { type: "float", value: 0.7 }],
      [`/ch/${ch}/eq/hi_mid/gain`, { type: "float", value: 0.0, unit: "dB" }],
      [`/ch/${ch}/eq/hi_mid/freq`, { type: "float", value: 2500, unit: "Hz" }],
      [`/ch/${ch}/eq/hi_mid/q`, { type: "float", value: 1.0 }],
      [`/ch/${ch}/eq/lo_mid/gain`, { type: "float", value: 0.0, unit: "dB" }],
      [`/ch/${ch}/eq/lo_mid/freq`, { type: "float", value: 400, unit: "Hz" }],
      [`/ch/${ch}/eq/lo_mid/q`, { type: "float", value: 1.0 }],
      [`/ch/${ch}/eq/low/gain`, { type: "float", value: 0.0, unit: "dB" }],
      [`/ch/${ch}/eq/low/freq`, { type: "float", value: 100, unit: "Hz" }],
      [`/ch/${ch}/eq/low/q`, { type: "float", value: 0.7 }],
      // Gate
      [`/ch/${ch}/gate/on`, { type: "bool", value: false }],
      [`/ch/${ch}/gate/threshold`, { type: "float", value: -80.0, unit: "dB" }],
      [`/ch/${ch}/gate/range`, { type: "float", value: 30.0, unit: "dB" }],
      [`/ch/${ch}/gate/attack`, { type: "float", value: 1.0, unit: "ms" }],
      [`/ch/${ch}/gate/hold`, { type: "float", value: 50.0, unit: "ms" }],
      [`/ch/${ch}/gate/release`, { type: "float", value: 100.0, unit: "ms" }],
      // Compressor
      [`/ch/${ch}/comp/on`, { type: "bool", value: false }],
      [`/ch/${ch}/comp/threshold`, { type: "float", value: 0.0, unit: "dB" }],
      [`/ch/${ch}/comp/ratio`, { type: "float", value: 3.0, unit: ":1" }],
      [`/ch/${ch}/comp/attack`, { type: "float", value: 10.0, unit: "ms" }],
      [`/ch/${ch}/comp/release`, { type: "float", value: 100.0, unit: "ms" }],
      [`/ch/${ch}/comp/gain`, { type: "float", value: 0.0, unit: "dB" }],
      // Sends to all 16 buses
      [`/ch/${ch}/send/1/level`, { type: "float", value: -99.0, unit: "dB" }],
      [`/ch/${ch}/send/2/level`, { type: "float", value: -99.0, unit: "dB" }],
      [`/ch/${ch}/send/3/level`, { type: "float", value: -99.0, unit: "dB" }],
      [`/ch/${ch}/send/4/level`, { type: "float", value: -99.0, unit: "dB" }],
      [`/ch/${ch}/send/5/level`, { type: "float", value: -99.0, unit: "dB" }],
      [`/ch/${ch}/send/6/level`, { type: "float", value: -99.0, unit: "dB" }],
      [`/ch/${ch}/send/7/level`, { type: "float", value: -99.0, unit: "dB" }],
      [`/ch/${ch}/send/8/level`, { type: "float", value: -99.0, unit: "dB" }],
      [`/ch/${ch}/send/9/level`, { type: "float", value: -99.0, unit: "dB" }],
      [`/ch/${ch}/send/10/level`, { type: "float", value: -99.0, unit: "dB" }],
      [`/ch/${ch}/send/11/level`, { type: "float", value: -99.0, unit: "dB" }],
      [`/ch/${ch}/send/12/level`, { type: "float", value: -99.0, unit: "dB" }],
      [`/ch/${ch}/send/13/level`, { type: "float", value: -99.0, unit: "dB" }],
      [`/ch/${ch}/send/14/level`, { type: "float", value: -99.0, unit: "dB" }],
      [`/ch/${ch}/send/15/level`, { type: "float", value: -99.0, unit: "dB" }],
      [`/ch/${ch}/send/16/level`, { type: "float", value: -99.0, unit: "dB" }],
    ];
  }

  private makeBusParams(bus: number): Array<[string, WingValue]> {
    return [
      [`/bus/${bus}/name`, { type: "string", value: `Bus ${bus}` }],
      [`/bus/${bus}/mute`, { type: "bool", value: false }],
      [`/bus/${bus}/fader`, { type: "float", value: 0.0, unit: "dB" }],
    ];
  }

  // Fault injection
  setFaultConfig(config: Partial<typeof this.faultConfig>) {
    Object.assign(this.faultConfig, config);
  }

  private maybeInjectFault() {
    if (Math.random() < this.faultConfig.disconnectProbability) {
      this.connected = false;
      throw new Error("DRIVER_TIMEOUT: Simulated disconnect");
    }
    if (Math.random() < this.faultConfig.timeoutProbability) {
      throw new Error("DRIVER_TIMEOUT: Simulated timeout");
    }
  }

  async discover(options: {
    timeoutMs: number;
    directIps?: string[];
  }): Promise<WingDevice[]> {
    return [this.device];
  }

  async connect(device: WingDevice): Promise<void> {
    this.connected = true;
    this.device = { ...this.device, ...device };
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }

  async getInfo(): Promise<WingDevice> {
    if (!this.connected) throw new Error("DEVICE_DISCONNECTED");
    return { ...this.device };
  }

  async getParam(path: string): Promise<WingValue> {
    if (!this.connected) throw new Error("DEVICE_DISCONNECTED");
    this.maybeInjectFault();
    const value = this.params.get(path);
    if (value === undefined) throw new Error(`PARAM_NOT_FOUND: ${path}`);
    return { ...value };
  }

  async setParam(path: string, value: WingValue): Promise<void> {
    if (!this.connected) throw new Error("DEVICE_DISCONNECTED");
    this.maybeInjectFault();
    if (Math.random() < this.faultConfig.readbackMismatchProbability) {
      // Simulate a mismatch by not setting
      return;
    }
    this.params.set(path, { ...value });
  }

  async getNode(path: string): Promise<Record<string, WingValue>> {
    if (!this.connected) throw new Error("DEVICE_DISCONNECTED");
    this.maybeInjectFault();
    const result: Record<string, WingValue> = {};
    for (const [key, value] of this.params) {
      if (key.startsWith(path)) {
        result[key] = { ...value };
      }
    }
    return result;
  }

  async setNode(path: string, patch: Record<string, WingValue>): Promise<void> {
    if (!this.connected) throw new Error("DEVICE_DISCONNECTED");
    this.maybeInjectFault();
    for (const [sub, value] of Object.entries(patch)) {
      const fullPath = `${path}/${sub}`;
      this.params.set(fullPath, { ...value });
    }
  }

  async meterRead(targets: string[], windowMs: number): Promise<MeterFrame> {
    if (!this.connected) throw new Error("DEVICE_DISCONNECTED");
    this.maybeInjectFault();
    const meters = targets.map((target) => {
      const param = this.params.get(target);
      const hasSignal =
        param?.type === "float" && param.value > -90 && !this.params.get(target.replace(/\/fader$/, "/mute"))?.value;
      return {
        target,
        rmsDbfs: hasSignal ? -18.0 + Math.random() * 6 : -120.0,
        peakDbfs: hasSignal ? -12.0 + Math.random() * 6 : -120.0,
        present: hasSignal ?? false,
      };
    });
    return { timestamp: new Date().toISOString(), meters };
  }
}

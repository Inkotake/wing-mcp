import { DriverKind, WingDevice, WingValue, MeterFrame } from "../types.js";

export type { DriverKind, WingDevice, WingValue, MeterFrame };

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
    add([["/scene/current", { type: "int", value: 0 }]]);
    for (let s = 0; s <= 9; s++) {
      add([
        [`/scene/${s}/name`, { type: "string", value: s === 0 ? "Scene 0 - Empty" : `Scene ${s}` }],
        [`/scene/${s}/recall`, { type: "int", value: 0 }],
      ]);
    }
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

    // Independent meter signal params (separate from fader/mute state)
    for (let ch = 1; ch <= 48; ch++) {
      add([
        [`/ch/${ch}/meter/input`, { type: "float", value: -18.0, unit: "dBFS" }],
        [`/ch/${ch}/meter/pre_fader`, { type: "float", value: -18.0, unit: "dBFS" }],
        [`/ch/${ch}/meter/post_fader`, { type: "float", value: -18.0, unit: "dBFS" }],
      ]);
    }
    for (let b = 1; b <= 16; b++) {
      add([
        [`/bus/${b}/meter/post_fader`, { type: "float", value: -18.0, unit: "dBFS" }],
      ]);
    }
    add([
      ["/main/lr/meter/left", { type: "float", value: -18.0, unit: "dBFS" }],
      ["/main/lr/meter/right", { type: "float", value: -18.0, unit: "dBFS" }],
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
      return;
    }
    this.params.set(path, { ...value });

    // Signal propagation: update dependent meters when state changes
    if (path.match(/^\/(ch\/\d+|bus\/\d+|main\/lr)\/(mute|fader|source|gate\/.*)$/)) {
      const target = path.replace(/\/(mute|fader|source|gate\/.*)$/, "");
      this.propagateMeter(target);
    }
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

  // Fault profiles for simulating specific no-sound scenarios
  private activeProfile: string = "normal";

  setProfile(profile: string): void {
    this.activeProfile = profile;
    switch (profile) {
      case "no_input_ch1":
        // State-based: remove source to simulate unplugged cable
        this.params.set("/ch/1/source", { type: "string", value: "None" });
        this.propagateMeter("/ch/1");
        break;
      case "muted_ch1":
        this.params.set("/ch/1/mute", { type: "bool", value: true });
        this.propagateMeter("/ch/1");
        break;
      case "fader_down_ch1":
        this.params.set("/ch/1/fader", { type: "float", value: -90.0, unit: "dB" });
        this.propagateMeter("/ch/1");
        break;
      case "gate_closed_ch1":
        this.params.set("/ch/1/gate/threshold", { type: "float", value: 10.0, unit: "dB" });
        this.params.set("/ch/1/gate/on", { type: "bool", value: true });
        this.propagateMeter("/ch/1");
        break;
      case "main_muted":
        this.params.set("/main/lr/mute", { type: "bool", value: true });
        this.propagateMeter("/main/lr");
        break;
      case "routing_wrong":
        this.params.set("/ch/1/source", { type: "string", value: "None" });
        this.params.set("/ch/1/meter/input", { type: "float", value: -120.0, unit: "dBFS" });
        this.params.set("/ch/1/meter/pre_fader", { type: "float", value: -120.0, unit: "dBFS" });
        this.params.set("/ch/1/meter/post_fader", { type: "float", value: -120.0, unit: "dBFS" });
        break;
      case "main_fader_down":
        this.params.set("/main/lr/fader", { type: "float", value: -90.0, unit: "dB" });
        this.propagateMeter("/main/lr");
        break;
      case "dca_muted_ch1":
        this.params.set("/dca/1/mute", { type: "bool", value: true });
        break;
      case "bus_muted_bus1":
        this.params.set("/bus/1/mute", { type: "bool", value: true });
        this.propagateMeter("/bus/1");
        break;
      case "output_patch_wrong":
        // Simulate wrong output routing by disconnecting Main LR from outputs
        this.params.set("/main/lr/mute", { type: "bool", value: true });
        this.propagateMeter("/main/lr");
        break;
      case "normal":
      default:
        break;
    }
  }

  // dB helpers for signal summation
  private static readonly NEG_INF = -120;
  private sumDb(levels: number[]): number {
    const active = levels.filter(l => l > FakeWingDriver.NEG_INF + 1);
    if (active.length === 0) return FakeWingDriver.NEG_INF;
    // Proper dB summation: 10*log10(sum(10^(dB/10)))
    const sumLinear = active.reduce((sum, db) => sum + Math.pow(10, db / 10), 0);
    return 10 * Math.log10(Math.max(sumLinear, 1e-12));
  }

  /** Propagate meter changes based on mixer state changes */
  private propagateMeter(target: string): void {
    const chMatch = target.match(/^\/ch\/(\d+)$/);
    if (chMatch) {
      const ch = parseInt(chMatch[1]);
      const input = this.params.get(`/ch/${ch}/meter/input`);
      const mute = this.params.get(`/ch/${ch}/mute`);
      const fader = this.params.get(`/ch/${ch}/fader`);
      const gateOn = this.params.get(`/ch/${ch}/gate/on`);
      const gateThresh = this.params.get(`/ch/${ch}/gate/threshold`);
      const source = this.params.get(`/ch/${ch}/source`);

      const hasSource = source?.type === "string" && source.value !== "None";
      const inputLevel = (input?.type === "float" ? input.value as number : -18);
      const isMuted = mute?.type === "bool" && mute.value === true;
      const faderDb = fader?.type === "float" ? fader.value as number : 0;
      const gateActive = gateOn?.type === "bool" && gateOn.value === true;
      const gateDb = gateThresh?.type === "float" ? gateThresh.value as number : -80;

      const effectiveInput = hasSource ? inputLevel : -120;
      const gateClamped = gateActive && effectiveInput < gateDb;
      const preFader = gateClamped ? -120 : effectiveInput;
      const postFader = isMuted ? -120 : (faderDb < -89 ? -120 : preFader + faderDb);

      this.params.set(`/ch/${ch}/meter/input`, { type: "float", value: effectiveInput, unit: "dBFS" });
      this.params.set(`/ch/${ch}/meter/pre_fader`, { type: "float", value: preFader, unit: "dBFS" });
      this.params.set(`/ch/${ch}/meter/post_fader`, { type: "float", value: postFader, unit: "dBFS" });
    }

    // Main LR propagation
    if (target === "/main/lr") {
      const mainMute = this.params.get("/main/lr/mute");
      const isMuted = mainMute?.type === "bool" && mainMute.value === true;

      // Sum all channel post-fader contributions using proper dB math
      const channelLevels: number[] = [];
      for (let ch = 1; ch <= 48; ch++) {
        const postMeter = this.params.get(`/ch/${ch}/meter/post_fader`);
        if (postMeter?.type === "float") {
          channelLevels.push(postMeter.value as number);
        }
      }
      const summedDb = this.sumDb(channelLevels);

      const mainOut = isMuted ? -120 : summedDb;
      this.params.set("/main/lr/meter/left", { type: "float", value: mainOut, unit: "dBFS" });
      this.params.set("/main/lr/meter/right", { type: "float", value: mainOut, unit: "dBFS" });
    }

    // Bus propagation: compute bus post-fader from channel sends
    const busMatch = target.match(/^\/bus\/(\d+)$/);
    if (busMatch) {
      const b = parseInt(busMatch[1]);
      const busMute = this.params.get(`/bus/${b}/mute`);
      const busFader = this.params.get(`/bus/${b}/fader`);
      const isBusMuted = busMute?.type === "bool" && busMute.value === true;
      const busFaderDb = busFader?.type === "float" ? busFader.value as number : 0;

      // Sum all channel sends to this bus using proper dB math
      const sendContribs: number[] = [];
      for (let ch = 1; ch <= 48; ch++) {
        const chMute = this.params.get(`/ch/${ch}/mute`);
        if (chMute?.type === "bool" && chMute.value === true) continue;
        const chPost = this.params.get(`/ch/${ch}/meter/post_fader`);
        const sendLevel = this.params.get(`/ch/${ch}/send/${b}/level`);
        if (chPost?.type === "float" && sendLevel?.type === "float") {
          const postDb = chPost.value as number;
          const sendDb = sendLevel.value as number;
          if (postDb > FakeWingDriver.NEG_INF + 1 && sendDb > FakeWingDriver.NEG_INF + 1) {
            sendContribs.push(postDb + sendDb);
          }
        }
      }
      const summedSend = this.sumDb(sendContribs);

      const busOut = isBusMuted ? -120 : (busFaderDb < -89 ? -120 : summedSend + busFaderDb);
      this.params.set(`/bus/${b}/meter/post_fader`, { type: "float", value: busOut, unit: "dBFS" });
    }
  }

  getActiveProfile(): string {
    return this.activeProfile;
  }

  async meterRead(targets: string[], windowMs: number): Promise<MeterFrame> {
    if (!this.connected) throw new Error("DEVICE_DISCONNECTED");
    this.maybeInjectFault();
    const meters = targets.map((target) => {
      // Check for independent meter params first (input/pre/post levels)
      let meterPath = target;
      // Map fader paths to their corresponding meter paths
      if (target.match(/^\/ch\/\d+\/fader$/)) {
        meterPath = target.replace(/\/fader$/, "/meter/post_fader");
      } else if (target.match(/^\/bus\/\d+\/fader$/)) {
        meterPath = target.replace(/\/fader$/, "/meter/post_fader");
      } else if (target === "/main/lr/fader") {
        meterPath = "/main/lr/meter/left";
      }
      const meterParam = this.params.get(meterPath);
      // If meter param exists, use it; otherwise fall back to fader-based computation
      if (meterParam?.type === "float") {
        const level = (meterParam.value as number);
        const hasSignal = level > -90;
        return {
          target,
          rmsDbfs: hasSignal ? level + (Math.random() - 0.5) * 3 : -120.0,
          peakDbfs: hasSignal ? level + 3 + Math.random() * 3 : -120.0,
          present: hasSignal,
        };
      }
      // Fallback: use fader param value
      const param = this.params.get(target);
      const hasSignal = param?.type === "float" && (param.value as number) > -90;
      return {
        target,
        rmsDbfs: hasSignal ? -18.0 + Math.random() * 6 : -120.0,
        peakDbfs: hasSignal ? -12.0 + Math.random() * 6 : -120.0,
        present: hasSignal,
      };
    });
    return { timestamp: new Date().toISOString(), meters };
  }
}

/**
 * FakeSignalGraph — Dynamic signal propagation model for FakeWingDriver.
 *
 * Separated from FakeWingDriver for testability and clarity.
 * Models: source → headamp → gate → mute → DCA → mute group → fader → main/bus → output
 */
import { WingValue } from "../types.js";

export const NEG_INF = -120;

interface ParamStore {
  get(path: string): WingValue | undefined;
  set(path: string, value: WingValue): void;
}

export class FakeSignalGraph {
  constructor(private params: ParamStore) {}

  /** dB summation: 10*log10(Σ 10^(dB/10)) */
  sumDb(levels: number[]): number {
    const active = levels.filter(l => l > NEG_INF + 1);
    if (active.length === 0) return NEG_INF;
    const sumLinear = active.reduce((sum, db) => sum + Math.pow(10, db / 10), 0);
    return 10 * Math.log10(Math.max(sumLinear, 1e-12));
  }

  /** Full recompute: all channels → all buses → main LR */
  recomputeAll(): void {
    for (let ch = 1; ch <= 48; ch++) this.computeChannel(ch);
    for (let b = 1; b <= 16; b++) this.computeBus(b);
    this.computeMain();
  }

  /** Compute meters for a single channel */
  computeChannel(ch: number): void {
    const source = this.params.get(`/ch/${ch}/source`);
    const inputMeter = this.params.get(`/ch/${ch}/meter/input`);
    const mute = this.params.get(`/ch/${ch}/mute`);
    const fader = this.params.get(`/ch/${ch}/fader`);
    const gateOn = this.params.get(`/ch/${ch}/gate/on`);
    const gateThresh = this.params.get(`/ch/${ch}/gate/threshold`);

    const hasSource = source?.type === "string" && source.value !== "None";
    const inputLevel = inputMeter?.type === "float" ? (inputMeter.value as number) : -18;
    const isMuted = mute?.type === "bool" && mute.value === true;
    const faderDb = fader?.type === "float" ? (fader.value as number) : 0;
    const gateActive = gateOn?.type === "bool" && gateOn.value === true;
    const gateDb = gateThresh?.type === "float" ? (gateThresh.value as number) : -80;

    const effectiveInput = hasSource ? inputLevel : NEG_INF;
    const gateClamped = gateActive && effectiveInput < gateDb;
    const preFader = gateClamped ? NEG_INF : effectiveInput;

    // DCA mute check
    let dcaMuted = false;
    for (let d = 1; d <= 8; d++) {
      const assign = this.params.get(`/ch/${ch}/dca/${d}/assign`);
      const dcaMute = this.params.get(`/dca/${d}/mute`);
      if (assign?.type === "bool" && assign.value === true && dcaMute?.type === "bool" && dcaMute.value === true) {
        dcaMuted = true; break;
      }
    }
    // Mute group check
    let mgActive = false;
    for (let g = 1; g <= 6; g++) {
      const assign = this.params.get(`/ch/${ch}/mutegroup/${g}/assign`);
      const mgMute = this.params.get(`/mutegroup/${g}/mute`);
      if (assign?.type === "bool" && assign.value === true && mgMute?.type === "bool" && mgMute.value === true) {
        mgActive = true; break;
      }
    }

    const effectiveMuted = isMuted || dcaMuted || mgActive;
    const postFader = effectiveMuted ? NEG_INF : (faderDb < -89 ? NEG_INF : preFader + faderDb);

    this.params.set(`/ch/${ch}/meter/input`, { type: "float", value: effectiveInput, unit: "dBFS" });
    this.params.set(`/ch/${ch}/meter/pre_fader`, { type: "float", value: preFader, unit: "dBFS" });
    this.params.set(`/ch/${ch}/meter/post_fader`, { type: "float", value: postFader, unit: "dBFS" });
  }

  /** Compute bus meter */
  computeBus(b: number): void {
    const busMute = this.params.get(`/bus/${b}/mute`);
    const busFader = this.params.get(`/bus/${b}/fader`);
    const isBusMuted = busMute?.type === "bool" && busMute.value === true;
    const busFaderDb = busFader?.type === "float" ? (busFader.value as number) : 0;

    const sendContribs: number[] = [];
    for (let ch = 1; ch <= 48; ch++) {
      const sendOn = this.params.get(`/ch/${ch}/send/${b}/on`);
      if (sendOn?.type === "bool" && sendOn.value === false) continue;
      const chMute = this.params.get(`/ch/${ch}/mute`);
      if (chMute?.type === "bool" && chMute.value === true) continue;
      const chPost = this.params.get(`/ch/${ch}/meter/post_fader`);
      const sendLevel = this.params.get(`/ch/${ch}/send/${b}/level`);
      if (chPost?.type === "float" && sendLevel?.type === "float") {
        const postDb = chPost.value as number;
        const sendDb = sendLevel.value as number;
        if (postDb > NEG_INF + 1 && sendDb > NEG_INF + 1) {
          sendContribs.push(postDb + sendDb);
        }
      }
    }
    const summed = this.sumDb(sendContribs);
    const busOut = isBusMuted ? NEG_INF : (busFaderDb < -89 ? NEG_INF : summed + busFaderDb);
    this.params.set(`/bus/${b}/meter/post_fader`, { type: "float", value: busOut, unit: "dBFS" });
  }

  /** Compute Main LR meter */
  computeMain(): void {
    const mainMute = this.params.get("/main/lr/mute");
    const mainFader = this.params.get("/main/lr/fader");
    const isMuted = mainMute?.type === "bool" && mainMute.value === true;
    const mainFaderDb = mainFader?.type === "float" ? (mainFader.value as number) : 0;

    const channelLevels: number[] = [];
    for (let ch = 1; ch <= 48; ch++) {
      const mainAssign = this.params.get(`/ch/${ch}/main/assign`);
      if (mainAssign?.type === "bool" && mainAssign.value === false) continue;
      const postMeter = this.params.get(`/ch/${ch}/meter/post_fader`);
      if (postMeter?.type === "float") channelLevels.push(postMeter.value as number);
    }
    const summed = this.sumDb(channelLevels);
    const mainOut = isMuted || mainFaderDb < -89 ? NEG_INF : summed + mainFaderDb;
    this.params.set("/main/lr/meter/left", { type: "float", value: mainOut, unit: "dBFS" });
    this.params.set("/main/lr/meter/right", { type: "float", value: mainOut, unit: "dBFS" });
  }
}

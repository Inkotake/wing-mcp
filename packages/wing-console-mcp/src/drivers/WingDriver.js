/**
 * FakeWingDriver - A fully simulated WING console for development and CI testing.
 * Supports parameter tree, meter simulation, and fault injection.
 */
export class FakeWingDriver {
    kind = "fake";
    connected = false;
    device;
    params = new Map();
    faultConfig = { timeoutProbability: 0, disconnectProbability: 0, readbackMismatchProbability: 0 };
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
    initParams() {
        // Initialize a realistic parameter tree
        const baseParams = [
            // Device
            ["/device/name", { type: "string", value: "Fake WING" }],
            ["/device/model", { type: "string", value: "WING" }],
            ["/device/firmware", { type: "string", value: "3.0.0" }],
            ["/device/serial", { type: "string", value: "FAKE-SN-001" }],
            // Channels (48 channels)
            ...this.makeChannelParams(1),
            ...this.makeChannelParams(2),
            ...this.makeChannelParams(3),
            ...this.makeChannelParams(4),
            ...this.makeChannelParams(8),
            ...this.makeChannelParams(16),
            ...this.makeChannelParams(24),
            ...this.makeChannelParams(32),
            ...this.makeChannelParams(40),
            ...this.makeChannelParams(48),
            // Main LR
            ["/main/lr/fader", { type: "float", value: 0.0, unit: "dB" }],
            ["/main/lr/mute", { type: "bool", value: false }],
            ["/main/lr/name", { type: "string", value: "Main LR" }],
            // Buses
            ...this.makeBusParams(1),
            ...this.makeBusParams(2),
            ...this.makeBusParams(3),
            ...this.makeBusParams(4),
            ...this.makeBusParams(8),
            ...this.makeBusParams(12),
            ...this.makeBusParams(16),
            // Headamp for inputs
            ...Array.from({ length: 48 }, (_, i) => [
                [`/headamp/local/${i + 1}/gain`, { type: "float", value: 30.0, unit: "dB" }],
                [`/headamp/local/${i + 1}/phantom`, { type: "bool", value: false }],
            ]).flat(),
            // Scenes
            ["/scene/current", { type: "int", value: 0 }],
            ["/scene/0/name", { type: "string", value: "Scene 0 - Empty" }],
            // DCA
            ["/dca/1/name", { type: "string", value: "DCA 1" }],
            ["/dca/1/mute", { type: "bool", value: false }],
            ["/dca/1/fader", { type: "float", value: 0.0, unit: "dB" }],
            // Mute groups
            ["/mutegroup/1/mute", { type: "bool", value: false }],
            ["/mutegroup/2/mute", { type: "bool", value: false }],
        ];
        for (const [path, value] of baseParams) {
            this.params.set(path, value);
        }
    }
    makeChannelParams(ch) {
        return [
            [`/ch/${ch}/name`, { type: "string", value: `CH ${ch}` }],
            [`/ch/${ch}/mute`, { type: "bool", value: false }],
            [`/ch/${ch}/fader`, { type: "float", value: 0.0, unit: "dB" }],
            [`/ch/${ch}/pan`, { type: "float", value: 0.0, unit: "%" }],
            [`/ch/${ch}/source`, { type: "string", value: `Local ${ch}` }],
            [`/ch/${ch}/eq/high/gain`, { type: "float", value: 0.0, unit: "dB" }],
            [`/ch/${ch}/eq/mid/gain`, { type: "float", value: 0.0, unit: "dB" }],
            [`/ch/${ch}/eq/low/gain`, { type: "float", value: 0.0, unit: "dB" }],
            [`/ch/${ch}/gate/threshold`, { type: "float", value: -80.0, unit: "dB" }],
            [`/ch/${ch}/comp/threshold`, { type: "float", value: 0.0, unit: "dB" }],
            [`/ch/${ch}/send/1/level`, { type: "float", value: -99.0, unit: "dB" }],
            [`/ch/${ch}/send/2/level`, { type: "float", value: -99.0, unit: "dB" }],
            [`/ch/${ch}/send/3/level`, { type: "float", value: -99.0, unit: "dB" }],
            [`/ch/${ch}/send/4/level`, { type: "float", value: -99.0, unit: "dB" }],
        ];
    }
    makeBusParams(bus) {
        return [
            [`/bus/${bus}/name`, { type: "string", value: `Bus ${bus}` }],
            [`/bus/${bus}/mute`, { type: "bool", value: false }],
            [`/bus/${bus}/fader`, { type: "float", value: 0.0, unit: "dB" }],
        ];
    }
    // Fault injection
    setFaultConfig(config) {
        Object.assign(this.faultConfig, config);
    }
    maybeInjectFault() {
        if (Math.random() < this.faultConfig.disconnectProbability) {
            this.connected = false;
            throw new Error("DRIVER_TIMEOUT: Simulated disconnect");
        }
        if (Math.random() < this.faultConfig.timeoutProbability) {
            throw new Error("DRIVER_TIMEOUT: Simulated timeout");
        }
    }
    async discover(options) {
        return [this.device];
    }
    async connect(device) {
        this.connected = true;
        this.device = { ...this.device, ...device };
    }
    async disconnect() {
        this.connected = false;
    }
    async getInfo() {
        if (!this.connected)
            throw new Error("DEVICE_DISCONNECTED");
        return { ...this.device };
    }
    async getParam(path) {
        if (!this.connected)
            throw new Error("DEVICE_DISCONNECTED");
        this.maybeInjectFault();
        const value = this.params.get(path);
        if (value === undefined)
            throw new Error(`PARAM_NOT_FOUND: ${path}`);
        return { ...value };
    }
    async setParam(path, value) {
        if (!this.connected)
            throw new Error("DEVICE_DISCONNECTED");
        this.maybeInjectFault();
        if (Math.random() < this.faultConfig.readbackMismatchProbability) {
            // Simulate a mismatch by not setting
            return;
        }
        this.params.set(path, { ...value });
    }
    async getNode(path) {
        if (!this.connected)
            throw new Error("DEVICE_DISCONNECTED");
        this.maybeInjectFault();
        const result = {};
        for (const [key, value] of this.params) {
            if (key.startsWith(path)) {
                result[key] = { ...value };
            }
        }
        return result;
    }
    async setNode(path, patch) {
        if (!this.connected)
            throw new Error("DEVICE_DISCONNECTED");
        this.maybeInjectFault();
        for (const [sub, value] of Object.entries(patch)) {
            const fullPath = `${path}/${sub}`;
            this.params.set(fullPath, { ...value });
        }
    }
    async meterRead(targets, windowMs) {
        if (!this.connected)
            throw new Error("DEVICE_DISCONNECTED");
        this.maybeInjectFault();
        const meters = targets.map((target) => {
            const param = this.params.get(target);
            const hasSignal = param?.type === "float" && param.value > -90 && !this.params.get(target.replace(/\/fader$/, "/mute"))?.value;
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
//# sourceMappingURL=WingDriver.js.map
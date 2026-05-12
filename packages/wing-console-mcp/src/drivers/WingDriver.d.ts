import { DriverKind, WingDevice, WingValue, MeterFrame } from "../types.js";
export { DriverKind, WingDevice, WingValue, MeterFrame };
export interface WingDriver {
    kind: DriverKind;
    discover(options: {
        timeoutMs: number;
        directIps?: string[];
    }): Promise<WingDevice[]>;
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
export declare class FakeWingDriver implements WingDriver {
    kind: DriverKind;
    private connected;
    private device;
    private params;
    private faultConfig;
    constructor();
    private initParams;
    private makeChannelParams;
    private makeBusParams;
    setFaultConfig(config: Partial<typeof this.faultConfig>): void;
    private maybeInjectFault;
    discover(options: {
        timeoutMs: number;
        directIps?: string[];
    }): Promise<WingDevice[]>;
    connect(device: WingDevice): Promise<void>;
    disconnect(): Promise<void>;
    getInfo(): Promise<WingDevice>;
    getParam(path: string): Promise<WingValue>;
    setParam(path: string, value: WingValue): Promise<void>;
    getNode(path: string): Promise<Record<string, WingValue>>;
    setNode(path: string, patch: Record<string, WingValue>): Promise<void>;
    meterRead(targets: string[], windowMs: number): Promise<MeterFrame>;
}
//# sourceMappingURL=WingDriver.d.ts.map
import { Risk, RISK_MAP } from "../types.js";

export class RiskEngine {
  classify(tool: string, target?: string): Risk {
    const baseRisk = RISK_MAP[tool] ?? "none";

    // Elevate risk based on target
    if (target) {
      if (/phantom/i.test(target)) return "critical";
      if (/routing|route|patch/i.test(target)) return "critical";
      if (/scene|snapshot|show.*recall/i.test(target)) return "critical";
      if (/main.*(?:mute|fader|lr)/i.test(target)) return "high";
      if (/dca|mute.?group/i.test(target)) return "high";
      if (/global|network|firmware/i.test(target)) return "critical";
    }

    return baseRisk;
  }

  requiresConfirmation(risk: Risk): boolean {
    return risk === "medium" || risk === "high" || risk === "critical";
  }

  getConfirmationTemplate(tool: string, risk: Risk, target: string): string {
    if (risk === "critical") {
      if (/phantom/i.test(target)) {
        return `确认开启 ${target} 的 48V 幻象电源，我确认连接设备需要幻象电源`;
      }
      if (/scene|snapshot/i.test(tool)) {
        return `确认 recall ${target}，我知道这会改变当前调音台状态`;
      }
      if (/routing|route|patch/i.test(target)) {
        return `确认修改 ${target} 的路由，我知道可能导致主扩或耳返无声`;
      }
      return `确认执行 ${tool} 在 ${target}，这是高危操作，可能影响现场音频`;
    }
    if (risk === "high") {
      return `确认执行 ${tool} 在 ${target}`;
    }
    return `确认执行`;
  }
}

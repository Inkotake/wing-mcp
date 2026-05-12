# 10. Model Routing

## 1. Why routing matters

AI 调音师涉及不同任务：

- 快速语音对话。
- 低成本长上下文 RAG。
- 工具调用计划。
- 高风险操作复核。
- 事件总结。
- 代码开发。

不要让一个模型承担所有任务。实现 `ModelRouter`。

## 2. Task kinds

```ts
export type AgentTaskKind =
  | "voice_turn"
  | "intent_classification"
  | "diagnosis_next_step"
  | "rag_answer"
  | "tool_plan"
  | "high_risk_review"
  | "incident_summary"
  | "code_generation"
  | "test_generation";
```

## 3. Route interface

```ts
export interface ModelRoute {
  provider: "openai" | "anthropic" | "deepseek" | "local";
  model: string;
  temperature: number;
  maxOutputTokens: number;
  requireJson: boolean;
  allowToolCalls: boolean;
  timeoutMs: number;
}
```

## 4. Default routing suggestion

```ts
const routes = {
  voice_turn: {
    provider: "openai",
    model: "realtime-voice-model",
    allowToolCalls: true,
    timeoutMs: 8000
  },
  intent_classification: {
    provider: "deepseek",
    model: "deepseek-v4-flash",
    requireJson: true,
    timeoutMs: 5000
  },
  rag_answer: {
    provider: "deepseek",
    model: "deepseek-v4-flash",
    requireJson: false,
    timeoutMs: 12000
  },
  diagnosis_next_step: {
    provider: "deepseek",
    model: "deepseek-v4-flash",
    requireJson: true,
    timeoutMs: 8000
  },
  high_risk_review: {
    provider: "anthropic",
    model: "strong-reasoning-model",
    requireJson: true,
    timeoutMs: 15000
  }
};
```

## 5. DeepSeek Flash use cases

适合：

- 长上下文资料检索总结。
- 意图分类。
- 生成诊断下一步候选。
- 结构化 JSON output。
- 低成本 incident summary。

不建议单独承担：

- Critical action final approval。
- 高风险现场自动化。
- 没有 server-side policy 的 raw tool execution。

## 6. High-risk review prompt

```text
Review this pending live audio hardware change. Return JSON only.
Check whether the change is safe, whether the confirmation text is exact, whether the target is resolved, whether current state changed since prepare, and whether there is a safer diagnostic alternative.
Do not approve phantom/routing/scene/main/mute-group actions unless confirmation is exact and policy allows the mode.
```

## 7. Model independence

Provider abstraction must support：

```text
- OpenAI-compatible chat completions
- Anthropic-compatible messages
- Realtime voice sessions
- local HTTP model server
- tool call normalization
- JSON repair / schema validation
```

No model should be able to bypass PolicyEngine。

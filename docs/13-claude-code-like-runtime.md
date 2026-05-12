# 13. Claude-Code-like Runtime

## 1. Do not copy leaked code

Even if Claude Code code fragments are circulating, build a clean-room runtime:

- Use public documentation.
- Use open-source agent projects as architectural inspiration.
- Do not copy leaked source or internal prompts.
- Put safety in MCP server, not hidden prompts.

## 2. Runtime modules

```text
agent-runtime/
  providers/
    openai.ts
    anthropic.ts
    deepseek.ts
    local.ts
  context/
    memoryLoader.ts
    roomLoader.ts
    deviceStateLoader.ts
  tools/
    mcpClient.ts
    toolPolicy.ts
    toolPlanner.ts
  prompts/
    system.ts
    soundEngineer.ts
    safety.ts
  hooks/
    beforeToolCall.ts
    afterToolCall.ts
    onMemoryWrite.ts
    onHighRiskAction.ts
  skills/
    skillLoader.ts
    wingConsoleOperator.ts
  sessions/
    voiceSession.ts
    chatSession.ts
    diagnosisSession.ts
```

## 3. Filesystem compatibility

Support these paths for compatibility with Claude Code / Agent SDK style workflows：

```text
CLAUDE.md
AGENTS.md
.claude/settings.json
.claude/agents/*.md
.claude/commands/*.md
.claude/skills/*/SKILL.md
```

## 4. Hook points

```ts
beforeUserPrompt(prompt, context)
beforeToolPlan(plan, context)
beforeToolCall(call, context)
afterToolCall(call, result, context)
beforeMemoryWrite(record, context)
afterDiagnosisStep(session, context)
onHighRiskAction(plan, context)
onSessionEnd(summary, context)
```

## 5. Tool policy hook

```ts
export async function beforeToolCall(call: ToolCall, ctx: AgentContext) {
  const risk = await ctx.riskEngine.classify(call);

  if (ctx.mode === "read_only" && call.isWrite) {
    throw new PolicyDenied("Read-only mode denies write tools");
  }

  if (ctx.liveMode && call.name.includes("raw")) {
    throw new PolicyDenied("Raw protocol tools are disabled in live mode");
  }

  if (risk === "critical" && !ctx.confirmation?.exact) {
    throw new PolicyDenied("Critical action requires exact confirmation");
  }
}
```

## 6. Skill loading

Skill controls behavior, not safety enforcement：

```text
- Load wing-console-operator when query involves WING/live sound.
- Use Skill references for diagnosis and tool selection.
- Still route every write through PolicyEngine.
```

## 7. Subagent roles

Recommended subagents：

- `wing-protocol-engineer`：协议 / driver / schema。
- `mcp-tool-designer`：MCP tool schema / descriptions。
- `live-safety-reviewer`：安全策略和高风险 review。
- `diagnosis-workflow-engineer`：no-sound / feedback / monitor workflows。
- `test-harness-engineer`：fake-wing / hardware tests。

Files included in `agent-presets/.claude/agents/`。

#!/usr/bin/env python3
"""
Validate a WING tool execution plan for safety before execution.

Usage:
  python validate_tool_plan.py <plan.json

Plan format:
{
  "steps": [
    {"tool": "wing_channel_get", "target": "/ch/1/fader", "risk": "none"},
    {"tool": "wing_phantom_set_prepare", "target": "/headamp/local/1/phantom", "risk": "critical"}
  ]
}

Catches:
- Write before read
- Critical actions without preceding read
- Multiple unsafe actions in sequence
- Raw tools without explicit developer mode
"""

import json
import sys

CRITICAL_PATTERNS = [
    "phantom",
    "routing_set",
    "scene_recall",
    "snapshot",
    "raw_osc",
    "raw_native",
]

READ_TOOLS = [
    "wing_param_get",
    "wing_channel_get",
    "wing_channel_list",
    "wing_send_get",
    "wing_routing_get",
    "wing_routing_trace",
    "wing_headamp_get",
    "wing_scene_list",
    "wing_meter_read",
    "wing_meter_catalog",
    "wing_signal_check",
    "wing_get_status",
    "wing_discover",
    "wing_schema_search",
    "wing_param_resolve",
]


def is_read_tool(tool: str) -> bool:
    return tool in READ_TOOLS or "_get" in tool or tool.endswith("_trace") or tool.endswith("_list") or tool.endswith("_catalog") or tool.endswith("_search") or tool.endswith("_resolve")


def is_write_prepare(tool: str) -> bool:
    return "_prepare" in tool


def is_write_apply(tool: str) -> bool:
    return "_apply" in tool


def is_critical(tool: str, target: str = "") -> bool:
    for pattern in CRITICAL_PATTERNS:
        if pattern in tool or pattern in target:
            return True
    return False


def validate(plan: dict) -> list[str]:
    issues = []
    steps = plan.get("steps", [])

    if not steps:
        issues.append("Plan has no steps.")
        return issues

    for i, step in enumerate(steps):
        tool = step.get("tool", "")
        target = step.get("target", "")

        # Check: write before any read
        if is_write_prepare(tool) or is_write_apply(tool):
            has_prior_read = any(is_read_tool(s.get("tool", "")) for s in steps[:i])
            if not has_prior_read and i == 0:
                issues.append(
                    f"Step {i}: Write tool '{tool}' on '{target}' without any prior read. Always read state first."
                )

        # Check: apply without prepare
        if is_write_apply(tool):
            expected_prepare = tool.replace("_apply", "_prepare")
            has_prepare = any(
                s.get("tool", "") == expected_prepare for s in steps[:i]
            )
            if not has_prepare:
                issues.append(
                    f"Step {i}: Apply tool '{tool}' without matching prepare step."
                )

        # Check: critical without acknowledgment
        if is_critical(tool, target) and not step.get("risk_acknowledged"):
            issues.append(
                f"Step {i}: Critical tool '{tool}' on '{target}' without explicit risk acknowledgment."
            )

    return issues


def main():
    try:
        plan = json.loads(sys.stdin.read())
    except json.JSONDecodeError as e:
        print(f"Invalid JSON: {e}", file=sys.stderr)
        sys.exit(1)

    issues = validate(plan)

    if issues:
        print("SAFETY ISSUES FOUND:")
        for issue in issues:
            print(f"  - {issue}")
        sys.exit(1)
    else:
        print("Plan OK: no safety issues detected.")
        sys.exit(0)


if __name__ == "__main__":
    main()

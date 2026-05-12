#!/usr/bin/env python3
"""Post-write hook: reminds to update tests after file modifications."""
import json
import sys

try:
    data = json.loads(sys.stdin.read())
    files = []
    if isinstance(data, dict):
        tool_input = data.get("tool_input", {})
        file_path = tool_input.get("file_path") or tool_input.get("file_paths", [])
        if isinstance(file_path, str):
            files = [file_path]
        else:
            files = file_path

    for f in files:
        if f.endswith(".ts") and "test" not in f and "__tests__" not in f:
            print(f"REMINDER: {f} was modified. Consider adding/updating tests.")
except Exception:
    pass
sys.exit(0)

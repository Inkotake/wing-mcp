#!/usr/bin/env python3
"""Pre-Bash safety check hook. Flags dangerous commands before execution."""
import json
import sys
import os

DANGEROUS_PATTERNS = [
    "rm -rf /",
    "rm -rf ~",
    "rm -rf .",
    "mkfs.",
    "dd if=",
    "> /dev/sda",
    "curl | sh",
    "wget | sh",
    "chmod 777 /",
    "chown -R",
    ":(){ :|:& };:",  # fork bomb
]

try:
    data = json.loads(sys.stdin.read())
    command = data.get("command", data.get("tool_input", {}).get("command", ""))

    for pattern in DANGEROUS_PATTERNS:
        if pattern in command:
            print(f"BLOCKED: Dangerous pattern detected: {pattern}")
            sys.exit(1)

    print("OK")
    sys.exit(0)
except json.JSONDecodeError:
    print("WARNING: Could not parse hook input, allowing")
    sys.exit(0)

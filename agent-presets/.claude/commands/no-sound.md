# /no-sound

Start a no-sound diagnosis for a target.

Usage: `/no-sound <target> [room_id]`

What this does:
1. Starts a structured no-sound diagnosis session
2. Uses room patch sheet to resolve target
3. Runs wing_signal_check on the target path
4. Guides through the diagnostic breakpoint tree
5. Only proposes fixes when evidence is clear

Safety: All writes require confirmation. Diagnosis is read-only by default.

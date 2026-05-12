# /line-check

Perform a line check for a room.

Usage: `/line-check [room_id]`

What this does:
1. Reads all channel names and mute states
2. Checks meters for signal presence on active channels
3. Reports channels with no signal or unexpected mute
4. Verifies bus/main routing

Safety: Read-only. No changes are made.

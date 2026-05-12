# Safety Policy Reference

## Risk Levels

| Level | Examples |
|-------|----------|
| none | read-only, schema search, meter read, status |
| low | cosmetic name/color changes in maintenance |
| medium | channel fader small delta, channel mute, monitor send, EQ small |
| high | main fader, DCA, mute groups, gate/dynamics, output patch |
| critical | phantom power, routing, scene/snapshot recall, global prefs |

## Modes

- **read_only**: No writes allowed. For shows.
- **rehearsal_safe**: Medium risk max. Confirmation required. Delta capped.
- **maintenance**: All risks allowed with confirmation.
- **developer_raw**: Raw OSC/native allowed. No live mode.

## Absolute Denials

Server denies regardless of prompt:
- Raw protocol in live mode
- Critical without exact confirmation
- Expired confirmation ID
- Target mismatch on confirmation
- State change between prepare and apply
- Network settings write unless explicitly enabled

## Required Write Flow

1. resolve target
2. read old state
3. classify risk
4. enforce policy
5. generate plan
6. return confirmation_id
7. receive exact confirmation if needed
8. re-read critical old state
9. apply change
10. readback
11. compare expected vs actual
12. audit
13. summarize to human

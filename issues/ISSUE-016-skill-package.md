# ISSUE-016-skill-package: Wing Console Operator Skill

## Goal

Finalize and package wing-console-operator Skill.

## Requirements

- Follow `CLAUDE.md` safety rules.
- Update relevant docs.
- Add unit tests.
- Add fake-wing integration tests where applicable.
- Add safety tests for any write-capable behavior.
- Do not require real hardware unless test is explicitly hardware-gated.

## Acceptance Criteria

- Build passes.
- Tests pass.
- No unsafe write path is introduced.
- Structured outputs documented.
- Hardware assumptions are documented.
- For write tools: prepare/apply/readback/audit exists.

## Notes

Reference docs:

- `docs/03-development-roadmap.md`
- `docs/06-safety-policy.md`
- `mcp-spec/tools.yaml`

# Test Harness Engineer

You build and maintain test infrastructure for the WING AI Sound Engineer project.

## Test Requirements

Every tool needs:
1. Unit tests (isolated, mock driver)
2. Fake-wing integration tests
3. Safety policy tests (denial paths)
4. Audit trail tests (for writes)
5. Hardware tests (gated: WING_HARDWARE_TEST=1)
6. Write tests (gated: WING_HARDWARE_WRITE_TEST=1)

## Fake Wing Tests

The fake-wing driver supports fault injection:
- timeoutProbability
- disconnectProbability
- readbackMismatchProbability

Test that the system handles:
- Driver timeout gracefully
- Disconnect/reconnect cycles
- Readback mismatch detection
- Expired confirmation tickets
- Confirmation ID validation

## Test Organization

```
packages/wing-console-mcp/tests/
  unit/           - isolated unit tests
  integration/    - fake-wing integration tests
  safety/         - policy, risk, confirmation tests
  hardware/       - gated hardware tests
```

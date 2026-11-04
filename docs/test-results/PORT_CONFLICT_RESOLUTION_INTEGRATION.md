# Port Conflict Resolution Integration

**Engineering status:** READY FOR RE-REVIEW
**Branch:** `integration/m0-m1.1-port-conflict`
**Starting review commit:** `18639fd9bc7053e74b191a93eb64a9d4a92460de`
**Base:** `main` merge `44cdc962c0fc0438cdbdf2b3b1ddc5b87f868466` (PR #6)
**Scope:** M0/M1.1 integration, bounded Windows discovery, Issue #7 diagnostics, and port-first resolution UI

## Implementation summary

- M0 test infrastructure and CI remain integrated through `.github/workflows/baseline-checks.yml`, `docs/TESTING.md`, package scripts, and baseline tests.
- M1.1 IPC sender checks, strict PID validation, protected-process guards, explicit metadata states, and renderer escaping remain in place.
- Privileged `ports:kill` and destructive renderer controls are fail-closed by default. The existing M1.1 policy code is preserved for future M1.2 integration, but a trusted direct IPC call cannot bypass the feature gate.
- Windows discovery retains TCP listener rows when process metadata is unavailable and returns an explicit `cannot-determine` result when `netstat.exe` fails or times out.
- `parseNetstat` retains non-listening diagnostic rows, including `TIME_WAIT` with PID 0. PID 0 is diagnostic context only and is never a stoppable owner.
- Address-family matching is conservative: IPv6 wildcard evidence can make an IPv4 result ambiguous, and IPv4 exclusion evidence is not reused as IPv6 evidence.
- Check Port uses passive `netstat.exe -ano` evidence first, followed by an explicit user-initiated temporary TCP bind probe. Alternative-port search has an overall deadline and reuses the passive network snapshot.

## Complete changed-file inventory

- `.github/workflows/baseline-checks.yml`
- `docs/M1_SECURITY_GUARDS.md`
- `docs/TESTING.md`
- `docs/test-results/PORT_CONFLICT_RESOLUTION_INTEGRATION.md`
- `main.js`
- `package.json`
- `preload.js`
- `src/renderer/app.js`
- `src/renderer/index.html`
- `src/renderer/safeMarkup.js`
- `src/renderer/styles.css`
- `src/services/ipcSecurity.js`
- `src/services/portDiagnosticService.js`
- `src/services/portReference.js`
- `src/services/portService.js`
- `src/services/terminationPolicy.js`
- `test/main-ipc-baseline.test.js`
- `test/port-diagnostic.test.js`
- `test/renderer-baseline.test.js`
- `test/service-baseline.test.js`
- `test/service-discovery.test.js`
- `test/termination-guards.test.js`

Unrelated local reports remain untracked and excluded from this change.

## M0/M1.1 integration details

IPC requires the expected top-level application frame. PID input is strict, PID 4 and protected names remain refused, and the prior M1.1 ownership/metadata/creation-time checks remain available for future authorized execution. Destructive process actions are currently disabled before discovery or `taskkill` work begins. No real process termination tests were run.

Discovery uses injectable command runners, TCP-only `netstat.exe -ano` parsing, explicit subprocess deadlines, bounded metadata concurrency, and separate process name/path/creation-time/status fields. The old shell-interpolated kill path was not restored.

## Check Port workflow

1. Validate the TCP port and requested local address.
2. Obtain a bounded passive snapshot and address-family-specific excluded-port context.
3. Match the requested address scope while preserving non-listening rows as context.
4. Report `Listening`, `No listener observed`, or `Cannot determine` with evidence and timestamp. A missing listener is not presented as proof of availability.
5. Only when the user explicitly selects the bind probe, create a temporary TCP server for the requested address and port.
6. Offer alternative-port search only as a bounded, user-initiated follow-up.

## Temporary bind probe cleanup guarantees

The probe records listening, bind-error, close-requested, close-confirmed, close-failed, and cleanup-timeout states. It requests close on success, bind errors, operation timeout, and abort. A result is classified as available or unavailable only when the close callback confirms cleanup. Late listening events, failed close callbacks, missing close callbacks, and cleanup deadlines return `Cannot determine` with `cleanupConfirmed: false`; they never claim confirmed cleanup. Best-effort connection-closing methods are invoked on cleanup timeout when the server exposes them.

## Alternative-port resolution

Search is capped at the configured candidate limit and an overall deadline. When using the built-in diagnostic path it obtains one passive network snapshot and reuses it across candidates. Each candidate is checked passively, excluded ranges are treated as context rather than proof, and the explicit probe receives the remaining deadline. Deadline expiry, probe cleanup uncertainty, and diagnostic failures return `Cannot determine` rather than a false candidate.

## Validation results

| Check | Actual result |
| --- | --- |
| `npm.cmd run check:syntax` | PASS |
| `npm.cmd test` | PASS - 74 tests, 58 passing, 16 intentional TODOs, 0 failures |
| `git diff --check` | PASS |
| Windows smoke test | BLOCKED / inconclusive - prior disposable Node listener on `127.0.0.1:55317` was not visible to `netstat.exe`; no process was killed |

All subprocess tests are mocked. No administrator privileges, system configuration changes, or real process termination tests were used.

## Regression coverage added or updated

- Direct trusted IPC and backend calls cannot bypass the disabled termination feature gate.
- Partial metadata and missing creation time cannot satisfy the preserved termination policy.
- Temporary bind success, `EADDRINUSE`, `EACCES`, operation timeout, delayed listening, failed close, and cleanup timeout paths are covered.
- Realistic Windows `TIME_WAIT` output is parsed through `parseNetstat` into `checkPort`, retaining PID 0 as non-actionable context.
- Failed netstat discovery and renderer display of `cannot-determine` are covered.
- IPv6 wildcard / IPv4 dual-stack ambiguity and address-family-specific excluded-range lookup are covered.
- Alternative-port snapshot reuse and overall-deadline behavior are covered.

## Known limitations and remaining blockers

- M1.2 termination safety is NOT IMPLEMENTED: no process-instance handle or identity continuity across preview/revalidation/execution, no impact preview, and no independent post-stop verification. Termination remains disabled by default.
- Windows production validation remains incomplete. The available smoke evidence is environment-inconclusive and does not establish behavior on all supported Windows configurations.
- Passive `No listener observed` remains an unknown-availability result; only the explicit bind probe establishes availability at that instant, and even that result is conditioned on confirmed cleanup.
- Excluded-range lookup is best effort and is never treated as proof of a particular bind failure.
- The remaining M1.2 termination-safety requirements and Issue #7 completion remain open.

**This PR is for independent engineering review. M1.2 termination safety and Windows production validation remain incomplete.**

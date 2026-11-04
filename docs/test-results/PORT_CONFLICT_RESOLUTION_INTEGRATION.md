# Port Conflict Resolution Integration

**Final engineering status:** READY FOR REVIEW
**Branch:** `integration/m0-m1.1-port-conflict`
**Base:** `main` merge `44cdc962c0fc0438cdbdf2b3b1ddc5b87f868466` (PR #6)
**Scope:** M0/M1.1 integration, bounded Windows discovery, Issue #7 diagnostics, and port-first resolution UI

## Files changed

- M0: `.github/workflows/baseline-checks.yml`, `docs/TESTING.md`, and baseline test scripts/package commands.
- M1.1: `src/services/ipcSecurity.js`, `src/services/terminationPolicy.js`, `main.js`, and `docs/M1_SECURITY_GUARDS.md`.
- Discovery: `src/services/portService.js` and `test/service-discovery.test.js`.
- Diagnostics: `src/services/portDiagnosticService.js` and `test/port-diagnostic.test.js`.
- UI/bridge: `preload.js`, `src/renderer/index.html`, `src/renderer/app.js`, and `src/renderer/styles.css`.
- Regression coverage: `test/main-ipc-baseline.test.js`, `test/renderer-baseline.test.js`, `test/service-baseline.test.js`, and `test/termination-guards.test.js`.

## Integration decisions

PR #4's test/CI foundation was merged first, then PR #5's IPC and termination guardrails were reconciled with PR #6's already-merged discovery changes. Obsolete WMIC and command-string mocks were adapted to the current `execFile`/PowerShell PID-environment architecture. The discovery implementation retains PR #6's explicit metadata states, safe renderer escaping, and non-WMIC lookup. The old shell-interpolated `killProcess` path was not restored.

The backend remains authoritative: IPC requires the expected top-level application frame; PID input is strict; PID 4 and protected names are refused; current listener ownership and usable process metadata are required before `taskkill`; and taskkill uses a bounded argument-array `execFile` call. M1.2 identity continuity is intentionally not claimed.

## Diagnostic service architecture

`portService.js` uses injectable command runners, TCP-only `netstat.exe -ano` parsing, explicit subprocess timeouts, an approximately eight-second discovery deadline, and at most four concurrent metadata subprocesses. Listener records retain separate IPv4/IPv6/wildcard addresses. Metadata fields remain separate: process name, executable path, creation time, status/source/error, and application label.

`portDiagnosticService.js` provides validated `checkPort`, read-only TCP state and excluded-range context, explicit result outcomes, a user-triggered temporary TCP bind probe with `finally`-equivalent close handling, and a bounded user-triggered alternative-port search. Neither refresh nor passive checking binds a port or terminates a process.

## UI changes

The new Check a port panel accepts a port and local bind address (default `127.0.0.1`), shows the outcome, timestamp, evidence, and owner confidence, and offers explicit Test if port can be used, Find alternative port, and Copy port actions. All Ports remains the passive listener overview. Stop controls are disabled when process identity is not verified or the target is protected.

## Validation

| Check | Result |
| --- | --- |
| `npm.cmd run check:syntax` | PASS |
| `npm.cmd test` | PASS — 65 tests, 49 passing, 16 intentional TODOs, 0 failures |
| `git diff --check` | PASS after documentation whitespace cleanup |
| Disposable Windows listener smoke | BLOCKED — temporary Node listener on `127.0.0.1:55317` was not visible to `netstat.exe`; diagnostic returned `No listener observed`. No process was killed. |

All subprocess tests are mocked. No administrator privileges, system configuration changes, or real process termination tests were used.

## Issue #7 acceptance results

| Acceptance item | Result |
| --- | --- |
| Check `127.0.0.1:5173` independently of All Ports | PASS — service/UI path and regression coverage |
| Exact listener endpoint/PID with owner uncertainty | PASS — mocked TCP/address/metadata coverage |
| No listener does not mean free | PASS |
| Non-listening state and excluded range as context | PASS |
| IPv4/IPv6/loopback/wildcard scope | PASS |
| Permission/tool/timeout uncertainty | PASS |
| Explicit bind success, `EADDRINUSE`, `EACCES`, cleanup | PASS |
| Bounded alternative-port search and copy guidance | PASS |
| No automatic termination/elevation/configuration changes | PASS |
| Windows end-to-end listener evidence | BLOCKED — environment did not expose the disposable listener in `netstat` |

## Known limitations and remaining safety gaps

- The smoke result is evidence of an environment limitation, not proof that the parser or OS listener behavior is correct on all supported Windows configurations.
- Passive `No listener observed` remains an unknown-availability result; only the explicit bind probe establishes availability at that instant.
- Excluded-range lookup is best effort and is never treated as proof of a particular bind failure.
- M1.2 is NOT IMPLEMENTED: no process-instance handle/identity continuity, impact preview, immediate pre-stop revalidation contract, or independent post-stop verification.
- No automatic killing was added to diagnostics, refresh, alternative-port search, or no-listener outcomes.

Review is required before commit, merge, or release.

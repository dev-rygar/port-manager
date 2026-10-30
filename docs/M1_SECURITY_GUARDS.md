# M1.1 — Privileged IPC and process termination guardrails

**Status:** Implementation candidate; Windows integration untested; **NOT release-ready**.  
**Branch:** `security/m1-ipc-process-guards` (stacked on M0 testing branch).  
**Audit mapping:** PM-A01, PM-A08, PM-A11; partial mitigations for PM-A02 and Electron hardening.  
**Do not merge or distribute as production-ready without the remaining safety work and Windows test evidence.**

## Changes introduced

1. **Trusted IPC sender:** `ports:get` and `ports:kill` now require the main app window's actual top-level web frame at the expected local `index.html` file URL. Child frames and unrelated windows/URLs are rejected. Electron navigation and `window.open` are restricted; sandbox is explicitly enabled.
2. **Strict PID parsing:** Rejects partial numerals, fractions, zero, negative values, malformed strings, and numbers above the Windows 32-bit PID representation. PIDs above 65535 are now accepted.
3. **Conservative stop policy:** Reject PID 4 immediately, selected names associated with system-managed Windows processes, and targets with unavailable process names.
4. **Live-listener prerequisite:** Before asking Windows to terminate the PID, re-run listener discovery and require that the target currently owns a TCP listening endpoint. Missing or failed discovery prevents termination.
5. **No shell interpolation for termination:** Execute `taskkill` through Node's `execFile` with an explicit argument list and a timeout, instead of constructing a shell command.
6. **Regression tests:** All subprocess invocations in tests are stubbed; cases cover invalid PIDs, blocked names, unknown identity, stale listener, sender/child-frame rejection, and argument-bound process termination.

## Safety guarantees this change does NOT provide

- **Not PID-reuse-proof:** A new process could occupy the same PID between discovery, metadata lookup and the final `taskkill`. An OS process-handle-based strategy and/or verified identity contract must be designed and tested.
- **Not a comprehensive Windows protection policy:** Matching a process *name* is a conservative blocklist, not reliable OS identity or proof that an allowed process is safe. Unknown and other-user/service cases need Windows-based investigation.
- **No impact preview yet:** The app still does not list all related ports that would be closed before confirmation.
- **No independent post-stop verification:** A successful `taskkill` request still does not prove the original process exited or that the requested port is now free.
- **No safe arbitrary bulk termination yet:** Development tags can outlive their original process, duplicate PIDs, and hide failures; these issues remain tracked.
- **No Windows runtime validation yet:** Win32 permissions, sandboxed Electron preload functionality, WMIC fallback, supported OS versions, and process churn remain deferred.
- **No XSS/renderer hardening yet:** Existing markup interpolation of application names is still unsafe; a compromised trusted app document can still use its permitted bridge. Address before release.

## Temporary behavior and tradeoffs

- This change intentionally **fails closed** if process metadata or a current listener cannot be resolved. Some otherwise stoppable dev servers may be blocked until M2 improves Windows discovery.
- Name-based denylisting can conservatively refuse an ordinary process that happens to have a system-like name. This protects against accidental stopping but is not a security identity guarantee.
- OS error messages should remain visible as meaningful stop failures, without claiming a process was successfully stopped.
- Parent-child inspection and tree termination remain separate; the current stop still sends one PID and does not request `/T`.

## Follow-up gates (mandatory before releasing)

| Gate | Planned work |
| --- | --- |
| Identity continuity / PID reuse | M1.2 + Windows validation WT-06/07 |
| Protected-process policy from reliable Windows metadata | M1.2 / M2 |
| Preview and independent process/port verification | M1.2–M2 |
| Bulk targeting and port-only tag semantics | M1/M3 |
| Renderer attribute rendering and misleading app-name fallback | M1 follow-up |
| Windows and Electron sandbox smoke tests | Deferred WT-01–WT-12 |

## Local test commands

```bash
npm run check:syntax
npm test
```

**CI success only covers controlled JavaScript checks** and does not close the deferred testing or production release gates.

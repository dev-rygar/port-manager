# Port Manager — M2 Discovery Remediation and Integration Review

**Date:** 2026-11-01 (Asia/Manila)
**Branch:** `feature/windows-process-discovery`
**Base/HEAD:** `e4a1585cb7755c24a04140834d92d9a3754d28ee`
**Recommendation:** **READY FOR REVIEW** for the scoped non-destructive remediation; **not ready for termination safety or final integration**.

## Workspace preservation

- Existing branch and local modifications were preserved.
- No stash, reset, rebase, branch switch, merge, commit, push, elevation, dependency installation, or termination operation was performed.
- Existing audit reports remain under `docs/test-results/`.
- `HEAD`, `main`, and `origin/main` still point to `e4a1585`.

## Fixes completed

### Renderer injection boundary

- Added `src/renderer/safeMarkup.js` with explicit escaping for `&`, `<`, `>`, double quotes, and single quotes.
- Removed dynamic `data-name` attributes from both table and development-group Kill buttons.
- Buttons retain numeric `data-pid` only; the action label is resolved from the in-memory process row using `dataset.pid`.
- Metadata status continues to render through `textContent`.
- Added regression tests for quotes, HTML-like markup, event-handler-looking text, and the absence of `data-name` interpolation.

### PowerShell PID handling

- Listener PID parsing now requires canonical decimal digits, a positive integer, and a maximum of `0xFFFFFFFF`.
- `Get-Process` remains invoked through `execFile` with an argument array, `-NoProfile`, `-NonInteractive`, `windowsHide`, UTF-8 output, and a 3000 ms timeout.
- The PID is now passed through the child environment variable `PORT_MANAGER_DISCOVERY_PID`; it is no longer embedded in PowerShell script text.
- Existing metadata error classification and bounded 64-PID lookup remain intact.

## Termination blocker remains intentionally unresolved

`killProcess` was not changed. It still reflects the unsafe `main` baseline and is not authorized by this discovery change. The branch must not be treated as safe to commit as a termination implementation because:

- raw PID termination is not bound to a verified process instance;
- metadata states are not consulted by the backend termination path;
- protected-target policy, preview, immediate revalidation, PID-reuse handling, and independent process/port verification are absent;
- the baseline path still uses permissive PID parsing and shell-interpolated `taskkill` without a timeout.

PR #5 improves several of these areas, but it does not by itself prove PID-reuse safety, preview/revalidation correctness, or independent post-stop verification. Required M1.2 work is a separate backend slice:

1. Define a process-instance identity containing canonical PID plus creation time and executable identity where available.
2. Recompute listener ownership, metadata status, protected-target policy, and impact immediately before execution.
3. Fail closed for `permission-denied`, `command-unavailable`, `unavailable`, `partial`, stale, or mismatched identity unless a separately approved policy says otherwise.
4. Use argument-array termination with a timeout only after fresh authorization.
5. Re-query process state and requested-port ownership independently and return structured per-target results.
6. Add mocked tests for stale identity, denied metadata, protected targets, partial failure, PID reuse, and verification outcomes. Do not test by killing system processes.

## PR #4 / PR #5 comparison and integration risks

- PR #4 adds M0 baseline tests, CI, `docs/TESTING.md`, and the same `test`/`check:syntax` scripts. Its tests mock the old `exec` command-string contract and WMIC/tasklist behavior; they need adaptation to the new `execFile` runner and metadata states.
- PR #5 adds M1.1 IPC and termination guards, `terminationPolicy`, `ipcSecurity`, guarded `main.js`, and termination/IPC tests. It modifies the same `src/services/portService.js` and `package.json`, so direct merge/cherry-pick will conflict.
- The local `check:syntax` now includes `safeMarkup.js`, but after PR #5 integration it must also include the M1.1 safety modules.
- Local tests currently cover discovery and renderer injection only; PR #4 baseline suites and PR #5 safety suites are not present on this branch.

Recommended order:

1. Integrate/review PR #4 M0 foundation.
2. Integrate/review PR #5 M1.1 on top of PR #4, resolving `portService.js` and package-script conflicts deliberately.
3. Rebase or recreate a focused M2 discovery PR from the integrated M1.1 tip, carrying over the WMIC-independent adapter, status contract, safe renderer boundary, and tests.
4. Implement M1.2 termination authorization separately; do not mix it into the M2 discovery change.
5. Re-run WT-01–WT-03 on a normal Windows session before claiming the adapter validated.

## Persistent discovery smoke test

A disposable Node listener remained alive until all checks completed:

```text
PID: 12216
Port: 52444
Get-Process: node, HasExited=False
Node client connection: connected
```

In the same user session:

```text
netstat: NO_LISTENING_MATCH
Port Manager discovery: {"matches":[]}
cleanup: stoppedPid=12216 exited=True
```

The successful client connection proves the temporary server was listening, but the OS probe did not expose its LISTENING row. This remains **BLOCKED/INCONCLUSIVE environment evidence**, not an application pass or fail. No application discovery comparison is claimed from this run.

## Validation

```text
npm.cmd run check:syntax  PASS
npm.cmd test             PASS — 11 tests, 0 failures
git diff --check         PASS
```

Added test coverage includes renderer injection, canonical PID parsing, shell-free PowerShell PID transport, all metadata states, fallback behavior, listener preservation, and no port-label identity substitution.

## Final status

**READY FOR REVIEW** for the isolated renderer/PID/discovery remediation.
**CHANGES REQUIRED** before any commit intended to represent safe termination or full Phase 2 readiness: integrate M0/M1.1 deliberately, implement M1.2 fail-closed process-instance authorization, and repeat the live listener test in an environment where `netstat` can observe the listener.

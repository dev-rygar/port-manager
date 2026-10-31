# Windows Process-Discovery Implementation Review

**Date:** 2026-11-01 (Asia/Manila)
**Branch:** `feature/windows-process-discovery`
**Base/HEAD:** `e4a1585cb7755c24a04140834d92d9a3754d28ee`
**Recommendation:** **CHANGES REQUIRED**

## Repository state

- Branch has no commits beyond `main`; `HEAD`, `main`, and `origin/main` all point to `e4a1585`.
- Existing local audit reports were preserved.
- No branch switch, merge, commit, push, elevation, package installation, or termination operation was performed.
- Working tree contains the implementation changes plus untracked local `docs/` and `test/` artifacts.

Implementation files changed:

- `src/services/portService.js`
- `src/renderer/app.js`
- `src/renderer/index.html`
- `package.json`
- `README.md`
- `test/service-discovery.test.js`
- `docs/test-results/WINDOWS_DISCOVERY_IMPROVEMENT.md`

Pre-existing local reports remain under `docs/test-results/`.

## Safety and metadata review

The read-only `Get-Process` path is invoked through `execFileAsync('powershell.exe', args, options)` with `-NoProfile`, `-NonInteractive`, `windowsHide: true`, UTF-8 output, and a 3000 ms timeout. It does not invoke a shell. The PID is parsed numerically from `netstat`, but is still interpolated into the PowerShell `-Command` script; using a child environment value or PowerShell argument would remove that remaining interpolation concern.

The implementation distinguishes and tests:

- `available`
- `partial`
- `permission-denied`
- `command-unavailable`
- `process-exited`
- `unavailable`

Listener rows remain when metadata fails, and port labels are not used as application identity. Metadata lookup is capped at 64 unique PIDs. The renderer displays metadata status using `textContent`.

### Blocking safety finding

Missing or uncertain identity does **not** currently prevent termination. The branch retains `main`’s original `killProcess` implementation:

- accepts a raw PID using permissive `parseInt`;
- does not consult `processMetadataStatus`;
- performs no protected-target or identity recheck;
- executes interpolated `taskkill /PID ${n} /F` through `exec` without a timeout.

The renderer still exposes Kill actions for rows with unavailable or denied metadata. This violates the review requirement that uncertain identity cannot authorize termination. No termination was invoked during this review.

## Renderer injection review

The new metadata status label is a static lookup rendered with `textContent`, so that change is safe. However, the existing `data-name="..."` attributes still rely on `escapeHtml()` in an attribute context. `escapeHtml()` uses a temporary element’s `innerHTML` and does not establish explicit quote escaping for attributes. A process/product name containing quotes remains a known injection risk from the prior audit. This is not introduced by the status field, but it remains in the commit candidate.

## PR #4 / PR #5 integration review

### PR #4 — M0 test foundation

PR #4 adds the same `test` and `check:syntax` script names, baseline service/renderer/IPC tests, testing documentation, and CI workflow. The local package-script intent is compatible, but the service command contract is not:

- M0 tests mock `exec` and expect command strings such as `netstat -ano` and WMIC/tasklist.
- The local implementation uses `execFile` with executable names and argument arrays.
- M0 test harnesses will need adaptation before they can run against this branch.
- The local branch does not contain PR #4’s baseline suites or workflow, so its current `npm test` runs only the new 8-test discovery suite.

### PR #5 — M1.1 guards

PR #5 changes the same `src/services/portService.js` and `package.json`, and adds `terminationPolicy`, `ipcSecurity`, guarded `main.js`, and termination/IPC tests.

- Direct file overlap in `portService.js` requires a deliberate integration/rebase; do not merge either version blindly.
- PR #5’s `check:syntax` includes the new safety modules; the local script does not.
- PR #5’s termination tests expect guarded `killProcess` behavior that is absent from this branch.
- The local discovery adapter should be integrated with PR #5’s safety adapter without restoring WMIC dependence or bypassing its IPC/policy checks.

## Persistent live smoke test

The disposable listener remained alive throughout the checks:

```text
PID: 25192
Port: 55818
Get-Process: node, HasExited=False
Node client connection: connected
```

Observed read-only results in the same user session:

```text
netstat: TCP 127.0.0.1:55819 -> 127.0.0.1:55818 TIME_WAIT 0
Port Manager discovery: {"matches":[]}
```

There was no `LISTENING` row for port 55818, despite a successful client connection to the persistent server. Cleanup used the saved temporary-process handle and confirmed exit. This is **INCONCLUSIVE/BLOCKED environment evidence**, not a pass for listener discovery.

## Automated checks

```text
npm.cmd run check:syntax  PASS
npm.cmd test             PASS — 8 tests, 0 failures
git diff --check         PASS
```

An ad hoc mocked generic-error probe also returned `metadataStatus: unavailable`. No termination test or package build was run.

## Remaining risks and required changes before commit

1. Integrate the discovery status with a backend termination policy; unknown, denied, unavailable, partial, and stale identities must fail closed or require an explicit safe contract.
2. Replace PID interpolation in the PowerShell command with an argument/environment-value boundary.
3. Resolve PR #4/#5 overlap and bring in their baseline, IPC, and termination guard tests.
4. Fix or explicitly scope the existing attribute-escaping issue before exposing process-derived names in `data-*` attributes.
5. Repeat the persistent listener test on a normal Windows session where `netstat` can observe the listener; do not infer a pass from the successful client connection.

**Final recommendation: CHANGES REQUIRED.** The discovery tests are green, but the branch is not safe to commit as a complete implementation because uncertain metadata can still authorize raw PID termination, integration with M1.1 is unresolved, and live listener visibility remains blocked.

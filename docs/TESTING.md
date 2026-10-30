# M0 Engineering Foundation — Test Coverage and Limitations

**Status:** Initial automated tests only; **not evidence of production safety**  
**Branch:** test/m0-engineering-foundation  
**Baseline:** main at e4a1585cb7755c24a04140834d92d9a3754d28ee  
**Plan:** [Phase 3 architecture and roadmap](https://github.com/dev-rygar/port-manager/pull/3)  
**Audit:** [Phase 2 engineering audit](https://github.com/dev-rygar/port-manager/pull/2)

## Purpose

The existing application force-kills PIDs without enforced backend process-identity or protected-process checks. These baseline tests **do not change or endorse that behavior**. They establish safe test seams so the M1 safeguards can be developed incrementally. All Windows command execution is stubbed.

## Run

Requires Node.js 22 for the CI test baseline. These test commands do not require an Electron installation or administrator privileges.

```bash
npm run check:syntax
npm test
```

The test suite uses Node's built-in test runner, assertions and VM. No native Windows command is run. CI runs on Linux, **not** a Windows integration environment.

## Coverage

| Suite | What is exercised |
| --- | --- |
| test/service-baseline.test.js | Controlled TCP netstat output; WMIC metadata and tasklist fallback; unknown process name; port-reference metadata |
| test/renderer-baseline.test.js | Search, tag storage, details text, no-match filtering |
| test/main-ipc-baseline.test.js | IPC channel registration and read-only discovery delegation |
| .github/workflows/baseline-checks.yml | Syntax check and Node tests for PRs and main pushes |

## TODO tests are not passed tests

Current TODO cases point to known audit gaps: protected-process rejection, identity recheck, process/port verification, bulk outcomes, misleading process guesses, HTML attribute safety, refresh races, and accessibility. Convert these into executable assertions when implementing M1–M3. CI success **does not imply** that those requirements are satisfied.

## Deferred Windows validation

The owner deferred hands-on Windows tests, tracked in [DEFERRED_WINDOWS_TESTING.md](https://github.com/dev-rygar/port-manager/blob/audit/engineering-audit-v1/docs/DEFERRED_WINDOWS_TESTING.md). They still need evidence for:

- Windows process/listener accuracy and metadata permissions.
- Actual process identity, ancestry, PID reuse, and port rebinding.
- Safe termination with isolated test processes, including partial failures.
- Electron runtime hardening, installer and portable packaging, and supported versions.
- Measured performance, dependency security review, keyboard accessibility.

**Never attempt to kill protected Windows processes merely to test the guard.** Test rejection with stubbed OS adapters.

## Next PR targets

1. Enforce IPC sender/input validation and avoid unrestricted shell commands.
2. Define protected-process policy and target-identity continuity rules.
3. Implement preview, revalidation, execution, and independent port verification.
4. Convert TODO test cases to passing negative/positive regression tests.
5. Resume Windows integration tests before closing the production release gate.

**Release rule:** Green baseline CI confirms only covered source behavior and syntax; **it does not establish production readiness**.

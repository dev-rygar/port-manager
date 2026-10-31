# Port Manager — Project Tracker

**Last updated:** 2026-11-01  
**Status:** In development — **not production-ready**  
**Current focus:** Local M2 remediation **READY FOR REVIEW** (owner/Codex report only); independent code review, integration, and live Windows discovery still pending  
**Application baseline on main:** e4a1585cb7755c24a04140834d92d9a3754d28ee

This is the **central progress checklist** for development and release readiness. For *what* to build, use the [Master Plan](https://github.com/dev-rygar/port-manager/pull/1); for *how* and milestone scope, use the [Architecture & Roadmap](https://github.com/dev-rygar/port-manager/pull/3); for findings and test requirements, use the [Engineering Audit](https://github.com/dev-rygar/port-manager/pull/2).

**Tracking rules:** A checked item means the named deliverable was prepared or tested to the stated extent. It does **not** imply that a PR was merged, that Windows testing passed, or that the application is production-ready. Track those gates separately. Never count TODO tests as passing tests.

## 1. Current phase status

| Phase | Status | Remaining gate |
| --- | --- | --- |
| 1 — Master Plan | **Approved; PR unmerged** | Merge PR #1 |
| 2 — In-depth audit | **Follow-up traced metadata failure: WT-01/02 FAIL / BLOCKED; WT-03 NOT IMPLEMENTED / BLOCKED (owner report)** | Fix/verify metadata behavior, rerun WT-01–WT-03; WT-04–WT-12 deferred |
| 3 — Architecture and roadmap | **Direction approved; OS choices provisional; PR unmerged** | Merge PR #3; finalize Windows-dependent decisions after testing |
| 4 — Incremental implementation | **M0/M1.1 branches; local M2 discovery remediation reported READY FOR REVIEW** | Independent source review and PR integration; M1.2 safety, M2 live discovery, M3/M4 pending |
| 5 — Production validation | **Not started** | Verify all safety, acceptance, and release gates |

## 2. GitHub PR integration tracker

**Verified 2026-10-31:** All five PRs below remain **open and unmerged**. Only the original application code is on main.

| PR | Deliverable | GitHub state | Dependency |
| --- | --- | --- | --- |
| [#1](https://github.com/dev-rygar/port-manager/pull/1) | Master Plan v1 | Draft / open | None |
| [#2](https://github.com/dev-rygar/port-manager/pull/2) | Engineering audit + deferred testing | Ready / open | References plan |
| [#3](https://github.com/dev-rygar/port-manager/pull/3) | Architecture, roadmap **and this tracker** | Ready / open | References PRs #1 and #2 |
| [#4](https://github.com/dev-rygar/port-manager/pull/4) | M0 automated tests and CI | Draft / open | None |
| [#5](https://github.com/dev-rygar/port-manager/pull/5) | M1.1 IPC/process guards | Ready / open | **Stacked on #4**; integrate #4 first |

Documentation approvals were recorded by the owner in conversation / PR comments; these are not GitHub-approved reviews or merges.

### Integration checklist

- [ ] Final review, mark ready, and merge PR #1.
- [ ] Review/merge PR #2 while preserving explicit testing deferrals.
- [ ] Review/merge PR #3 (including this tracker).
- [ ] Review/merge M0 PR #4 after checking latest CI.
- [ ] Retarget/rebase and merge M1.1 PR #5 after #4; rerun CI.
- [ ] Reconcile status in this tracker against main after each integration.

## 3. Phase 1 — Approved Master Plan

- [x] Define product as a **beginner-friendly, safety-first Windows port-conflict resolver**.
- [x] Approve two goals: **engineering excellence** and **feature improvement**.
- [x] Approve guiding principles: simple by default, safe by design, transparent consequences.
- [x] Approve feature priorities, scope, and initial acceptance scenarios.
- [x] Prepare [Master Plan v1](https://github.com/dev-rygar/port-manager/pull/1).
- [ ] Integrate approved documentation into main.

**Gate:** Product baseline is documented, traceable, and merged. This gate does not validate code.

## 4. Phase 2 — In-depth engineering audit

- [x] Review full tracked code, IPC, service, renderer, packaging config, lockfile and README.
- [x] Run controlled-execution checks with mocked Windows command, renderer and IPC boundaries.
- [x] Record 20 prioritized findings and FR-01–FR-17 coverage.
- [x] Document owner's choice to **defer Windows testing**, with scope and evidence templates.
- [x] Receive owner's **initial Windows WT-01–WT-03 report** (2026-10-31): WT-01 FAIL / BLOCKED (WMIC unavailable/CIM and NetTCP access denied), WT-02 FAIL / BLOCKED (netstat PID matched but app owner name Unknown), WT-03 NOT IMPLEMENTED / BLOCKED.
- [x] Record an [initial/follow-up triage summary](https://github.com/dev-rygar/port-manager/blob/audit/engineering-audit-v1/docs/test-results/WT01-WT03_REPORTED_TRIAGE_2026-10-31.md) in audit PR #2; **local source reports not yet directly reviewed**.
- [x] Receive Codex follow-up root-cause chain: **WMIC absent → tasklist Access denied → swallowed error → empty metadata map → Unknown name**. Netstat listener detection worked for the test case; PowerShell `npm.ps1` execution policy is unrelated.
- [ ] Obtain/review sanitized full **initial and follow-up** reports, exact tested commit, Windows build, execution context, and command-level errors.
- [x] Confirm `tasklist` and `Get-Process` can identify the user's own PowerShell process in a normal non-elevated terminal (2026-10-31, PID 20000); earlier Codex denial is environment-dependent in this example.
- [x] Independently test CIM and Get-NetTCPConnection in ordinary non-elevated PowerShell (2026-10-31): both explicitly returned **Access denied**; this is not limited to Codex. Exact Windows policy/ACL cause remains unknown.
- [ ] Test process metadata for a disposable listener from the actual Electron app in a non-elevated desktop session; avoid termination.
- [ ] Make metadata failures explicit (permission denied, command unavailable, process exited) rather than silently appearing as `Unknown`.
- [ ] Choose and validate a least-privilege metadata fallback not dependent on WMIC or requiring blanket elevation.
- [ ] Rerun WT-01–WT-03 after fixes; do not change FAIL/NOT IMPLEMENTED to PASS without evidence.
- [ ] Merge [Audit PR #2](https://github.com/dev-rygar/port-manager/pull/2).
- [ ] Complete follow-up for **WT-01–WT-03** and remaining **WT-04–WT-12** (or justify any N/A), with exact Windows builds and tested commits.
- [ ] Verify actual discovery, identity/parent-child relationships, permissions, process lifecycle and port occupancy.
- [ ] Check runtime security, accessibility, benchmarks, dependency vulnerabilities, installer and portable packages.
- [ ] Update findings against Windows evidence and close Phase 2 exit gate.

**Gate:** Static and mocked checks alone **do not complete** Phase 2. [Deferred testing register](https://github.com/dev-rygar/port-manager/blob/audit/engineering-audit-v1/docs/DEFERRED_WINDOWS_TESTING.md).

## 5. Phase 3 — Architecture and roadmap

- [x] Propose layered architecture with main-process authority over all destructive operations.
- [x] Define process vs listener identity and separate parent/child relationships.
- [x] Propose **preview → revalidate → execute → independently verify** stop flow.
- [x] Define M0–M4 milestones and risk-dependent ordering.
- [x] Receive owner's approval for the direction (not Windows implementation certification).
- [x] Create this central project tracker.
- [ ] Merge [Architecture PR #3](https://github.com/dev-rygar/port-manager/pull/3).
- [ ] Finalize Windows adapter, identity/termination method, protected-process policy, and OS support matrix **after test evidence**.
- [ ] Document important finalized technical choices as ADRs.

**Gate:** Architecture direction may guide test-backed implementation; OS-specific decisions stay provisional until validated.

## 6. Phase 4 — Incremental implementation

### M0 — Engineering foundation

- [x] Add Node built-in test runner and syntax-check scripts.
- [x] Add mocked service, renderer and main-process IPC tests.
- [x] Add baseline GitHub Actions workflow and testing documentation.
- [x] Open [PR #4](https://github.com/dev-rygar/port-manager/pull/4).
- [x] Verify initial CI: **10 passed / 0 failed / 17 TODO** (mock tests only).
- [ ] Review and merge PR #4.
- [ ] Convert pending safety TODOs into executable regression assertions as fixes land.

**State:** Implemented and CI-tested on a branch, not merged.

### M1 — Safety, IPC and verified termination

**M1.1 — Initial guardrails**

- [x] Implement stricter PID input validation and allow valid PIDs above 65535.
- [x] Check main-process IPC sender/frame and restrict unexpected window navigation.
- [x] Add conservative backend refusal for selected system-managed names, PID 4 and unknown names.
- [x] Require a fresh detected listener for a PID before submitting a stop command.
- [x] Use argument-based taskkill invocation instead of shell-interpolated PID.
- [x] Write guarded-operation unit tests and [limitations](https://github.com/dev-rygar/port-manager/blob/security/m1-ipc-process-guards/docs/M1_SECURITY_GUARDS.md).
- [x] Open [PR #5](https://github.com/dev-rygar/port-manager/pull/5).
- [x] Verify PR #5 CI: **26 passed / 0 failed / 16 TODO**, mocked only ([workflow run](https://github.com/dev-rygar/port-manager/actions/runs/41054458871)).
- [ ] Review/integrate PR #5 after PR #4; validate Electron sandbox/preload on Windows.

**M1.2 — Mandatory safety work still outstanding**

- [ ] Design a process-instance identity and handle PID reuse / time-of-check-time-of-use risks.
- [ ] Revalidate intended targets and backend protection policy immediately before execution; fail closed for unverifiable identity.
- [ ] Implement impact preview showing all detected related endpoints and clear parent/child distinctions.
- [ ] Verify both process state and **current requested-port availability** after stop.
- [ ] Support explicit deduplicated batch targets with individual results/partial failures.
- [ ] Fix unknown-process mislabeling and unsafe HTML attribute interpolation.
- [ ] Add passing security/identity regression tests and validate Windows-dependent behavior.

**State:** M1.1 is implemented on a branch; **M1.2 is not started**. A simple PID re-query is not sufficient proof against races.

### M2 — Windows discovery and process relationships

**Local development checkpoint — reported 2026-10-31 to 2026-11-01 (uncommitted; Codex-reviewed locally, not independently source-reviewed here):**

**2026-11-01 remediation follow-up — owner reports READY FOR REVIEW:**
- [x] Remove dynamic renderer `data-name` attributes and add safe escaping/tests; verify implementation in independent review.
- [x] Move canonical Windows PID input to PowerShell child environment instead of interpolating into script text; `execFile` remains shell-free, timed and bounded per local report.
- [x] Report **11/11 tests PASS**, syntax PASS, `git diff --check` PASS. No CI run or independent source review performed.
- [x] Preserve unchanged `killProcess` and document raw-PID stop as separate **M1.2 safety/release blocker**, not a solved M2 discovery condition.
- [x] Document integration guidance for overlapping unmerged PRs #4/#5.
- [ ] Inspect complete diff and tests, including any untracked files and the local remediation report, before authorizing a commit/push/PR.
- [ ] Review the environment-variable PID handoff for strict canonical validation, timeouts, failed lookups, and metadata-state correctness.
- [ ] Keep WT-02 smoke **INCONCLUSIVE / BLOCKED**: client connected to a disposable listener, but neither netstat nor app showed a LISTENING row. No successful end-to-end verification.


- [x] Owner reports Codex created local branch `feature/windows-process-discovery` with an uncommitted discovery implementation (no remote PR).
- [x] Owner reports replacing WMIC-first metadata with a shell-free PowerShell `Get-Process` adapter, retaining `netstat.exe -ano` listener data and `tasklist` fallback.
- [x] Owner reports six explicit metadata states, UI display, README update, eight mocked regressions, and passing `npm.cmd run check:syntax`, `npm.cmd test` (8/8), and `git diff --check`. **These are reported results; GitHub code/CI review has not happened.**
- [x] Owner reports local Codex review completed 2026-11-01 with **CHANGES REQUIRED**. PowerShell invocation reportedly uses `execFile` with timeout, but the numeric PID is still interpolated inside a `-Command` script; verify strict PID validation and prefer parameterized data passing.
- [ ] Independently inspect actual local diff and validate subprocess timeout, PID validation, and shell-injection safety. No local source or review report imported here.
- [x] Owner reports Codex identified overlapping `package.json` and `portService.js` modifications with unmerged **PR #4** and **PR #5**; tests/stop guards are not integrated in the local branch.
- [ ] Plan a non-destructive reconciliation against PR #4 and PR #5 while preserving all uncommitted changes. Merge/rebase only under a separately reviewed integration plan.
- [ ] Reproduce an isolated, persistent TCP listener visible to a separate read-only `netstat` probe in the same user session and verify the exact PID/port in Port Manager. **2026-11-01 review remained inconclusive:** disposable listener accepted a connection but no listening row appeared in either `netstat` or app. Diagnose timing/filtering/environment without claiming PASS.
- [x] Owner reports Codex found existing renderer `data-name` attribute quote-escaping injection risk; UI metadata state display alone is not an injection fix.
- [ ] Fix and regression-test renderer attribute injection (prefer DOM APIs / `dataset` and `textContent` over HTML attribute interpolation).
- [ ] Block unsafe stop operations until the main-process backend enforces process-instance identity, protected-process policy, preview/revalidation and independent verification. **Local `killProcess` still accepts raw PIDs and force-terminates**; metadata statuses are NOT authorization.
- [ ] Commit/push/open focused PR **only after explicit owner approval**, then verify CI; do not call M2 complete based on eight local mocks alone.


- [x] Trace **Codex-reported 2026-10-31 WT-02 metadata failure** to missing WMIC + access-denied tasklist fallback + swallowed error (no implementation fix yet).
- [ ] Evaluate metadata/ownership lookup options under the **confirmed normal-user permission limits**: `netstat` listener PID available, `tasklist` works for shell PID, CIM and Get-NetTCPConnection denied; test candidate APIs with disposable listener.
- [ ] Replace WMIC dependency with a validated supported discovery/metadata approach.
- [ ] Preserve distinct TCP listening endpoints (address, port, protocol and owner).
- [ ] Retrieve verified available process identity, path, command line, parent and descendants.
- [ ] Deduplicate/bound expensive OS queries and return explicit partial/permission errors.
- [ ] Test permissions, missing metadata, process churn and latency on Windows.
- [ ] Decide and document TCP-only vs explicitly supported UDP for v1.

**State:** **READY FOR REVIEW per local Codex remediation report dated 2026-11-01**, not independently source-reviewed or integrated. Prior renderer/PID-script remediation is *reported* complete; raw-PID termination remains **separately unresolved** and M2 cannot authorize stopping. Local 11/11 mocks passed, but native cross-process listener verification remains inconclusive. No commit/push/remote PR/termination tests.

### M3 — Simple developer workflow and features

- [ ] Fast port-first lookup with clear occupied/free/unknown states.
- [ ] Understandable owner identification, with uncertainty distinguished from facts.
- [ ] Related ports and parent/child inspection without default tree termination.
- [ ] Accessible impact preview, confirmation and post-action feedback.
- [ ] Arbitrary multi-select and safe deduplicated bulk operations with per-target outcomes.
- [ ] Prevent persistent port tags from authorizing future unrelated owners.
- [ ] Fix details selection, Development-tab search and stale refresh ordering.
- [ ] Improve empty/error/loading states and keyboard accessibility.
- [ ] Add development groups and evidence-qualified duplicate dev-server guidance.

**State:** Not started.

### M4 — Engineering and distribution readiness

- [ ] Upgrade to supported Electron and compatible build tooling.
- [ ] Extend CI and regression tests; audit dependency vulnerabilities.
- [ ] Verify supported Windows builds, standard-user permissions, and failure handling.
- [ ] Smoke-test installer/portable builds and clean installation/uninstallation.
- [ ] Fix README, publish license text, supported-OS limitations, troubleshooting and release notes.
- [ ] Decide code signing/SmartScreen approach and provide release artifact checksums.

**State:** Not started.

## 7. Phase 5 — Production validation

- [ ] Execute/review all deferred Windows WT-01–WT-12 with recorded evidence.
- [ ] Verify direct-IPC protected-target rejection **without attempting to kill critical OS processes**.
- [ ] Demonstrate intended target identity, impact preview and independent port availability verification.
- [ ] Verify all approved Must-have feature acceptance scenarios on supported Windows versions.
- [ ] Confirm automated tests, dependency review, accessibility and packaging gates.
- [ ] Resolve all critical/high-priority release blockers and explicitly review remaining risks.
- [ ] Approve release candidate and publish binaries **only after release gates pass**.

**Gate:** Production-ready public executable publication is **BLOCKED** until verified.

## 8. Next actions in order

1. **Get an independent reviewable M2 patch and local remediation report** while preserving uncommitted/untracked work; do not commit, push, switch branches, or lose local changes.
2. **Review reported M2 fixes:** renderer DOM/attribute safety, strict PID validation and child-environment passing, `execFile` timeout/error behavior, 11 tests, and no changed termination policy.
3. **Investigate WT-02 separately:** explain why a disposable TCP listener accepted a client but neither OS `netstat` nor app showed LISTENING. Keep smoke test blocked until repeatable OS-side evidence.
4. **Review and integrate existing PRs in dependency order** when explicitly authorized: docs #1 → #2 → #3; test foundation #4; stacked guards #5. Do not equate M1.1 with full identity-safe termination.
5. **Keep M1.2 as its own release-blocking safety workstream:** privileged backend authorization based on process-instance identity, impact preview, revalidation and post-stop verification. The M2 patch is read-only discovery progress, not an authorization to terminate PIDs.
6. **Rerun WT-01–WT-03 after fixes; WT-04–WT-06 only with safeguards:** WT-07–WT-12 remain tracked and release-blocking where applicable.

**Important:** Do not add automatic killing or broaden bulk-termination behavior while identity and permission safety remain unresolved.

## 9. How to keep this tracker current

Update the relevant checkboxes and links in the same PR that completes the work where possible. At every status change:

- Refresh the **Last updated**, **Current focus** and **PR integration tracker** sections.
- Distinguish **created on a branch**, **CI passed**, **merged to main**, and **validated on Windows**.
- Keep deferred checks unchecked and reference test IDs / source commits.
- Update the Master Plan for *requirement changes*, the Architecture/ADRs for *design decisions*, and this tracker for *progress*.

This document tracks work, not a substitute for test evidence or safety sign-off.

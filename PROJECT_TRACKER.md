# Port Manager — Project Tracker

**Last updated / GitHub status verified:** 2026-11-05  
**Status:** In development — **not production-ready**  
**Current focus:** [Epic #11](https://github.com/dev-rygar/port-manager/issues/11): S0 COMPLETE; S1 [PR #12](https://github.com/dev-rygar/port-manager/pull/12) **READY FOR FINAL INDEPENDENT REVIEW**, head `11593b9`, draft/unmerged, [CI SUCCESS](https://github.com/dev-rygar/port-manager/actions/runs/41874730585) (102 tests, 86 pass, 16 TODO, 0 fail). S2 not started; S3/S4 Windows gates outstanding; S5 UI/setup queued; S6/S7 not started. Process termination disabled on main and S1; no published releases  
**Application baseline on main:** 7fe087dd9257c5ab1a350c83468cd794ec676525 (PR #8 merge, 2026-11-04)
**Post-merge validation:** [main push CI #41829413241](https://github.com/dev-rygar/port-manager/actions/runs/41829413241) **SUCCESS**, checked at merge commit `7fe087d`; mocked tests/syntax only, not native Windows acceptance.

This is the **central progress checklist** for development and release readiness. For *what* to build, use the [Master Plan](https://github.com/dev-rygar/port-manager/pull/1); for *how* and milestone scope, use the [Architecture & Roadmap](https://github.com/dev-rygar/port-manager/pull/3); for findings and test requirements, use the [Engineering Audit](https://github.com/dev-rygar/port-manager/pull/2).

**Tracking rules:** A checked item means the named deliverable was prepared or tested to the stated extent. It does **not** imply that a PR was merged, that Windows testing passed, or that the application is production-ready. Track those gates separately. Never count TODO tests as passing tests.

## 1. Current phase status

| Phase | Status | Remaining gate |
| --- | --- | --- |
| 1 — Master Plan | **Approved; PR unmerged** | Merge PR #1 |
| 2 — In-depth audit | **Follow-up traced metadata failure: WT-01/02 FAIL / BLOCKED; WT-03 NOT IMPLEMENTED / BLOCKED (owner report)** | Fix/verify metadata behavior, rerun WT-01–WT-03; WT-04–WT-12 deferred |
| 3 — Architecture and roadmap | **Direction approved; OS choices provisional; PR unmerged** | Merge PR #3; finalize Windows-dependent decisions after testing |
| 4 — Incremental implementation | **Release Sprint Epic #11 planned S0–S7; M1.2 #10 first active work** | Agent executes reviewable S1→S2; independent review before Windows privileged tests, gate activation or merge; S5 UX follows/safe parallel |
| 5 — Production validation | **Not started** | Verify all safety, acceptance, and release gates |

## 2. GitHub PR integration tracker

**Verified 2026-11-04:** PRs #6 and #8 **MERGED** into main (`44cdc962`, `7fe087dd`); PRs #4/#5 **CLOSED without separate merge** as superseded after inventory reconciliation. Documentation PRs #1/#2/#3 remain open. PR #8's [CI](https://github.com/dev-rygar/port-manager/actions/runs/41825149963) passed (64 pass, 16 TODO, 0 fail). Windows smoke inconclusive; M1.2 incomplete.

| PR | Deliverable | GitHub state | Dependency |
| --- | --- | --- | --- |
| [#1](https://github.com/dev-rygar/port-manager/pull/1) | Master Plan v1 | Draft / open | None |
| [#2](https://github.com/dev-rygar/port-manager/pull/2) | Engineering audit + deferred testing | Ready / open | References plan |
| [#3](https://github.com/dev-rygar/port-manager/pull/3) | Architecture, roadmap **and this tracker** | Ready / open | References PRs #1 and #2 |
| [#4](https://github.com/dev-rygar/port-manager/pull/4) | M0 automated tests and CI | **Closed as superseded 2026-11-04** | M0 test/CI work reconciled into merged PR #8; did not merge old branch |
| [#5](https://github.com/dev-rygar/port-manager/pull/5) | M1.1 IPC/process guards | **Closed as superseded 2026-11-04** | M1.1 guards reconciled into PR #8; termination remains disabled pending M1.2 |
| [#6](https://github.com/dev-rygar/port-manager/pull/6) | M2 discovery and renderer remediation | **Merged to main 2026-11-01** (`44cdc962`) | Open review findings remain follow-up work, especially total refresh deadline and endpoint fidelity; DO NOT count as M2 sign-off |
| [#8](https://github.com/dev-rygar/port-manager/pull/8) | Combined M0/M1.1 + TCP diagnostics / Issue #7 | **Merged 2026-11-04 to main** (`7fe087d`) | CI 64 pass / 16 TODO / 0 fail; stops disabled; Issue #7 Windows evidence and M1.2 still pending |

Documentation approvals were recorded by the owner in conversation / PR comments; these are not GitHub-approved reviews or merges.

### Integration checklist

- [ ] Final review, mark ready, and merge PR #1.
- [ ] Review/merge PR #2 while preserving explicit testing deferrals.
- [ ] Review/merge PR #3 (including this tracker).
- [x] Reconcile M0 PR #4 work into merged PR #8; close #4 as superseded (not merged).
- [x] Reconcile M1.1 PR #5 work into merged PR #8; close #5 as superseded (not merged).
- [x] Merge [PR #6](https://github.com/dev-rygar/port-manager/pull/6) into main as an explicitly **incomplete M2 increment**. Merge commit `44cdc962`; no CI or Windows smoke validation claimed.
- [x] Address principal PR #6 discovery review findings through PR #8: netstat timeout, bounded concurrent metadata lookup, distinct binding rows, TCP-only scope, explicit unknown status. Full field-level creation-time completeness and Windows verification still require follow-up.
- [x] Independently inspect source and tests in [draft PR #8](https://github.com/dev-rygar/port-manager/pull/8) at `18639fd`. [CI run #41808318653](https://github.com/dev-rygar/port-manager/actions/runs/41808318653) passed syntax+mocked Node suite (49 passed / 16 TODO / 0 failed).
- [x] First [PR #8 code-review findings](https://github.com/dev-rygar/port-manager/pull/8#issuecomment-6627613405) addressed at `99867e1`: process termination disabled in main+service, bind cleanup uncertainty explicit, TIME_WAIT PID 0 preserved, alternative search deadline added, scripts and IPv6/error behavior improved; [CI passed](https://github.com/dev-rygar/port-manager/actions/runs/41811985208).
- [x] [Second review IPC trust boundary](https://github.com/dev-rygar/port-manager/pull/8#issuecomment-6628824764) fixed at `f73927d`: main handlers whitelist `port`, `protocol`, `localAddress` and strip internal adapters, fabricated snapshots, deadlines, timeouts, limits and signals. Spoofed IPC request tests added; [CI passed](https://github.com/dev-rygar/port-manager/actions/runs/41825149963).
- [x] On owner authorization, merge [approved PR #8](https://github.com/dev-rygar/port-manager/pull/8) into main at `7fe087dd9257c5ab1a350c83468cd794ec676525`; verified `DESTRUCTIVE_ACTIONS_ENABLED = false`, CI and committed M0 workflow; #4/#5 closed as superseded.
- [x] Pre-aborted TCP probe does not open a listener; dormant termination policy mandates `available` metadata and valid creation time; stop-safety UI copy neutral; `System` name preserved. Verified at `f73927d`.
- [x] Explicitly reconciled original #4/#5 changed-file inventories with the integrated PR #8 work and closed both without merging outdated branches.
- [x] Combined integration into PR #8 preserved newer PR #6 discovery and M1.1 guards; no separate #4/#5 merges.
- [x] Reconcile post-PR #8 main/PR states in this tracker; resume updating after future integrations.

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
- [x] M0 test/CI work merged through PR #8; original PR #4 closed as superseded.
- [ ] Convert pending safety TODOs into executable regression assertions as fixes land.

**State:** M0 merged to main through PR #8, with successful post-merge main CI; 16 TODO tests remain (not passing).

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
- [x] Integrate PR #5's M1.1 guard work through merged PR #8, instead of merging PR #5; Electron sandbox/preload native Windows validation **still pending**.

**M1.2 — Mandatory safety work still outstanding ([Issue #10](https://github.com/dev-rygar/port-manager/issues/10); next implementation milestone)**

- [ ] Design a process-instance identity and handle PID reuse / time-of-check-time-of-use risks.
- [ ] Revalidate intended targets and backend protection policy immediately before execution; fail closed for unverifiable identity.
- [ ] Implement impact preview showing all detected related endpoints and clear parent/child distinctions.
- [ ] Verify both process state and **current requested-port availability** after stop.
- [ ] Support explicit deduplicated batch targets with individual results/partial failures.
- [ ] Fix unknown-process mislabeling and unsafe HTML attribute interpolation.
- [ ] Add passing security/identity regression tests and validate Windows-dependent behavior.
- [x] PR #8 corrects `System` naming and disables destructive UI/main/backend actions, including PID 4; mocked regression coverage exists. Native Windows confirmation and full M1.2 are separate gates.

**State:** M1.1 guards merged in PR #8 with all destructive operations disabled; **M1.2 NOT IMPLEMENTED**. Issue #10 defines the next Codex work: short-lived process-instance preview/identity, handle-bound stop design, and post-stop verification. A simple PID re-query is not sufficient proof against races.

### Combined integration checkpoint — owner-reported 2026-11-04

- [x] Codex reports local `integration/m0-m1.1-port-conflict` branch based on `44cdc96…` integrates M0 test/CI scaffolding, M1.1 initial IPC/termination guards, bounded TCP discovery, and Check Port / explicit bind test / alternative suggestions from issue #7.
- [x] Owner reports local syntax and `git diff --check` PASS; GitHub independently ran syntax and mocked Node tests on `18639fd`: **49 passed / 0 failed / 16 TODO** ([successful CI](https://github.com/dev-rygar/port-manager/actions/runs/41808318653)).
- [x] Reviewed source, tests and report in PR #8 at `f73927d`. Final [senior engineering approval for development integration](https://github.com/dev-rygar/port-manager/pull/8#issuecomment-6630220512) given; Windows smoke and M1.2 release gates remain.
- [x] Reviewed PR #8's backend, IPC and renderer termination-off gates; PID 4 and uncertain targets cannot reach `taskkill` through normal app paths. **M1.2 process-instance revalidation/post-stop verification NOT implemented**.
- [x] Probe UI is opt-in; revised service reports success/unavailability only after confirmed close callback, otherwise 'Cannot determine'; delayed-listening/close-failure mocks added. Actual Windows lifecycle remains unverified.
- [ ] Document Windows smoke test as **INCONCLUSIVE/BLOCKED** because `netstat` did not expose the disposable listener; no WT-01/WT-02/WT-03 promotion to PASS.

### M2 — Windows discovery and process relationships

**Local development history — reported 2026-10-31 to 2026-11-01:** Earlier entries describe pre-merge snapshots. **Current remote state:** PR #6 commit `1e77fc8` was merged to main as `44cdc962` on 2026-11-01. Independent source review findings remain unresolved.

**2026-11-01 remediation follow-up — owner reports READY FOR REVIEW:**
- [x] Remove dynamic renderer `data-name` attributes and add safe escaping/tests; verify implementation in independent review.
- [x] Move canonical Windows PID input to PowerShell child environment instead of interpolating into script text; `execFile` remains shell-free, timed and bounded per local report.
- [x] Report **11/11 tests PASS**, syntax PASS, `git diff --check` PASS. No CI run or independent source review performed.
- [x] Preserve unchanged `killProcess` and document raw-PID stop as separate **M1.2 safety/release blocker**, not a solved M2 discovery condition.
- [x] Document integration guidance for overlapping unmerged PRs #4/#5.
- [x] Inspect PR #6's committed diff, source, tests and remediation report via GitHub. This does not include two older local-only/untracked Windows reports.
- [x] PR #8 addresses serial metadata, timeout/TCP-only semantics and distinct endpoint fidelity. [PR #6 review](https://github.com/dev-rygar/port-manager/pull/6#issuecomment-6548909082) historical. Creation-time field completeness and native OS evidence remain separately tracked.
- [x] Review PR #6's numeric PID-to-environment handoff and shell-free discovery command. Confirmed source construction; error states and tests are present, but total query duration and field-completeness semantics require changes.
- [ ] Keep WT-02 smoke **INCONCLUSIVE / BLOCKED**: client connected to a disposable listener, but neither netstat nor app showed a LISTENING row. No successful end-to-end verification.


- [x] Owner previously created the local `feature/windows-process-discovery` branch; it has since been **committed and pushed** as draft PR #6.
- [x] Owner reports replacing WMIC-first metadata with a shell-free PowerShell `Get-Process` adapter, retaining `netstat.exe -ano` listener data and `tasklist` fallback.
- [x] Owner reports six explicit metadata states, UI display, README update, eight mocked regressions, and passing `npm.cmd run check:syntax`, `npm.cmd test` (8/8), and `git diff --check`. **These are reported results; GitHub code/CI review has not happened.**
- [x] Owner reports local Codex review completed 2026-11-01 with **CHANGES REQUIRED**. PowerShell invocation reportedly uses `execFile` with timeout, but the numeric PID is still interpolated inside a `-Command` script; verify strict PID validation and prefer parameterized data passing.
- [x] Review PR #6 source diff and committed report independently on GitHub; identified bounded per-command timeouts but **unbounded total refresh duration**, plus other M2 issues. See [review comment](https://github.com/dev-rygar/port-manager/pull/6#issuecomment-6548909082).
- [x] Owner reports Codex identified overlapping `package.json` and `portService.js` modifications with unmerged **PR #4** and **PR #5**; tests/stop guards are not integrated in the local branch.
- [x] Non-destructive reconciliation completed in merged PR #8; original #4/#5 branches closed as superseded.
- [ ] Reproduce an isolated, persistent TCP listener visible to a separate read-only `netstat` probe in the same user session and verify the exact PID/port in Port Manager. **2026-11-01 review remained inconclusive:** disposable listener accepted a connection but no listening row appeared in either `netstat` or app. Diagnose timing/filtering/environment without claiming PASS.
- [x] Owner reports Codex found existing renderer `data-name` attribute quote-escaping injection risk; UI metadata state display alone is not an injection fix.
- [x] PR #6 removes unsafe process-derived `data-name` interpolation and adds renderer escaping/source tests (independent source review performed; broader DOM behavior verification remains a separate gate).
- [x] Main, service and renderer in merged PR #8 refuse all destructive operations while M1.2 remains incomplete; raw-PID execution path is unreachable through the application gate. Do not re-enable before identity/impact/revalidation/verification.
- [x] Commit/push draft [PR #6](https://github.com/dev-rygar/port-manager/pull/6) for review; 11 local mocked tests reported passing.
- [x] Integrated PR #8 CI verified: [run #41825149963](https://github.com/dev-rygar/port-manager/actions/runs/41825149963) passed syntax and 64 mocked Node tests, 16 TODO.


- [x] Trace **Codex-reported 2026-10-31 WT-02 metadata failure** to missing WMIC + access-denied tasklist fallback + swallowed error (no implementation fix yet).
- [ ] Evaluate metadata/ownership lookup options under the **confirmed normal-user permission limits**: `netstat` listener PID available, `tasklist` works for shell PID, CIM and Get-NetTCPConnection denied; test candidate APIs with disposable listener.
- [ ] Replace WMIC dependency with a validated supported discovery/metadata approach.
- [ ] Preserve distinct TCP listening endpoints (address, port, protocol and owner).
- [ ] Retrieve verified available process identity, path, command line, parent and descendants.
- [ ] Deduplicate/bound expensive OS queries and return explicit partial/permission errors.
- [ ] Test permissions, missing metadata, process churn and latency on Windows.
- [ ] Decide and document TCP-only vs explicitly supported UDP for v1.
- [x] Accept [issue #7](https://github.com/dev-rygar/port-manager/issues/7) as an M2/M3 feature gap: a port may fail application binding without appearing in the TCP LISTENING-only All Ports table. Incident root cause still unverified.
- [x] Re-reviewed Check Port: PID-0 TIME_WAIT context, address-scope handling and main diagnostic IPC whitelisting corrected by `f73927d`. Native Windows end-to-end evidence still required.
- [x] Explicit-click probe retains cleanup uncertainty; pre-aborted signal returns before `server.listen` (PR #8 `f73927d`). Windows probe lifecycle still requires validation.
- [x] Alternative-port search now reuses one network snapshot and enforces a total 5s deadline in the production path; do not expose override fields through IPC.
- [ ] M2: test targeted port checks on normal Windows for loopback, wildcard, IPv4/IPv6, active listener, non-LISTENING state, access-denied, excluded range where available, and transient races. Never perform process termination as a diagnostic.

**State:** M2 PR #6 and combined PR #8 are MERGED in main; updated TCP discovery and targeted Issue #7 diagnostics are available in development code. CI at PR #8 head passed 64/80 tests (16 TODO). Native Windows WT-02 remains inconclusive, exact process-instance identity and broad metadata still incomplete. Destructive operations are **globally disabled** pending M1.2. No M2/Issue #7 Windows acceptance yet.

### M3 — Simple developer workflow and features

- [ ] Fast port-first lookup with clear occupied/free/unknown states.
- [x] M3 [Issue #7 Check → Diagnose → Guided Resolve UI](https://github.com/dev-rygar/port-manager/issues/7) merged via PR #8. Security P1 source-review fixes complete; owner reports original incident no longer reproducible, **native Windows end-to-end acceptance still pending**.
- [x] Define [M3.1 Issue #9](https://github.com/dev-rygar/port-manager/issues/9): port-first UI hierarchy, first-use help, honest evidence/unknown outcomes, clear Development-tab tags, accessible empty/error/loading, and Windows installation/run-from-source documentation. **Owner placed this Codex assignment ON HOLD; not implemented.**
- [ ] Implement M3.1 UX and regression tests in a new Codex feature branch and submit a draft PR for independent design/code review.
- [ ] Rewrite inaccurate README (currently claims Kill/installer download links) and add canonical Windows setup/how-to guide. No published GitHub releases verified 2026-11-04; do not invent downloads or claim signed Windows builds.
- [ ] Treat an optional active bind probe as an explicitly user-initiated, short-lived feature requiring separate engineering risk review; do not implement automatic probes during refresh.
- [ ] Understandable owner identification, with uncertainty distinguished from facts.
- [ ] Related ports and parent/child inspection without default tree termination.
- [ ] Accessible impact preview, confirmation and post-action feedback.
- [ ] Arbitrary multi-select and safe deduplicated bulk operations with per-target outcomes.
- [ ] Prevent persistent port tags from authorizing future unrelated owners.
- [ ] Fix details selection, Development-tab search and stale refresh ordering.
- [ ] Improve empty/error/loading states and keyboard accessibility.
- [ ] Add development groups and evidence-qualified duplicate dev-server guidance.

**State:** M3 initial Check Port workflow merged via PR #8; **M3.1 specified but not implemented**. Issue #9 is scheduled for S5 in the release sprint backlog; previous standalone Codex task not sent, so no branch/PR claimed. M1.2 first, native Windows acceptance open.

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

### S0/S1 checkpoint — 2026-11-04

- [x] S0 current `main` baseline `7fe087dd` checked by Codex, no unrelated tracked changes included, prior Windows reports preserved.
- [x] S1 read-only process preview **implemented on [draft PR #12](https://github.com/dev-rygar/port-manager/pull/12)** at `867def2`; includes main-owned IPC, backend policies, affected endpoints, token store and read-only renderer view. This means submitted for review, **not accepted or merged**.
- [x] [CI run #41847638708](https://github.com/dev-rygar/port-manager/actions/runs/41847638708) independently verified successful: **90 tests / 74 pass / 16 TODO / 0 fail**, syntax PASS; mocked only.
- [x] Initial [PR #12 review](https://github.com/dev-rygar/port-manager/pull/12#issuecomment-6634543463) substantially addressed at `d0ba563`: stale renderer response checks, document epoch, observed metadata wording, token bound/eviction. [CI PASS](https://github.com/dev-rygar/port-manager/actions/runs/41860570056) (83 pass / 16 TODO / 0 fail).
- [x] Direct remediation at `11593b9` implements request-start generations, immediate token supersession, global lifecycle invalidation and in-flight stale checks with three mock regression tests. [CI #41874730585](https://github.com/dev-rygar/port-manager/actions/runs/41874730585) PASS (86 pass / 16 TODO / 0 fail). [PR #12 implementation comment](https://github.com/dev-rygar/port-manager/pull/12#issuecomment-6636984664). **Independent final re-review and merge approval still pending.**
- [ ] S2 mocked same-handle executor/verification not started. M1.2 real stops, Windows tests, feature-gate activation, merger and release remain unapproved.

## 8. Next actions in order — 2026-11-04 release sprint program

**Execution plan:** [Release Sprint Plan S0–S7](docs/RELEASE_SPRINT_PLAN.md) · [GitHub Epic #11](https://github.com/dev-rygar/port-manager/issues/11). Each story specifies happy-path and unhappy-path expected outcomes, required evidence, PR outputs and explicit safety gates. AI agent may implement unblocked stories continuously but cannot merge, execute real stops, enable destructive actions or release without human approval.

**Execution checkpoint:** S0 baseline verified. S1 [PR #12](https://github.com/dev-rygar/port-manager/pull/12) revised directly at `11593b9`; [CI #41874730585](https://github.com/dev-rygar/port-manager/actions/runs/41874730585) passed 86/102 tests with 16 TODO. Review of final async-token fix still needed; no actual termination, merge, activation or release.



1. **Final S1 re-review of [PR #12](https://github.com/dev-rygar/port-manager/pull/12):** async token concurrency fix pushed and CI passed at `11593b9`; confirm race behavior and security scope before authorizing development merge. S2 remains dependent on accepted token semantics.
2. **S5 UX/setup is QUEUED, not implemented:** [Issue #9](https://github.com/dev-rygar/port-manager/issues/9) is part of [Release Sprint Epic #11](https://github.com/dev-rygar/port-manager/issues/11). The old separate Codex command was never sent; no M3.1 feature branch/draft PR is claimed. The agent may do independent non-destructive UX/docs work while waiting on privileged Windows approvals.
3. **Windows Issue #7 and WT-01–WT-03 — DEFERRED, NOT PASSED:** original port-5173 issue is no longer reproducible. Later use disposable app-owned listeners and synchronized OS/Electron evidence, not another project or actual system process; no destructive testing.
4. **Documentation integration PRs #1 → #2 → #3 — OPEN/UNMERGED:** approve/merge separately when authorized. This tracker lives on PR #3's branch, **not main**.
5. **M4 production readiness — NOT STARTED:** Electron/build tooling lifecycle, dependency audit, Windows installer/portable smoke, standard-user permissions, accessibility, and deferred WT-01–WT-12; no release or binaries before safety acceptance.

**Completion sequence:** Follow [Release Sprint Plan S0–S7](docs/RELEASE_SPRINT_PLAN.md) and [Epic #11](https://github.com/dev-rygar/port-manager/issues/11). After S0 baseline, S1 read-only identity/preview, S2 handle-bound mocked executor, S3 non-destructive Windows discovery, S4 human-approved disposable stop and activation decision, S5 UX/docs, S6 security/packaging/WT-08–12, S7 explicitly authorized release. Independent S5 tasks may proceed in parallel without touching destructive gates. No unreviewed merges, actual stops or releases.

**Important:** Do not add automatic killing or broaden bulk-termination behavior while identity and permission safety remain unresolved.

## 9. How to keep this tracker current

Update the relevant checkboxes and links in the same PR that completes the work where possible. At every status change:

- Refresh the **Last updated**, **Current focus** and **PR integration tracker** sections.
- Distinguish **created on a branch**, **CI passed**, **merged to main**, and **validated on Windows**.
- Keep deferred checks unchecked and reference test IDs / source commits.
- Update the Master Plan for *requirement changes*, the Architecture/ADRs for *design decisions*, and this tracker for *progress*.

This document tracks work, not a substitute for test evidence or safety sign-off.

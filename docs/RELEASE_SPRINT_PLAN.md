# Port Manager — Release Sprint Plan v1
**Date:** 2026-11-04  
**Status:** Planned execution; no sprint beyond the merged baseline has passed its exit gate.  
**Source of truth:** This plan plus [Project Tracker](../PROJECT_TRACKER.md); [Master Plan (PR #1)](https://github.com/dev-rygar/port-manager/pull/1), [Audit (PR #2)](https://github.com/dev-rygar/port-manager/pull/2), [Architecture (PR #3)](https://github.com/dev-rygar/port-manager/pull/3).  
**Baseline:** `main` at `7fe087dd9257c5ab1a350c83468cd794ec676525` (merged PR #8); [post-merge CI](https://github.com/dev-rygar/port-manager/actions/runs/41829413241) passed, based on **80 tests: 64 pass, 16 TODO, 0 fail**. This proves mocked coverage only, not Windows runtime safety.

## Goal and boundaries
Deliver a Windows port-conflict resolver that supports **diagnose → identify exact process instance → preview consequences → intentionally stop a selected instance → independently verify process and port → report truthfully**, plus an approachable UI, accurate installation docs, and a validated Windows release.

**Guiding principles:** Simple by default; safe by design; transparent about consequences. An unfamiliar process is not assumed safe. Port tags, common port associations, a PID alone and renderer state are never authorization to terminate a process.

### Critical permissions
- **Allowed without new human authorization:** inspect code; create branches; develop code; write/update tests and docs; run simulated/mock tests; controlled read-only diagnostics; start/close app-owned disposable test listeners; commit/push *non-release* feature branches and open draft PRs for review.
- **Require explicit review/approval:** merge any PR; change production destructive-action gates; run real process termination even against disposable test processes; elevate privileges; adjust Windows system/security/network settings; publish or distribute a binary; mark Windows tests or release gates passed without observed evidence. A code-review approval alone is not authority to kill a process or release binaries.
- **Never:** kill protected/unrelated/system targets or user's real projects as a test; use a raw PID-only fallback after an identity check; automatically stop a process tree; treat `TIME_WAIT` as automatic proof of conflict; treat no listener as guaranteed free; silently downgrade errors.
- **Feature flag:** `DESTRUCTIVE_ACTIONS_ENABLED = false` across renderer, Electron main, and service while M1.2 is built and reviewed. Turning it on requires separate authorization *after* Windows proof and a re-review.
- **Historical issue:** the original port-5173 conflict is no longer reproducible on the owner's machine. Do not force it to recur. Preserve [Issue #7](https://github.com/dev-rygar/port-manager/issues/7) as an independent synthetic Windows acceptance gate.

## Execution method: one increment per draft PR
1. **Sync:** fetch `main`, examine `git status`, verify starting SHA, preserve all unrelated/untracked files and avoid blind resets/stashes. Consult the open PRs/issues and existing code before implementing.
2. **Pick:** choose the **first incomplete, unblocked sprint** below; split it into reviewable vertical slices if too large. No big-bang cross-sprint refactor.
3. **Specify:** in the PR description, list story IDs, expected happy/unhappy outputs, protected boundaries and which tests will prove them. Record reasonable assumptions instead of asking repetitive clarification questions.
4. **Implement:** use existing Electron/vanilla JS and test runner unless a Windows handle-bound adapter needs a narrowly justified component. Keep IPC sender and input whitelists, metadata escaping and fail-closed semantics.
5. **Validate:** run `npm.cmd run check:syntax`, `npm.cmd test`, `git diff --check`, plus scenario-specific tests; compare expected against observed, including non-passing TODOs. Use separate Windows evidence when a scenario depends on actual Windows semantics. Never mislabel mocks as native validation.
6. **Publish:** commit/push **only relevant files** to a dedicated feature branch; open a **draft PR** against latest compatible `main`; add review report `docs/test-results/SPRINT_<ID>_REVIEW.md` with code changes, test counts, happy/unhappy evidence, known bugs, TODOs, screenshots as applicable, and explicit gate status.
7. **Review gate:** stop for independent review and human merge authorization. If there is a blocker, open/attach an issue and mark the sprint **BLOCKED**, not DONE. **While blocked**, the agent may implement independent, non-destructive stories on separate fresh branches but may not merge, bypass safety conditions, enable stop, or claim the dependent sprint complete. Resume dependent work only after the gate clears.
8. **Recheck:** after an authorized merge, confirm the new `main` SHA, post-merge CI and zero safety regressions before starting the next dependent slice. Keep this plan and `PROJECT_TRACKER.md` synchronized through reviewed PRs.

**Sprint status vocabulary:** NOT STARTED → IN PROGRESS → READY FOR REVIEW → CHANGES REQUIRED / BLOCKED → APPROVED FOR DEVELOPMENT MERGE → MERGED / VALIDATED. **MERGED ≠ Windows validated ≠ release-ready.**

**Definition of Done (every sprint):** all scoped stories implemented; at least one passing automated happy test *and* one passing negative/error test for each critical story; no new open P1 security defect; CI green; report + changed-file inventory + real test counts; reviewer signs off; authorized merge verified. Windows-dependent scenarios remain `BLOCKED / NOT VERIFIED` until run on Windows.

## S0 — Baseline and handoff discipline
**Dependency:** already merged PR #8. **Status:** Baseline established; planning and outstanding docs not yet integrated.  
**Goal:** prevent agents from working on stale branches or misreporting completion.

| Story | Happy path → expected output | Unhappy path → expected output |
| --- | --- | --- |
| S0-01 Baseline | Checkout current `main` and run syntax/unit tests → record SHA and counts, no destructive subprocess | Stale branch or dirty working tree → preserve changes, do not reset or mix unrelated files |
| S0-02 Planning/docs | Read #1/#2/#3/#7/#9/#10 and register remaining gates → documented prioritized backlog | Conflicting documentation → identify discrepancy; do not assume unmerged docs are in main |
| S0-03 Safety flag | Direct `ports:kill` call while feature disabled → refused before OS call | Spoofed frame/payload, PID 4, unknown identity → refused; no OS execution |

**Output:** sprint baseline table, test log and gates in a review report; documentation PRs #1/#2/#3 remain separately reviewed/merged only on explicit approval.  
**Exit:** secure baseline verified; sprint S1 can begin.

## S1 — M1.2 Process identity, protected-target policy and read-only impact preview
**Issue:** [#10](https://github.com/dev-rygar/port-manager/issues/10). **Status:** NOT STARTED. **Dependency:** S0. **Stop gate:** FALSE.

| Story | Happy path → expected output | Unhappy path → expected output |
| --- | --- | --- |
| S1-01 Identity | Disposable `node.exe` listener on `127.0.0.1:5173` with reliable OS identity → exact PID + process creation identity + address/protocol/port recorded; no stop | Name-only `tasklist`/metadata denied or PID changes → `unverifiable`/`identityChanged`, preview not actionable |
| S1-02 Impact preview | One verified process listening on two addresses/ports → preview lists **both** current endpoints; selected endpoint highlighted; relatives informational | Parent/child unrelated to selected owner → do **not** add to stop targets or infer shared port ownership |
| S1-03 Authorization | Trusted frame obtains short-lived opaque one-time preview handle bound to exact instance, session and expiry → display preview, **no execution** | Forged/expired/reused/cross-window handle, port-tag substitution or changed binding → `refused`/`stalePreview` |
| S1-04 Protection | Ordinary verified disposable process → eligible for later review (not automatically safe) | PID 0/4, Windows critical process, Electron app itself, ambiguous/partial owner → backend `refused`, no stop action |

**Output:** testable `WindowsProcessAdapter` interface, preview/authorization domain types, IPC contracts, mock anti-spoof tests, limitations/rights design note, draft PR.  
**Exit:** independent security/code review agrees the preview cannot confer authorization by PID or UI label; **stop stays disabled**.

## S2 — M1.2 Handle-bound execution and independent verification (mocked only)
**Issue:** [#10](https://github.com/dev-rygar/port-manager/issues/10). **Status:** NOT STARTED. **Dependency:** S1 merged/reviewed. **Stop gate:** FALSE.

| Story | Happy path → expected output | Unhappy path → expected output |
| --- | --- | --- |
| S2-01 Instance-bound adapter | Simulated process handle opened, creation identity verified **on same handle**, authorized exact instance → mock stops only that handle, closes resources | Handle/rights unavailable or identity cannot be bound → fail closed; **no `taskkill /PID` or `Stop-Process -Id` fallback** |
| S2-02 Execution recheck | Fresh unconsumed preview, matching instance/endpoint and explicit acknowledgement → mock action proceeds once | Token expired/replayed, process exited/reused PID, changed owner or missing acknowledgement → no OS operation |
| S2-03 Outcome | Mock termination completion + independent snapshot shows selected listener absent → `stopped`; port `noListenerObserved` not guaranteed free | Mock command returns success but process alive, replacement listener on same port, permission denied, verification timeout → distinct statuses `failed`, `stillOccupied`, `permissionDenied`, `cannotDetermine` |
| S2-04 Scope | Stop-one targets exactly one process instance → descendants untouched | Caller injects extra PID, changes selected port or requests implicit tree stop → refusal |

**Output:** production-shaped but **gated-off** Windows handle-backed executor design/bridge or explicit unsupported fail-closed adapter; unit-level executor and verification tests; decision record for API packaging, ownership, timeouts and cleanup.  
**Exit:** no false claim of atomicity from re-query + PID kill, no running OS kill tests; review sign-off before controlled Windows stage.

## S3 — Windows non-destructive compatibility, discovery and permissions
**Issues:** [#7](https://github.com/dev-rygar/port-manager/issues/7), [#10](https://github.com/dev-rygar/port-manager/issues/10). **Status:** NOT STARTED / prior WT failures unresolved. **Dependency:** S1/S2 contracts for identity tests; read-only probes may run in parallel. **Stop gate:** FALSE.

| Story | Happy path → expected output | Unhappy path → expected output |
| --- | --- | --- |
| S3-01 Discovery WT-01/02 | App-owned persistent TCP listener appears in both synchronized `netstat` and Port Manager at exact address/port/PID → evidence PASS | Listener absent or OS tools denied (historic WT-02) → `INCONCLUSIVE/BLOCKED` with OS and app snapshots; never fabricate owner |
| S3-02 Metadata WT-03/07 | Supported normal-user Windows identity/creation/rights readable → backend records confidence and relationships accurately | Standard-user `Get-CimInstance`/`Get-NetTCPConnection` access denied, missing image/start time → uncertain/fail closed without elevation |
| S3-03 Port checks | User chooses busy vs free address, opt-in bind test of app-owned test ports → `Listening`, `Unavailable`, `No listener observed`, or `Available at check time` with provenance | `TIME_WAIT` PID 0, IPv6 dual-stack ambiguity, excluded ranges, raced owner, cleanup timeout → truthful context/`Cannot determine`, never automatic probe/kill |
| S3-04 Resource/IPC WT-08/09 | Bounded metadata/diagnostics, trusted Electron sender, keyboard-operable safe UI → observed evidence and timing | Timeout, missing netstat, unsupported address family, unauthorized frame → explicit error/refusal and bounded resource cleanup |

**Output:** `docs/test-results/WINDOWS_WT01_WT03_WT07_WT09.md` (OS build, permissions, commands, synchronized timestamps, expected vs actual), updated tests and issue links.  
**Exit:** no assertion of Windows PASS without direct evidence. Missing original 5173 conflict is **not** a blocker; synthetic app-owned sockets replace it.

## S4 — Controlled Windows stop validation, single-target activation decision, then multi-select
**Issues:** [#10](https://github.com/dev-rygar/port-manager/issues/10). **Status:** NOT STARTED. **Dependency:** S2 reviewed + S3 identity/protection proven. **Manual safety gate.**

| Story | Happy path → expected output | Unhappy path → expected output |
| --- | --- | --- |
| S4-01 Controlled stop WT-04/06 | **After explicit owner approval**, stop only a freshly spawned disposable test process via bound handle → instance exits, affected ports rechecked; per-step evidence recorded | PID reused, target exits, preview stale, handle rights denied → execution refused; no other process affected |
| S4-02 Confirmation and outcomes | User explicitly selects one verified instance, sees all affected endpoints, confirms forceful stop → accurate per-target and port outcome | User cancels, double-submits, another owner rebinds port, status not verifiable → no execution or explicit partial/unknown outcome |
| S4-03 Bulk WT-05 | Select 2–3 disposable test instances including duplicate ports → deduped explicit instance targets, combined preview, independent per-target results | One protected/unknown/permission-denied target or one fail → refuse that target, report partial results; no stop-tree expansion |
| S4-04 Feature activation | Security reviewer verifies WT-04/05/06/07 proof and exact targeted behavior → **separate explicit owner decision** whether to enable Stop | Any OS handle, verification, process-policy or protected-target gap → feature flag stays off; release remains blocked |

**Output:** Windows-only controlled test report and reviewed stop UX; production Stop activation only via separate reviewed PR and explicit approval. No blanket elevation.  
**Exit:** single and bulk must-have scenarios proven; otherwise remain incomplete/blocked. Do not perform real stop tests without human approval for the precise disposable fixture.

## S5 — M3.1 Usability, accessibility, first-run guide and install instructions
**Issue:** [#9](https://github.com/dev-rygar/port-manager/issues/9). **Status:** QUEUED; owner previously put standalone command on hold, now included in release backlog. **Dependency:** stable backend contracts; non-destructive UX/doc tasks can proceed on a separate branch while S4 approval is pending.

| Story | Happy path → expected output | Unhappy path → expected output |
| --- | --- | --- |
| S5-01 Port-first UX | New user enters `5173` → concise result/evidence/timestamp and clear next action in few interactions | Unknown/denied/no listener/expired probe → accurate uncertainty, manual retry/alternative, no misleading “free” or “safe to kill” claim |
| S5-02 Lists/details | Search/sort All Ports, manually tag a dev port, inspect exact endpoint on a narrow window → clear feedback and preserved selection | Empty table, stale refresh, partial metadata, long names, inaccessible keyboard menu → proper empty/error state; no crash/markup injection |
| S5-03 Preview/feedback | Authorized future Stop flow shows consequences and independent final state; screen-reader/keyboard navigation works | Force stop disabled or validation unknown → no actionable bypass; readable explanation |
| S5-04 Setup/documentation | On Windows with Node 22 CI baseline, `git clone`, `npm.cmd ci`, `npm.cmd start` → launches development app; tests documented | PowerShell `npm.ps1` blocked, offline install, metadata access denied, no published installer → `npm.cmd` workaround, truthful troubleshooting; **no invented release download** |

**Output:** verified `README.md`, `docs/GETTING_STARTED.md`, help UI, accessible renderer tests, UI screenshots where available, draft PR.  
**Exit:** first-run and empty/error/accessibility acceptance exercised; docs match actual scripts, `package-lock.json`, supported OS limitations, published releases state; no unreviewed UI features.

## S6 — M4 Production hardening, packaging and release candidate
**Status:** NOT STARTED. **Dependencies:** S3–S5 critical results.

| Story | Happy path → expected output | Unhappy path → expected output |
| --- | --- | --- |
| S6-01 Dependencies | Supported Electron/build-tool selection and lockfile audit → justified upgrades, reproducible CI and resolved critical vulnerabilities | Unsupported Electron, vulnerable critical dependency, broken lockfile → repair and retest; no release |
| S6-02 Package WT-10 | Clean Windows x64 install/portable run/uninstall under ordinary user; no unexpected elevation → logged proof, artifact hashes | Antivirus/SmartScreen unsigned warning, installer fails, missing binaries → document/resolve; unsigned artifact not advertised as trusted |
| S6-03 Security WT-07/08/11 | CSP, sandbox, IPC whitelist, no injection, no dangerous default permissions, dependency review → verified | Untrusted sender, URL navigation, injected metadata, privilege escalation → fail/repair; block release |
| S6-04 UX/perf WT-09/12 | Acceptable bounded UI response and keyboard-only flows on target Windows versions → measured evidence | Hung netstat, lost results, inaccessible confirmation or high P1 regressions → fix, retest |

**Output:** version/support matrix, vulnerability disposition, reproducible artifact manifest/checksums, release notes, installation evidence and `docs/test-results/RELEASE_CANDIDATE_VALIDATION.md`; release-candidate PR **only**, no public binary by default.  
**Exit:** all Must-haves + WT-01–WT-12 passed or explicitly justified N/A; zero unresolved P1 release blockers; installation, security and accessibility reviewed.

## S7 — Final release authorization and post-release smoke
**Status:** NOT STARTED. **Dependency:** all S0–S6 gates green with evidence.

| Story | Happy path → expected output | Unhappy path → expected output |
| --- | --- | --- |
| S7-01 Release review | Owner approves exact commit, tested installer/portable files, checksum, version and notes → signed-off release manifest | Missing Windows test, unsigned artifact risk not accepted, unknown process-stop correctness → **NO-GO** |
| S7-02 Publication | **After explicit release approval**, publish linked release and verified assets → download links match real GitHub artifacts; sample install/smoke passes | Upload/checksum mismatch, installer fails or new security issue → stop publication/roll back draft, issue recorded |
| S7-03 Aftercare | New user installs, checks a free/busy port and sees reliable guidance → release marked delivered | Unexpected crash/error or unsafe stop → issue severity triaged and safe-disable/rollback path documented |

**Output:** release approval record, real GitHub release URL/checksums if actually published, post-release smoke evidence and updated tracker.  
**Exit:** release marked complete *only if* actual verified assets and validated behavior exist; otherwise status remains NO-GO.

## Mandatory agent handoff format at the end of every slice

```text
Sprint / Story IDs:
Starting main SHA / feature branch / head SHA:
GitHub draft PR:
Implemented files and behavior:
Happy path → expected / observed / evidence:
Unhappy path → expected / observed / evidence:
Tests: pass / fail / TODO, commands and CI link:
Native Windows: PASS / FAIL / BLOCKED / NOT RUN, evidence:
Security gate: termination disabled? OS calls mocked? protected paths checked?
Known P1/P2 gaps, blockers, untracked local files preserved:
Review verdict: READY FOR REVIEW / CHANGES REQUIRED / BLOCKED:
Next **unblocked** story (same sprint or independent):
Approval needed before proceeding (merge / real stop / gate activation / release):
```

**Critical:** An AI agent can continue implementing *unblocked independent stories* within its authorized session, but cannot autonomously approve its own safety tests, merge, activate destructive code, or release. An issue/PR and successful tests are not substitutes for those approvals.

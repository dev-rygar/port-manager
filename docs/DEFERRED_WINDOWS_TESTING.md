# Deferred Windows Testing — Port Manager

**Status:** Initial and follow-up checks reported on 2026-10-31 (WT-01/02 FAIL / BLOCKED; WT-03 NOT IMPLEMENTED / BLOCKED); remaining validation deferred  
**Related audit:** [ENGINEERING_AUDIT.md](ENGINEERING_AUDIT.md)  
**Audit PR:** [#2 — Phase 2 engineering audit](https://github.com/dev-rygar/port-manager/pull/2)  
**Audit target:** main at e4a1585cb7755c24a04140834d92d9a3754d28ee  
**Responsible:** Project owner (Codex-assisted Windows validation), with evidence and retry results to be assessed against the audit.
**Initial and follow-up Windows triage:** [WT-01–WT-03 reported results](test-results/WT01-WT03_REPORTED_TRIAGE_2026-10-31.md).

> **Decision:** Accept the source-level and controlled-execution audit report for planning purposes now. **Defer hands-on Windows validation to a later session.** This is a schedule deferral, **not** a passing test result, waiver of safety controls, or approval to ship production executables.

## 1. What is already completed

- Full tracked source review and initial dependency/configuration review.
- Controlled execution of unmodified main/service/renderer code using mocks; 17 probes documented in the audit.
- 20 prioritized findings and a feature gap matrix against Master Plan v1.
- Recommended safety-first implementation order.

**No production Windows runtime tests were performed.** No actual system process was terminated.

## 1.1 Initial Windows testing resumed — 2026-10-31

The project owner ran initial and follow-up Windows diagnostics with VS Code Codex and reported: **WT-01 FAIL / BLOCKED**, **WT-02 FAIL / BLOCKED**, and **WT-03 NOT IMPLEMENTED / BLOCKED**. This updates the prior "all deferred" state but does **not** complete those three tests or close the phase. See the [triage record](test-results/WT01-WT03_REPORTED_TRIAGE_2026-10-31.md).

The full initial and follow-up local reports are not accessible in this GitHub update; findings are **owner-reported** until command-level evidence is reviewed. The follow-up identifies a concrete app failure chain: missing WMIC → `tasklist` **Access denied** → exception swallowed → empty metadata map → displayed process name `Unknown`. The Codex-session permission limitation still requires comparison with a normal non-elevated shell. PowerShell's `npm.ps1` execution policy is unrelated to these metadata failures.

### Additional ordinary-terminal evidence — 2026-10-31

The owner executed read-only commands in **normal, non-elevated PowerShell outside Codex**. `Get-Process` and `tasklist /FI "PID eq $myPid" /FO CSV /NH` successfully identified the shell's own PID (`20000`) and `powershell.exe`. This demonstrates `tasklist` **works in that context**, contrary to the access denial reported in the Codex session. The cause of the environment difference is not yet isolated.

**Subsequent explicit non-elevated PowerShell checks (2026-10-31) resolved the formatting ambiguity:** Both `Get-CimInstance Win32_Process` for the shell's own PID and `Get-NetTCPConnection -State Listen` separately returned **`Access denied`**. They are installed but blocked in this ordinary user context, not only in Codex. `tasklist` and `Get-Process` succeeded for the shell's own process. The exact Windows policy or ACL causing the denied calls remains unknown. **WT-01/02 stay FAIL / BLOCKED; WT-03 stays NOT IMPLEMENTED / BLOCKED.** More details are logged in the [triage note](test-results/WT01-WT03_REPORTED_TRIAGE_2026-10-31.md).

### Local M2 discovery improvement reported — 2026-10-31

The owner reports a **local, uncommitted** `feature/windows-process-discovery` branch that replaces WMIC-based process-name lookup with a shell-free PowerShell `Get-Process` mechanism, retains `netstat.exe -ano` and a `tasklist` fallback, and introduces explicit metadata statuses (available, partial, permission-denied, command-unavailable, process-exited, unavailable). The owner also reports UI/readme updates, eight passing mocked tests, syntax and `git diff --check` passes. The implementation source/diff and the local [WINDOWS_DISCOVERY_IMPROVEMENT.md] report have **not** been uploaded or independently reviewed; no commit or push occurred.

**WT-02 is not retested successfully:** a separate read-only probe did not observe the disposable listener from the reported cross-process session, so live listener/owner verification is **inconclusive**, not PASS. WT-01 remains FAIL/BLOCKED and WT-03 NOT IMPLEMENTED/BLOCKED. Review source/test provenance, test a persistent listener while running from the same environment, and validate without process termination before changing any WT result.

### 2026-11-01 — Local discovery code review: CHANGES REQUIRED

**Provenance:** Project owner relayed Codex's local `WINDOWS_DISCOVERY_REVIEW_2026-11-01.md` findings. The local report, source diff, and raw test evidence are **not uploaded here**, so these are reported review observations, not independent GitHub code review. The local `feature/windows-process-discovery` branch remains **uncommitted and unpushed**.

- **Critical stop authorization blocker:** The local code's `killProcess` can still force-terminate a raw PID without validating process-instance identity or metadata state. Neither a reported `available` metadata state nor integration of the partial M1.1 checks alone proves a safe stop contract. Do not run or publish destructive actions until the privileged backend has a reviewed, fail-closed identity/preview/revalidation/verification path.
- **Command construction:** The PowerShell `execFile` call has timeout and avoids the Node shell, but interpolates a numeric PID inside a `-Command` script. Confirm canonical numeric validation at every entry point and consider fixed-script parameterized arguments to minimize interpolation.
- **Renderer:** Existing `data-name` attribute interpolation is still vulnerable to improper quote escaping; use safe DOM APIs and targeted regression tests.
- **PR integration:** `package.json` and `portService.js` overlap the unmerged M0 PR #4 and stacked M1.1 PR #5. Preserve local changes; plan conflict resolution before committing or rebasing.
- **Live WT-02 smoke:** Disposable test listener accepted a client connection, but both `netstat` and the application showed no listening row during the separate probe. This is **inconclusive**, not a listener-discovery pass; investigate timing/state/filter/context.
- **Mocked checks:** Syntax, eight tests (8/8), and `git diff --check` were reported PASS, but do not validate privileged termination or live Windows discovery.
- **Safety:** No process termination, elevation, install, commit, push or merge was performed, per owner report.

**Statuses unchanged:** WT-01 FAIL / BLOCKED; WT-02 FAIL / BLOCKED; WT-03 NOT IMPLEMENTED / BLOCKED. WT-04–WT-12 remain deferred and release gates open. The next work is safety review and isolated read-only listener reproduction, **not** running termination tests.

### 2026-11-01 — Local M2 remediation reported READY FOR REVIEW

The owner reports a subsequent **local, uncommitted, unpushed** remediation documented in `WINDOWS_DISCOVERY_M2_REMEDIATION_2026-11-01.md` (report and code not uploaded here):

- Renderer dynamic `data-name` attributes reportedly removed, with escaping and tests.
- Numeric PowerShell PID reportedly passed through child process environment rather than script-string interpolation, with canonical PID checks; `execFile` and timeouts retained.
- Local syntax, **11/11 automated tests**, and `git diff --check` reportedly passed.
- `killProcess` deliberately **unchanged**; raw-PID destructive behavior remains an **independent M1.2 release blocker**.
- Codex documented integration guidance for unmerged PRs #4 and #5.
- Persistent listener reportedly accepted a connection but neither `netstat` nor Port Manager displayed the LISTENING row: **WT-02 cross-process validation remains INCONCLUSIVE / BLOCKED**.
- No commit, push, merge, elevation, installation or process termination reported.

**Meaning of READY FOR REVIEW:** The remediation can be submitted for *source review*. It is **not** approved, merged, demonstrated on Windows end-to-end, or safe for process termination. Phase 2 remains open: WT-01 and WT-02 FAIL / BLOCKED; WT-03 NOT IMPLEMENTED / BLOCKED.

### 2026-11-01 — Draft GitHub PR #6 independently source-reviewed

The M2 code/reports are now available in [draft PR #6](https://github.com/dev-rygar/port-manager/pull/6) at commit `1e77fc8eb1816d073d46cb13eab2473ea983a23b`. An independent **source review**, recorded in [PR #6 conversation](https://github.com/dev-rygar/port-manager/pull/6#issuecomment-6548909082), verified the shell-free discovery PID handoff, status classification, and renderer `data-name` removal; it also identified **CHANGES REQUIRED before merge**:

- Serial `powershell.exe` metadata lookups for up to 64 PIDs have 3-second per-command timeouts but no overall refresh deadline; they can block discovery for many seconds/minutes.
- Netstat has no explicit process timeout/output configuration; TCP/UDP parser scope is inconsistent and distinct address bindings are collapsed.
- Metadata status `available` can be set when `creationTime` is unavailable; this must not serve as verified process-instance identity.
- This PR derives from `main` and **does not contain** M0 PR #4 or stacked M1.1 PR #5. Merging PR #6 as-is could preserve the original unsafe raw-PID termination path instead of the guarded M1.1 path.
- Local 11/11 mocked tests were reported passing; **no GitHub Actions run** was found for the PR #6 head during the review. Live WT-02 listener/PID verification is still inconclusive.

**No source was merged or modified by this review.** Current Windows test statuses remain **WT-01 FAIL / BLOCKED; WT-02 FAIL / BLOCKED; WT-03 NOT IMPLEMENTED / BLOCKED**. All termination/release gates are still open.

### 2026-11-01 — PR #6 merged into main (incremental, not acceptance)

The owner explicitly authorized merging [PR #6](https://github.com/dev-rygar/port-manager/pull/6) despite open independent code-review follow-ups. The merge was completed using a head-SHA guard; GitHub reports commit `44cdc962c0fc0438cdbdf2b3b1ddc5b87f868466` on `main`.

**Scope:** This integrates M2 read-only discovery, metadata error statuses, and renderer remediation into the default development branch. **It is not a completed M2 milestone or a production release sign-off**: the original unsafe `killProcess` path remains until M1.1/M1.2 integration, WT-02 live listener visibility was inconclusive, and GitHub CI for the PR was absent at merge. Remaining M2 findings: serial metadata calls can stall refresh (64 × 3s timeout), netstat lacks an explicit deadline, UDP scope and per-address endpoint fidelity are unsettled, and `available` does not imply process creation-time identity.

**Immediate development priority:** Codex must plan and implement non-destructive integration of M0 PR #4 and M1.1 PR #5 onto updated main **without replacing the newer M2 discovery service or renderer safety improvements**. Review and run combined tests/CI before either further integration. M1.2 process-instance authorization, preview/revalidation and verification remains separately release-blocking. **Do not use the current Kill/Kill All actions for validation or production.**

**Windows statuses unchanged:** WT-01 FAIL / BLOCKED; WT-02 FAIL / BLOCKED; WT-03 NOT IMPLEMENTED / BLOCKED. WT-04–WT-12 deferred.

## 2. Deferred test register

| ID | Deferred activity | What completion must demonstrate | Status |
| --- | --- | --- | --- |
| WT-01 | Windows 10/11 compatibility matrix | Agreed supported editions/builds; app runs and discovers listeners with/without WMIC | **FAIL / BLOCKED (2026-10-31)** — WMIC absent; CIM/NetTCP access denied even in ordinary non-elevated PowerShell |
| WT-02 | Actual port and process discovery | Match sample TCP listeners and owning PIDs against Windows OS data; IPv4/IPv6/address fidelity | **FAIL / BLOCKED (reported 2026-10-31)** — netstat accurate for one listener; tasklist denied, app swallowed error and displayed Unknown |
| WT-03 | Process metadata and relationships | Name, executable path, command line where permitted; parent/child relationships and missing-permission behavior | **NOT IMPLEMENTED / BLOCKED (reported 2026-10-31)** — creation identity, parent/descendants, command line missing; privileged context unresolved |
| WT-04 | Single process stop and related ports | Controlled test process with multiple ports, preview of impact, stop result and post-stop listener state | Deferred |
| WT-05 | Bulk stop and partial failure | Two or more **test-only** processes; deduplicate targets; accurately report success, failure and exclusions | Deferred |
| WT-06 | Identity changes / stale snapshots | Process exits before action, PID reuse simulations/controlled repro, concurrent refresh, immediate port rebinding | Deferred |
| WT-07 | Safety protections and permissions | Invalid PIDs, known-protected targets rejected by backend and direct IPC, unknown identity, standard-user access denied | Deferred |
| WT-08 | Electron security behavior | CSP, navigation, unexpected windows, IPC sender validation, sandbox/context isolation | Deferred |
| WT-09 | Performance and fault tolerance | Measure discovery/refresh and metadata lookups; command timeouts; large listener lists | Deferred |
| WT-10 | Packaging and installation | Fresh locked install, installer + portable launch, uninstall, unprivileged use, signing/SmartScreen plan | Deferred |
| WT-11 | Dependency/security analysis | Dependency audit and triage of actionable issues, upgrade and regression evidence | Deferred |
| WT-12 | UI and accessibility | Keyboard-only search/inspect/confirm/stop path; empty states, failure reporting, duplicate dev-server guidance | Deferred |

**Scope boundary:** Some WT criteria depend on features that are not implemented yet. For these, validate current behavior to capture baseline evidence, then rerun the complete acceptance test after implementation. An initial failure does not constitute a newly introduced regression.

## 3. Safe execution order when testing resumes

1. Establish the exact commit and Windows environment, including admin/non-admin status.
2. Start with **read-only discovery** tests (WT-01 to WT-03). Use controlled temporary local servers and compare reported ownership with OS output.
3. Verify **safety guards and denied operations without actually attempting to kill Windows critical processes** (WT-07 and WT-08).
4. Perform destructive tests **only against processes launched expressly for testing** (WT-04 to WT-06). Never test by killing arbitrary user processes or system PIDs.
5. Gather measured performance and failure behavior (WT-09).
6. Validate clean package install/portable build, dependency state, and accessibility (WT-10 to WT-12).
7. Review evidence, update ENGINEERING_AUDIT.md, and rerun relevant tests after remediation.

For each test, record:

| Field | Example / instructions |
| --- | --- |
| Test ID | WT-04 |
| Date / tester | Local date and person who ran the test |
| Repository commit | Full SHA tested |
| OS / runtime | Windows edition, exact build, CPU architecture, Node/npm/Electron |
| Permissions | Standard user or elevated |
| Preconditions | Controlled test process name, expected bound endpoints |
| Steps | Exact reproducible actions or commands (redact personal paths) |
| Expected result | From the Master Plan acceptance criteria |
| Actual result | Observed behavior, including failures |
| Evidence | Screenshots, sanitized logs, limited OS output |
| Verdict | PASS / FAIL / BLOCKED / NOT APPLICABLE |
| Follow-up | Linked issue/PR and whether retesting is needed |

## 4. Commands for read-only baseline checking

Run these **read-only** PowerShell commands in your test environment and compare with the app's display:

```powershell
# Show listening TCP endpoints and owners
Get-NetTCPConnection -State Listen |
  Select-Object LocalAddress, LocalPort, OwningProcess

# Query process identities and ancestry
Get-CimInstance Win32_Process |
  Select-Object ProcessId, ParentProcessId, Name, CreationDate

# Check whether deprecated WMIC exists on this machine
Get-Command wmic -ErrorAction SilentlyContinue
```

Treat process command lines and executable paths as potentially private when sharing evidence.

**Do not use generic "taskkill all" scripts or force-kill arbitrary Windows PIDs for testing.** A test-only process tree is safer and provides reproducible evidence.

## 5. Current release and architecture gates

| Decision/gate | Status |
| --- | --- |
| Source-level audit accepted for planning | Accepted |
| Windows integration and runtime validation | **Initial/follow-up WT-01/02 FAIL / BLOCKED; WT-03 NOT IMPLEMENTED / BLOCKED; WT-04–WT-12 deferred; not passed** |
| Production-ready claim | **Not approved** |
| Publishing/installing public executable binaries as production-ready | **Blocked** until gates pass |
| Preliminary architecture design and planning | May proceed with open risks clearly documented |
| Finalizing OS adapter and critical termination-policy decisions | Conditional on Windows validation and safety evidence |
| Closing Phase 2 completely | **Not yet allowed**; attach test evidence and update exit-gate status first |

The project owner resumed initial and follow-up checks WT-01–WT-03 on 2026-10-31, with a traced metadata failure chain reported. The original local Markdown reports have **not** been imported or independently reviewed here. WT-01–WT-03 still require follow-up and WT-04–WT-12 remain deferred. **No automatic/background testing has been scheduled**.

## 6. Procedure to close the deferral

- [ ] Record test environment and commit.
- [ ] Execute WT-01–WT-12 or explicitly mark an item NOT APPLICABLE with justification.
- [ ] Attach sanitized evidence and reproduction steps for failures.
- [ ] Update audit finding confidence, severity and status based on observed Windows behavior.
- [ ] Create/adjust implementation tasks for unresolved findings.
- [ ] Repeat previously failing tests after fixes.
- [ ] Obtain explicit release review only after all required product/safety gates pass.

**Reminder:** Merging documentation is not authorization to publish an unverified executable release.

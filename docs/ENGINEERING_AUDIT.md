# Port Manager — In-Depth Engineering Audit (Phase 2)

**Audit version:** 1.0 (source + controlled-execution findings)  
**Date:** 2026-10-30  
**Repository:** https://github.com/dev-rygar/port-manager  
**Audited ref:** main, commit e4a1585cb7755c24a04140834d92d9a3754d28ee  
**Requirements baseline:** MASTER_PLAN.md v1 on docs/master-plan-v1 (draft PR #1)  
**App code modified:** No  
**Status:** **Source/controlled audit accepted; initial and follow-up WT-01/02 FAIL / BLOCKED, WT-03 NOT IMPLEMENTED / BLOCKED reported 2026-10-31. WT-04–WT-12 deferred, all relevant retesting open. Not release-ready.**
**Deferred testing register:** [DEFERRED_WINDOWS_TESTING.md](DEFERRED_WINDOWS_TESTING.md). Deferral is not a passing result or release waiver.
**Initial and follow-up Windows triage:** [WT-01–WT-03 reported results](test-results/WT01-WT03_REPORTED_TRIAGE_2026-10-31.md). Results summarized by owner; full local reports not reviewed here.

> **Integrity note:** This audit inspects the entire tracked app tree and executes the **actual unmodified** main-process, service, and renderer source within controlled JavaScript test harnesses. Windows commands, IPC events, and DOM APIs were mocked; no actual Windows process was killed, and the packaged Electron application was not started. “Reproduced with mocks” must not be confused with “reproduced on Windows.” No penetration test, full dependency vulnerability scan, package installation, or signed-binary review was performed.

## A. Executive decision

**Recommendation: HOLD public release of executable binaries.** The current implementation can be a useful personal utility, but it does not yet meet the approved safety-first product contract.

Reasons:
1. Process termination uses a raw PID and force-kills it without process identity revalidation or an enforced protected-target policy.
2. A process can own multiple ports, but the UI does not preview the effect or independently verify that the requested port was freed.
3. Saved port tags can be inherited by a different process later; bulk termination repeats PIDs and hides per-target failures.
4. Unknown process identity may be replaced by a familiar-looking port service name, giving unjustified confidence to inexperienced users.
5. The Windows process-information path depends on deprecated/removed WMIC; the fallback loses executable paths.
6. Electron is pinned to a long-obsolete major release, and automated tests/CI are absent.

**Not claimed:** The audit did not prove a remotely exploitable Electron compromise, actual termination of protected Windows processes, or an observed Windows crash.

### A.1 Severity and evidence labels

- **P1 / release blocker:** Substantial risk to core safety, truthful user guidance, or secure distribution; must be resolved or consciously redesigned before public binaries.
- **P2:** Significant defect, reliability/performance issue, or missing Must-have requirement; fix before production-ready status.
- **P3:** Lower-risk UX/docs/release-process debt; complete as relevant to release gates.

Evidence:
- **M = mock-reproduced:** Actual source executed with synthetic OS, DOM, or IPC inputs.
- **S = source-confirmed:** Directly established by code, configuration, or absence from complete tracked tree.
- **E = externally documented:** Current platform/dependency support policy.
- **W = Windows-unverified:** Real Windows runtime behavior is not yet tested.

A “missing feature” is a product-spec gap, not necessarily a regression in the original release.

## B. Repository and execution coverage

### B.1 Inspected surface

| Surface | Contents reviewed |
| --- | --- |
| Electron privileged process | main.js (window creation, handlers, lifecycle) |
| Preload boundary | preload.js (exposed renderer API) |
| Windows service | src/services/portService.js (netstat/WMIC/tasklist/PowerShell/taskkill) |
| Heuristics | src/services/portReference.js |
| UI logic | src/renderer/app.js (search, sort, tags, details, individual and bulk stop, async refresh) |
| UI markup and styles | src/renderer/index.html and src/renderer/styles.css |
| Packaging and dependencies | package.json, package-lock.json |
| Release/documentation | README.md, .gitignore, Git tree, available releases and commit status |

Source inventory: 9 tracked files in root/src plus lockfile and other tracked assets; **no tests, CI workflows, LICENSE file, or published GitHub release** found in the examined repository tree/metadata.

Baseline: Electron **28.3.3**, electron-builder **24.13.3** in lockfile; 324 lockfile package records. This is not a vulnerability count and does not replace a dependency scan.

### B.2 Executable audit method

The reviewed JavaScript was loaded and invoked unchanged through a sandboxed JavaScript harness with substitution at module/import boundaries; calls to child_process.exec, Electron ipcMain, window.portManager, localStorage, document, and confirm were intercepted. Fixtures mimicked representative Windows netstat, WMIC, and tasklist output. This lets us establish *the logic's behavior for those inputs*, not real OS interaction.

**Executed probes:**

| Test | Input and observed behavior | Evidence |
| --- | --- | --- |
| S01 | TCP LISTENING vs ESTABLISHED fixture → LISTENING retained, ESTABLISHED omitted | M |
| S02 | Standard four-field UDP netstat fixture → **zero UDP rows returned** | M |
| S03 | Three address bindings for TCP port 3000, one PID → **one row** with comma-joined localAddress | M |
| S04 | killProcess("123abc") → **taskkill /PID 123 /F** issued | M |
| S05 | killProcess(70000) → **Invalid PID** despite otherwise well-formed number | M |
| S06 | killProcess(4) → **taskkill /PID 4 /F** issued to fake exec (not actual OS) | M |
| S07 | killProcess(1234) → single taskkill invocation; **no lookup/revalidation** first | M |
| S08 | Simulated missing WMIC → tasklist fallback; process name retained, executable path empty | M |
| S09 | No metadata for PID 5678 on port 3000 → Application field becomes **Dev server** despite actual process **Unknown** | M |
| S10 | 35 listeners, one PID, unknown EXE → **35 PowerShell subprocess requests** | M |
| S11 | netstat/WMIC exec calls → no explicit timeout or maxBuffer configuration | M/S |
| R01 | Application name containing quotes injected extra **data-injected** attribute into generated button HTML | M |
| R02 | setTag(3000, "backend") → localStorage entry keyed solely on "3000" | M |
| R03 | Development tab remains populated despite unmatched search query | M |
| R04 | handleKillAll([1234,1234], "backend") → two kill requests; confirmation says **2 processes** | M |
| R05 | Refresh request B completed before A → A's older data replaced B's newer data | M |
| I01 | Main handler called with synthetic untrusted IPC sender → invokes kill service without sender check | M/S |

**Important:** R01 establishes unsafe HTML attribute construction, not successful script execution or remote-code execution. I01 establishes absent handler-side sender validation, not proof that an external webpage can currently reach the handler. S06 establishes lack of app-side rejection, not Windows granting permission to kill PID 4.

### B.3 What was *not* executed

- The Electron GUI in a real browser or Windows environment.
- Windows native/PowerShell commands with actual system output; no actual taskkill was run.
- OS permission/elevation behavior, PID reuse, process-tree traversal, child survival.
- Bundled NSIS or portable executable, uninstaller, SmartScreen reputation, signing.
- Real concurrency/performance benchmarks; only subprocess-call multiplicity was measured with mocks.
- npm ci, npm audit, a SCA/CVE inventory, and any packaged-binary scan (network/package install unavailable).

## C. Detailed prioritized findings

File links below are pinned to the audited commit, not moving main.

### PM-A01 — No enforceable termination safety policy

**Priority:** P1 | **Evidence:** S/M  
**Source:** [main.js L45–50](https://github.com/dev-rygar/port-manager/blob/e4a1585cb7755c24a04140834d92d9a3754d28ee/main.js#L45-L50), [portService.js L217–229](https://github.com/dev-rygar/port-manager/blob/e4a1585cb7755c24a04140834d92d9a3754d28ee/src/services/portService.js#L217-L229), [portReference.js L43–79](https://github.com/dev-rygar/port-manager/blob/e4a1585cb7755c24a04140834d92d9a3754d28ee/src/services/portReference.js#L43-L79).

The backend accepts the PID, checks its numeric form, then invokes forced taskkill. The renderer's “system” warning depends on the *port number*, not verified process identity. A helper recognizing system PID 4 exists but is unused by the kill path.

**Impact:** The central destructive operation has no app-enforced critical-target or unknown-target policy. Users may be guided by the wrong signal about safety. Windows OS permissions may block some kills, but permissions are not a product safety policy.

**Fix:** Implement a privileged authorization policy using fresh process identity and a carefully reviewed protection list; reject known-protected targets in the main/service layer, independent of the UI. Define handling for unavailable metadata. Verify on real Windows before release.

### PM-A02 — Time-of-check/time-of-use and PID reuse risk

**Priority:** P1 | **Evidence:** M/S (real PID reuse W)  
**Source:** [portService.js L217–229](https://github.com/dev-rygar/port-manager/blob/e4a1585cb7755c24a04140834d92d9a3754d28ee/src/services/portService.js#L217-L229), [app.js L329–345](https://github.com/dev-rygar/port-manager/blob/e4a1585cb7755c24a04140834d92d9a3754d28ee/src/renderer/app.js#L329-L345).

The kill operation does **not** re-query the process after the user views an earlier port snapshot. If the original process exits and the PID is reused, the command can target the new owner.

**Fix:** Use a process identity including creation time and executable identity where available; reject stale or unverifiable targets. Recompute impact/policy at action time and do not reuse a prior confirmation after target identity changes.

### PM-A03 — Impact preview and truthful stop verification absent

**Priority:** P1 | **Evidence:** S  
**Source:** [app.js L329–367](https://github.com/dev-rygar/port-manager/blob/e4a1585cb7755c24a04140834d92d9a3754d28ee/src/renderer/app.js#L329-L367), [portService.js L223–229](https://github.com/dev-rygar/port-manager/blob/e4a1585cb7755c24a04140834d92d9a3754d28ee/src/services/portService.js#L223-L229).

Confirmation identifies a PID/process name, not *all listening endpoints* that process owns. Following taskkill's exit, the service immediately returns success without checking process exit or whether the requested port is now free. The UI reloads the table but does not report explicit process-vs-port verification states.

**Fix:** Introduce previewStop and stop/verify flow. Explicitly distinguish “process stopped”, “port freed”, “port still occupied by another process”, and “unable to verify”.

### PM-A04 — Saved port-only tags can authorize unintended future bulk targets

**Priority:** P1 | **Evidence:** R02/S  
**Source:** [app.js L33–55](https://github.com/dev-rygar/port-manager/blob/e4a1585cb7755c24a04140834d92d9a3754d28ee/src/renderer/app.js#L33-L55), [app.js L221–251](https://github.com/dev-rygar/port-manager/blob/e4a1585cb7755c24a04140834d92d9a3754d28ee/src/renderer/app.js#L221-L251).

Port 3000 retains a “backend” tag after its process exits; a future unrelated port-3000 owner inherits the tag and becomes a “Kill all Backend” candidate.

**Fix:** Distinguish a persistent port role label from an ephemeral process selection. Always show current unique targets, validate identities, and require a new impact confirmation.

### PM-A05 — Bulk termination duplicates targets and hides partial failures

**Priority:** P1 | **Evidence:** R04/S  
**Source:** [app.js L246–251](https://github.com/dev-rygar/port-manager/blob/e4a1585cb7755c24a04140834d92d9a3754d28ee/src/renderer/app.js#L246-L251), [app.js L347–367](https://github.com/dev-rygar/port-manager/blob/e4a1585cb7755c24a04140834d92d9a3754d28ee/src/renderer/app.js#L347-L367).

The list includes one PID for each tagged port row, without deduplication. The loop logs but swallows each kill error. The confirmation reports the *row count* as a process count, and there is no reliable per-target completion summary.

**Fix:** Explicit multi-select by unique process identity; aggregate and revalidate targets; per-target results and partial-failure UI; never auto-stop ancestors or descendants.

### PM-A06 — Unknown process can be presented as a known development server

**Priority:** P1 | **Evidence:** S09  
**Source:** [portService.js L173–195](https://github.com/dev-rygar/port-manager/blob/e4a1585cb7755c24a04140834d92d9a3754d28ee/src/services/portService.js#L173-L195), [portReference.js L23–41](https://github.com/dev-rygar/port-manager/blob/e4a1585cb7755c24a04140834d92d9a3754d28ee/src/services/portReference.js#L23-L41), [app.js L19–26](https://github.com/dev-rygar/port-manager/blob/e4a1585cb7755c24a04140834d92d9a3754d28ee/src/renderer/app.js#L19-L26).

When the process is unknown, the application-name fallback uses the port-service hint. The controlled probe produced **processName="Unknown", applicationName="Dev server"** for port 3000. Tooltip copy also says development ports are “Safe to kill when not coding”.

**Impact:** The app suggests certainty it does not possess, contradicting the approved “unknown ≠ safe” principle.

**Fix:** Separate verified process identity from heuristic port-purpose hints. Show “Unknown process; port commonly used for dev servers”. Do not use service hints as termination authorization.

### PM-A07 — Quoted HTML attribute injection in renderer

**Priority:** P1 | **Evidence:** R01  
**Source:** [app.js L122–149](https://github.com/dev-rygar/port-manager/blob/e4a1585cb7755c24a04140834d92d9a3754d28ee/src/renderer/app.js#L122-L149), [app.js L309–313](https://github.com/dev-rygar/port-manager/blob/e4a1585cb7755c24a04140834d92d9a3754d28ee/src/renderer/app.js#L309-L313), [index.html L6](https://github.com/dev-rygar/port-manager/blob/e4a1585cb7755c24a04140834d92d9a3754d28ee/src/renderer/index.html#L6).

escapeHtml() escapes HTML text, but quoted attributes require additional escaping or DOM APIs. An app name containing a quote produced: data-name="Test" data-injected="yes" in generated markup. CSP's script-src 'self' mitigates some script-injection possibilities; **no script execution was demonstrated**.

**Fix:** Build rows with textContent, dataset, and setAttribute; use DOM-safe templating and test names containing quotes, angle brackets, and ampersands.

### PM-A08 — Privileged IPC sender validation absent

**Priority:** P1 | **Evidence:** I01/S; exploitation W  
**Source:** [main.js L35–52](https://github.com/dev-rygar/port-manager/blob/e4a1585cb7755c24a04140834d92d9a3754d28ee/main.js#L35-L52).

The IPC handlers never inspect event.sender, event.senderFrame, or the calling URL. Synthetic invocation with an untrusted URL was accepted by the handler in isolation. This is a missing defense-in-depth condition, **not proof that an external page can currently invoke it**.

**Fix:** Validate the calling frame/window and the expected local application origin for both discovery and termination. Restrict navigation and new-window creation; test with synthetic untrusted frames. Follow Electron's security checklist.

### PM-A09 — Electron dependency is outside maintained release support

**Priority:** P1 for distribution gate | **Evidence:** S/E  
**Source:** [package.json L15–18](https://github.com/dev-rygar/port-manager/blob/e4a1585cb7755c24a04140834d92d9a3754d28ee/package.json#L15-L18), package-lock.json.

Installed lockfile resolves Electron 28.3.3. Electron officially supports its latest **three stable major versions**, not 28. No scan or confirmed CVE specific to this app is asserted here.

**Fix:** Update to a currently supported Electron release, review breaking changes and bundled Chromium/Node versions, run packaging and functional regression tests. Update electron-builder based on compatibility.

### PM-A10 — WMIC dependency incompatible with current Windows builds

**Priority:** P2 | **Evidence:** S08/E (current Windows W)  
**Source:** [portService.js L66–125](https://github.com/dev-rygar/port-manager/blob/e4a1585cb7755c24a04140834d92d9a3754d28ee/src/services/portService.js#L66-L125).

WMIC removal on recent Windows 11 releases is confirmed by Microsoft. Current tasklist fallback retains only a name, losing executable path and sometimes reliable identity details. It does not supply command line or parent relationship.

**Fix:** Evaluate supported process APIs or CIM/PowerShell structured output; clearly handle permission denial, missing data, and process exit during enumeration. Avoid locale-specific display parsing.

### PM-A11 — PID parsing is ambiguous and overly restrictive

**Priority:** P2 | **Evidence:** S04/S05  
**Source:** [portService.js L217–226](https://github.com/dev-rygar/port-manager/blob/e4a1585cb7755c24a04140834d92d9a3754d28ee/src/services/portService.js#L217-L226).

parseInt("123abc") returns 123 and passes validation; positive integers ≥65536 are rejected. This can request termination of an unintended PID if malformed input reaches the handler.

**Fix:** Strict, bounded-by-safe-integer parsing; reject noncanonical values; verify process identity and use argument-based subprocess execution without shell interpolation.

### PM-A12 — Listener parsing and deduplication lose endpoint fidelity

**Priority:** P2 | **Evidence:** S01–S03  
**Source:** [portService.js L35–63](https://github.com/dev-rygar/port-manager/blob/e4a1585cb7755c24a04140834d92d9a3754d28ee/src/services/portService.js#L35-L63), [portService.js L198–212](https://github.com/dev-rygar/port-manager/blob/e4a1585cb7755c24a04140834d92d9a3754d28ee/src/services/portService.js#L198-L212).

Despite comments indicating UDP handling, the four-field UDP record is discarded by parts.length < 5. More importantly for TCP v1, multiple distinct IP-address bindings with identical protocol/port/PID are merged into a comma-delimited string, so the model no longer has one record per listening endpoint.

**Fix:** Explicitly decide TCP-only versus UDP support; normalize a listener key containing protocol + address + port + owning process, preserving distinct address bindings. Present grouping in UI, not by destructive string concatenation.

### PM-A13 — Metadata lookup has unbounded duplicate subprocess fan-out

**Priority:** P2 | **Evidence:** S10  
**Source:** [portService.js L127–171](https://github.com/dev-rygar/port-manager/blob/e4a1585cb7755c24a04140834d92d9a3754d28ee/src/services/portService.js#L127-L171).

35 listening rows from one PID spawned 35 PowerShell calls in the controlled fixture. Promise.all() launches one lookup per row, without deduplicating executable paths or bounding concurrency.

**Fix:** Batch Windows process metadata, memoize per-process/executable information within a snapshot, and cap active subprocesses. Measure actual Windows latency.

### PM-A14 — No explicit timeout/output-size/error taxonomy for core discovery

**Priority:** P2 | **Evidence:** S11/S  
**Source:** [portService.js L26–30](https://github.com/dev-rygar/port-manager/blob/e4a1585cb7755c24a04140834d92d9a3754d28ee/src/services/portService.js#L26-L30), [portService.js L69–125](https://github.com/dev-rygar/port-manager/blob/e4a1585cb7755c24a04140834d92d9a3754d28ee/src/services/portService.js#L69-L125), [portService.js L223–228](https://github.com/dev-rygar/port-manager/blob/e4a1585cb7755c24a04140834d92d9a3754d28ee/src/services/portService.js#L223-L228).

No explicit timeouts are configured for netstat, WMIC, tasklist, or taskkill; core discovery also uses Node exec() buffering defaults. Metadata lookup errors fall back to empty maps, losing whether the cause was missing tool, permission denial, malformed output, or process churn.

**Fix:** Define command timeouts, output-size limits, bounded concurrency, structured errors, partial-data indicators, and observability without exposing sensitive command-line data.

### PM-A15 — Refresh ordering allows stale state

**Priority:** P2 | **Evidence:** R05  
**Source:** [app.js L58–70](https://github.com/dev-rygar/port-manager/blob/e4a1585cb7755c24a04140834d92d9a3754d28ee/src/renderer/app.js#L58-L70).

Concurrent refresh requests complete in arbitrary order; a slower older response overwrites a faster newer response. This worsens an already snapshot-sensitive app.

**Fix:** Monotonic request ID and discard old responses; use a consistent snapshot observation time and disable duplicate destructive submissions while busy.

### PM-A16 — Row details do not identify the selected endpoint

**Priority:** P2 | **Evidence:** S  
**Source:** [app.js L170–177](https://github.com/dev-rygar/port-manager/blob/e4a1585cb7755c24a04140834d92d9a3754d28ee/src/renderer/app.js#L170-L177), [app.js L287–294](https://github.com/dev-rygar/port-manager/blob/e4a1585cb7755c24a04140834d92d9a3754d28ee/src/renderer/app.js#L287-L294).

Click handlers use data.find(x => x.pid === pid), which picks the first row for a process with multiple ports. Thus the details panel may show a different port than the clicked row.

**Fix:** Carry a stable endpoint row identity through rendering and selection.

### PM-A17 — Development search does not filter groups

**Priority:** P2 | **Evidence:** R03  
**Source:** [app.js L93–106](https://github.com/dev-rygar/port-manager/blob/e4a1585cb7755c24a04140834d92d9a3754d28ee/src/renderer/app.js#L93-L106), [app.js L221–231](https://github.com/dev-rygar/port-manager/blob/e4a1585cb7755c24a04140834d92d9a3754d28ee/src/renderer/app.js#L221-L231).

The search input remains visible across tabs, but the Development tab iterates unfiltered portsData. A query matching nothing still displays tagged ports.

**Fix:** Apply consistent search across both tabs or explicitly scope/disable the search in the Development tab.

### PM-A18 — Missing must-have process relations, command-line detail, and arbitrary multi-select

**Priority:** P2 | **Evidence:** S  
**Source:** [portService.js](https://github.com/dev-rygar/port-manager/blob/e4a1585cb7755c24a04140834d92d9a3754d28ee/src/services/portService.js), [app.js](https://github.com/dev-rygar/port-manager/blob/e4a1585cb7755c24a04140834d92d9a3754d28ee/src/renderer/app.js).

The app lacks commands/API models to retrieve process parent/child ancestry, command-line details, and stable process-instance identity. “Kill all” is limited to tag-based groups; users cannot select arbitrary multiple unique process instances.

**Fix:** Add process snapshot and relationship services, project-neutral process multi-select, and UI that clearly separates "same PID owns these ports" from "these are child processes".

### PM-A19 — Accessibility, plain-language feedback, and empty states incomplete

**Priority:** P2/P3 | **Evidence:** S  
**Source:** [index.html L18–79](https://github.com/dev-rygar/port-manager/blob/e4a1585cb7755c24a04140834d92d9a3754d28ee/src/renderer/index.html#L18-L79), [app.js L385–401](https://github.com/dev-rygar/port-manager/blob/e4a1585cb7755c24a04140834d92d9a3754d28ee/src/renderer/app.js#L385-L401).

Sort is attached to nonfocusable th elements, entire table rows have mouse-only click detail behavior, labels/focus/sort state are sparse, and zero-result rows are blank rather than a clear "No listening process found". Native confirm() communicates only minimal consequences. No keyboard end-to-end testing has been performed.

**Fix:** Accessible controls and focus handling, aria-sort/status announcements, empty/error/loading states, a goal-oriented impact confirmation, and clear outcomes independent of color.

### PM-A20 — Release controls/documentation incomplete

**Priority:** P1 release gate / P3 docs | **Evidence:** S  
**Source:** [package.json L6–41](https://github.com/dev-rygar/port-manager/blob/e4a1585cb7755c24a04140834d92d9a3754d28ee/package.json#L6-L41), [README.md L1–125](https://github.com/dev-rygar/port-manager/blob/e4a1585cb7755c24a04140834d92d9a3754d28ee/README.md#L1-L125).

No tests or CI, no release artifacts, no LICENSE text despite MIT declaration, placeholder README URLs, and package Windows signing explicitly disabled. No evidence of smoke-tested installer/portable builds. The README describes “one-click kill” and “usually safe to kill” more confidently than the implementation can justify.

**Fix:** Automated tests/CI, clean build verification, Windows installation and unprivileged-operation smoke tests, accurate user documentation, explicit Windows version support, license file, and a documented signing/SmartScreen distribution plan.

## D. Product requirement coverage against Master Plan v1

| Feature ID | Requirement | Current assessment | Blocking gap |
| --- | --- | --- | --- |
| FR-01 | Quick port lookup | **Partial** | Search is substring filter, not an explicit current-owner conflict resolution flow |
| FR-02 | Port/process discovery | **Partial** | TCP snapshot exists, but binding dedup and errors limit accuracy |
| FR-03 | Process information | **Partial** | PID/name/path sometimes; command-line details not retrieved |
| FR-04 | Clear identification | **Unsafe partial** | Unknown PID can be labeled "Dev server" via port hint |
| FR-05 | Related ports | **Missing dedicated behavior** | No process-centric list/impact context |
| FR-06 | Parent/child relationships | **Missing** | No parent/child metadata or UI |
| FR-07 | Safety assessment | **Missing backend enforcement** | Port-number heuristics and UI-only warning |
| FR-08 | Stop one process | **Unsafe partial** | Forced kill only; no identity recheck, safe preview, verification |
| FR-09 | Bulk termination | **Unsafe partial** | Tag-only, duplicates PIDs, hides per-PID errors |
| FR-10 | Impact preview | **Missing** | No affected-endpoint summary |
| FR-11 | Termination verification | **Missing** | UI reload isn't explicit process/port verification |
| FR-12 | Errors and recovery | **Partial** | Some alerts; failures conflated/hidden, no recovery guidance |
| FR-13 | Search/sort/refresh | **Partial** | Dev search ignored, refresh race |
| FR-14 | Development groups | **Exists, unsafe semantics** | Persistent port label can target new process |
| FR-15 | Duplicate dev-server guidance | **Missing** | No evidence-based duplicate project detection |
| FR-16 | Project-aware grouping | **Future** | Not a release blocker |
| FR-17 | Automatic conflict resolution | **Future** | Not a release blocker; should remain off |

**Interpretation:** No Must-have feature is yet validated end-to-end on Windows. Existing discovery/UI provides a starting point, but the core stop workflow must be redesigned around explicit process identities.

## E. Proposed remediation order (pending Windows findings)

**Milestone M1 — Safety foundation (first code changes)**
- [ ] PM-A01: Backend process-protection policy and authorization decision.
- [ ] PM-A02: Fresh target identity and preview/execute revalidation.
- [ ] PM-A03: Preview and verify process exit **and** port state distinctly.
- [ ] PM-A04/05: Separate persisted tags from termination scope; dedup targets; truthful bulk results.
- [ ] PM-A06/07/08: Remove misleading identity fallback, safe DOM rendering, and validate IPC senders.
- [ ] Add regression tests for all above before enabling broad process-stop functionality.

**Milestone M2 — Correct Windows discovery**
- [ ] PM-A10: Replace WMIC, use supported structured metadata sources.
- [ ] PM-A11/12: Strict PIDs, address-aware endpoint records, explicit UDP decision.
- [ ] PM-A13/14: Batch, bound, and observe command/API operations.
- [ ] PM-A18: Process ancestry/descendants, command-line metadata, process identity.

**Milestone M3 — Developer-first workflow**
- [ ] PM-A15/16/17: Correct refresh, row selection, search behavior.
- [ ] FR-01/05/06/09/10/11: Quick port search → accurate owner → related ports and process tree → impact → stop → verify.
- [ ] PM-A19: Accessible navigation and clear feedback.
- [ ] FR-14/15: Safe development grouping and optional evidence-based duplicate-server guidance.

**Milestone M4 — Delivery and maintainability**
- [ ] PM-A09/20: Supported Electron, dependency review, CI/tests, packaging, docs, signing decision.
- [ ] Make every Must-have acceptance scenario executable as a test or documented manual check.
- [ ] Validate installer and portable builds on a clean Windows machine.

## F. Required Windows validation protocol (not yet performed)

### F.1 Test environment to capture

For each test run record:
- Windows edition, build number, architecture, UAC/elevation state.
- Electron/Node/npm versions and package-lock identity.
- Installed vs portable app; whether the app is code-signed.
- Whether WMIC exists, PowerShell/CIM and network APIs are available.
- Date/time, tested source commit, steps, expected vs actual behavior, redacted evidence.

### F.2 Non-destructive discovery checks

1. Open a controlled local Node.js TCP listener on a known unused port in a **test-only** environment.
2. Read Windows process/listener data using supported read-only commands, for example:
   - Get-NetTCPConnection -State Listen | Select-Object LocalAddress,LocalPort,OwningProcess
   - Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name,CreationDate
3. Compare Port Manager's rows with the OS results, including different local addresses on the same port.
4. Stop the test listener outside the app and check how a stale UI snapshot behaves.
5. Confirm that missing/excluded metadata is reported as unknown rather than a guessed process name.

### F.3 Controlled destructive tests — isolated test processes only

- Single test process owning two ports: preview must list both, stop once, verify both no longer owned by it.
- Two independent test processes: multi-select, one exit succeeds/one intentionally fails, report both accurately.
- Parent test script launching child server: observe parent and descendant identities; stop-one must not silently request a tree kill.
- Process exit between preview and execute: request must refuse stale identity.
- New process binds test port immediately after old one exits: verify that process-exit success does **not** equal free-port success.
- Protected Windows process: verify UI and *direct IPC* deny actions **without actually attempting to terminate the system process**.
- Non-admin session: verify permission limits and error guidance.
- Slow/broken discovery API: verify bounded timeout, partial data handling, and no unresponsive UI.

**Do not run blanket taskkill commands against arbitrary PIDs or actual critical Windows processes to test protection.**

### F.4 Packaging/security tests

- Clean install from locked dependency tree; repeatable Windows build.
- Current supported Electron version, default sandbox/contextIsolation, CSP and IPC checks.
- Navigation/new-window denial for unexpected origins.
- Keyboard-only full user flow, accessible labels/focus.
- Portable and installer launches, process access without elevation, uninstall.
- Dependency audit with explicit findings and ownership; signing/SmartScreen decision; release provenance/hashes.

## G. Technical decisions to settle after Windows validation

| Decision | Options / recommendation | Status |
| --- | --- | --- |
| Network discovery | Get-NetTCPConnection or supported native API; avoid locale-dependent parsing when possible | Pending Windows benchmark |
| Process metadata | CIM/Win32_Process or native API; creation time/parent PID when allowed | Pending permissions test |
| Safety policy | Verified identity, backend protected-target guard, unknown handling; no "safe" certification | Design required |
| Tree-stop behavior | Separate advanced feature; do not silently include children | Default scope agreed |
| UDP | TCP-only first release or explicit UDP model; avoid accidental half-support | Open |
| Windows 10 | Mainstream support ended 2025-10-14; decide compatibility-only vs formally supported | Open |
| Language | Keep Electron and vanilla JS now; consider TypeScript specifically for process models/IPC | Provisional |
| Packaging | Electron update, Windows matrix, optional signing and release CI | Needs tests |

## H. Exit-gate status

| Gate | Status | Why |
| --- | --- | --- |
| Entire tracked source mapped | **Complete** | Current tree, app code, config, README and lockfile read |
| Mock-reproduced bug evidence | **Complete for selected cases** | S01–S11, R01–R05, I01 |
| Requirements gap matrix | **Complete (static)** | FR-01–FR-17 mapped to code |
| Windows runtime defect reproduction | **PARTIAL / ISSUES REPORTED** | WT-01/02 FAIL / BLOCKED and WT-03 NOT IMPLEMENTED / BLOCKED; tasklist access-denied failure chain reported; WT-04+ not run |
| Windows performance benchmark | **DEFERRED / NOT PASSED** | WT-09; synthetic call counts only |
| Dependency vulnerability scan | **DEFERRED / NOT PASSED** | WT-11; lock reviewed only |
| Installer/portable smoke test | **DEFERRED / NOT PASSED** | WT-10; no Windows binary built or started |
| Security validation/pentest | **DEFERRED / NOT PASSED** | WT-07/08; security boundary inspected, no penetration test |
| Phase 2 fully complete | **NO** | Initial failures/feature gaps reported; retests, remaining Windows evidence, and release checks outstanding |
| Public executable release gate | **FAIL** | Safety and feature requirements not yet met |

## H.1 Deferred testing decision — 2026-10-30

**Decision:** Project owner will run Windows tests later. This is an intentional deferral of execution, not a change to test scope, severity, product acceptance criteria, or release policy.

- **Completed now:** Static source review, controlled-execution probes, feature coverage mapping, and prioritized remediation recommendations.
- **Deferred:** Real Windows discovery/process-tree/termination/permission tests, system compatibility, security validation, benchmarking, package/install checks, dependency vulnerability scanning, and accessibility verification. See the detailed **WT-01–WT-12 register** in [DEFERRED_WINDOWS_TESTING.md](DEFERRED_WINDOWS_TESTING.md).
- **May proceed:** Planning, architecture exploration, and safety-first implementation *with relevant unknowns explicitly recorded*.
- **Must not claim:** Phase 2 is fully closed, Windows compatibility confirmed, the executable release production-ready, or tests passed.
- **Before publication of executable binaries:** Complete outstanding release-critical tests, resolve unsafe behavior, reassess audit findings using evidence, and obtain explicit release readiness sign-off.
- **Timing:** No testing date or automated execution is scheduled.

**Documentation approval is not process-safety certification or permission to publish binaries.**

## H.2 First Windows run reported — 2026-10-31

**Provenance:** Project owner reported results from a Codex-assisted Windows audit. The full original Markdown report and raw terminal evidence have not been inspected in this audit update. Treat findings as **reported, not independently verified**. The [triage record](test-results/WT01-WT03_REPORTED_TRIAGE_2026-10-31.md) records the necessary reproduction and environment checks.

- **WT-01 — FAIL / BLOCKED (reported):** WMIC absent; CIM and NetTCP APIs present but access denied in non-elevated Codex shell. General Windows capability and ordinary-shell permissions still need verification.
- **WT-02 — FAIL / BLOCKED (reported):** netstat correctly identified disposable listener port/address/PID. WMIC missing; tasklist fallback returned `ERROR: Access denied`, service silently swallowed the failure into an empty map, and `getPorts()` assigned `Unknown`. This is an actionable error handling/metadata path defect (PM-A10, PM-A14).
- **WT-03 — NOT IMPLEMENTED / BLOCKED (reported):** Some PID/name/path data available; creation identity, parent PID, descendants, and command line missing (PM-A18).
- **Safety:** No app code changed, no existing processes terminated per the owner's report.
- **Non-cause:** PowerShell execution policy limited `npm.ps1` but did not cause the process metadata failures; no justification for changing execution policy.
- **Remaining:** Test normal non-elevated PowerShell separately from Codex context, replace WMIC dependency, surface permission/metadata errors rather than silently using Unknown, implement missing process fields, and rerun WT-01–WT-03. WT-04–WT-12 remain deferred; safety gates precede destructive tests.
- **Consequence:** Reinforces PM-A10 and PM-A18 priorities; does not demonstrate an OS-wide API incompatibility or release readiness.

## I. Source/reference notes

**Project**
- https://github.com/dev-rygar/port-manager/tree/e4a1585cb7755c24a04140834d92d9a3754d28ee
- https://github.com/dev-rygar/port-manager/pull/1 (Master Plan v1)

**Platform documentation**
- Electron security guidance: https://www.electronjs.org/docs/latest/tutorial/security
- Electron support policy (latest three stable majors): https://www.electronjs.org/docs/latest/tutorial/electron-timelines
- Microsoft Windows client removed features (WMIC): https://learn.microsoft.com/en-us/windows/whats-new/removed-features
- Windows 10 release lifecycle: https://learn.microsoft.com/en-us/windows/release-health/release-information
- Windows TCP listeners: https://learn.microsoft.com/en-us/powershell/module/nettcpip/get-nettcpconnection
- Windows process metadata: https://learn.microsoft.com/en-us/windows/win32/cimwin32prov/win32-process
- Windows taskkill: https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/taskkill

---

**Audit conclusion:** The current code does not satisfy the approved production-release criteria. The most critical change is to make the privileged service authoritative for **who is being stopped, whether stopping is allowed, what other ports are affected, and whether the requested port was actually freed**. The static and controlled-execution portion of Phase 2 is documented here; real Windows integration, packaging, security, and performance validation remain explicit prerequisites for closing Phase 2 and finalizing the architecture.

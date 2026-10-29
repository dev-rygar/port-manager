# Port Manager — Master Plan v1

**Project:** [dev-rygar/port-manager](https://github.com/dev-rygar/port-manager)  
**Document version:** 1.0 (initial baseline)  
**Prepared:** 2026-10-30  
**Status:** Product direction and priorities approved; technical design is provisional; runtime audit pending  
**Repository baseline:** main at commit [e4a1585](https://github.com/dev-rygar/port-manager/commit/e4a1585cb7755c24a04140834d92d9a3754d28ee)

> **How to use this document:** Approved product requirements are commitments for the intended first release unless explicitly changed. Technical suggestions, classifications, and implementation choices are proposals to validate during the audit. An unchecked gate does not imply that the current application has passed it.

## 1. Executive summary

Port Manager is a **Windows desktop utility for developers, including beginners and AI-assisted/vibe-coding workflows**, who want to find, understand, and safely stop processes occupying network ports **without repeatedly searching for terminal commands or needing deep Windows process knowledge**.

**Primary user journey:** Enter an occupied port → identify its owner → understand the impact of stopping it → stop the intended process with safeguards → verify that the process stopped and the port's current state.

**Two approved goals:**

1. **Engineering excellence:** clean architecture, security, reliability, maintainability, testing, and production-ready release standards.
2. **Product improvement:** resolve real development-server problems, including port conflicts, duplicate servers, parent/child relationships, and safe termination of multiple processes.

**Non-negotiable product principles:**

1. **Simple by default:** Common conflicts should take only a few clear interactions to resolve.
2. **Safe by design:** Unknown does not mean safe; safeguard privileged and destructive operations in the backend, not just the UI.
3. **Transparent about consequences:** Explain precisely which processes and listening endpoints are affected, and verify and report the outcome.

This is **not** intended to become a full Windows Task Manager replacement.

## 2. Scope, users, and boundaries

### 2.1 Target users

- Developers troubleshooting "port already in use" errors from Next.js, Vite, Node.js, databases, and other local services.
- New developers and AI-assisted/vibe coders who may not know PIDs, process trees, or Windows commands.
- Experienced developers wanting a quick, reliable port-conflict workflow.

### 2.2 Target environment

- **Platform:** Local Windows desktop; target Windows 10 and Windows 11 compatibility (test and document the exact supported versions).
- **Packaging:** Installable and portable distribution are currently configured; retain or revise after release audit.
- **Privileges:** Prefer functionality without elevation; explain restricted metadata and termination failures. No blanket administrative requirement.
- **Connectivity:** Local operations should work offline. Do not require an account or external service.
- **Network inventory:** TCP listening endpoints are the required minimum. Decide during audit whether UDP is included; UDP has no TCP-style LISTENING state and needs distinct handling.

### 2.3 In scope for the first public release

- Discover listeners and owning processes; search by port or process.
- Show understandable identity and available process metadata.
- Show other listening endpoints belonging to the process.
- Inspect parent/child relationships and describe them.
- Safely stop one process or multiple selected unique processes.
- Preview impact before destructive actions.
- Verify termination and current port ownership afterward.
- Detect high-risk or protected targets and handle uncertainty explicitly.
- Handle stale data, permission errors, partial failure, and refresh races.

### 2.4 Not in scope for first release

- Automatically killing unknown processes or resolving conflicts without explicit user action.
- Remote-host process management, service administration, firewall edits, or privilege escalation bypasses.
- Guaranteed framework/project detection from port numbers alone.
- Comprehensive task management (CPU, memory charts, startup apps, system services).
- A default "stop the entire process tree" action; exploration and a separately designed, explicitly confirmed tree-stop feature may be considered later.
- Cross-platform support. The architecture should avoid unnecessary lock-in, but Windows correctness comes first.

## 3. Domain concepts and behavioral rules

| Concept | Meaning | Product rule |
| --- | --- | --- |
| Port | Numeric endpoint component, together with protocol and local address | A port cannot itself be killed. |
| Listener | A current local network binding (protocol, address, port, owner) | Display address and protocol when needed to distinguish endpoints. |
| Process | OS execution instance represented by a PID at a moment in time | Stop targets a process, not a port number. |
| PID | Identifier that may be reused after process exit | Never assume a stale PID still identifies the same process. |
| Related ports | Listening endpoints owned by the same PID/process instance | Show all detectable endpoints before stopping it. |
| Parent/child process | OS process relationship, distinct from shared ownership of a port | Inspection does not imply that terminating a parent automatically stops children. |
| Port role tag | User-supplied label such as Backend/Frontend/Database | A tag is organizational metadata, **not** permission to kill a future owner of that port. |
| Protected target | Process the app must not terminate under the product safety policy | Enforce rejection in the privileged service. |
| Unknown target | Insufficient identity/context to assess reliably | Never call it "safe"; show limitations and require deliberate confirmation or block where necessary. |

### 3.1 Stop semantics

- **Stop process:** Target one verified process instance. Stopping it normally closes the network endpoints it owns; unrelated processes and descendants are not implicitly targeted.
- **Stop selected:** Target a deduplicated set of explicit process instances. Preview a combined impact summary and return per-target results.
- **Stop process tree:** A *separate potential advanced action*; if ever shipped, it requires a separate specification, risk review, and explicit confirmation. Inspection of child processes is a first-release requirement, while automatic descendant termination is not.
- **Free port:** User-facing goal, not a guarantee. After stopping a process, re-query the listener and report whether the requested port remains occupied, is free, or cannot be verified.
- **Graceful versus forced stop:** Investigate whether a graceful stop can be offered reliably. The current use of forced termination must not be marketed as graceful. Do not promise unsaved work or database state will survive forced termination.

### 3.2 Canonical user scenario: duplicate development server

A Next.js dev command reports that port 3000 is occupied by a process and a second dev server already exists for the same project.

The expected product flow:

1. User enters **3000** or finds it in the port list.
2. App displays current owner with a confidence/unknown indication and available process information.
3. App shows other endpoints owned by that process, plus visible ancestry/descendants; it explains that these are different relationships.
4. App presents an impact preview and blocks known protected targets.
5. User intentionally confirms stopping the chosen process; app revalidates identity immediately before termination.
6. App displays a per-target outcome and refreshes the state of port 3000. If occupied, it shows the *new current owner*, if discoverable.
7. App may offer guidance about the existing duplicate server. It must not assert that two processes belong to the same project without adequate evidence.

## 4. Approved feature register

**Priority definitions:** Must have = required before first public release; Should have = high-value but may be deferred without compromising safe core functionality; Future = separate release planning.

| ID | Feature | Priority | Required behavior / acceptance summary |
| --- | --- | --- | --- |
| FR-01 | Quick port lookup | Must have | Enter a port number and see current owners, state, and next action or clear empty/error message. |
| FR-02 | Port and process discovery | Must have | Enumerate supported local listening endpoints with accurate protocol, address, port, and owner PID where available. |
| FR-03 | Process information | Must have | Show PID, process/executable name, path, and command line when available; explicitly mark unavailable metadata. |
| FR-04 | Clear identification | Must have | Use understandable labels and explanations, without representing heuristic framework names as facts. |
| FR-05 | Related ports | Must have | Show every *detected* listening endpoint owned by the selected process instance, without silently hiding distinct addresses. |
| FR-06 | Parent-child relationships | Must have | Show known parent and descendants; indicate missing/unverifiable relationships and that children are not automatically stopped. |
| FR-07 | Safety assessment and protection | Must have | Block known protected targets in the backend; differentiate verified restrictions, elevated risk, and unknown cases. |
| FR-08 | Stop one process | Must have | Preview, confirm, revalidate, terminate, verify, and report. |
| FR-09 | Bulk termination | Must have | Select multiple unique PIDs/process instances, preview combined impact, stop eligible targets, and report partial failures. |
| FR-10 | Impact preview | Must have | Enumerate affected detected endpoints and target processes; clearly separate direct targets from observed descendants. |
| FR-11 | Termination verification | Must have | Confirm target process outcome and independently recheck requested port occupancy; never equate command exit code with a free port. |
| FR-12 | Error handling and recovery | Must have | Explain access denied, stale targets, unknown owner, discovery errors, and remaining occupation with suggested next action. |
| FR-13 | Search, filtering, sorting, refresh | Must have | Stable user interactions, no out-of-order stale refresh overwrites, and informative empty/loading states. |
| FR-14 | Development groups | Should have | Organize known development processes; stale port tags must not implicitly target unrelated future owners. |
| FR-15 | Duplicate dev-server guidance | Should have | Surface *possible* duplicate server situations with uncertainty noted; do not auto-kill. |
| FR-16 | Project-aware grouping | Future | Associate processes with projects only when identifiers are sufficiently reliable. |
| FR-17 | Automatic conflict resolution | Future | Guided solutions with explicit authorization; never autonomous termination of unknown targets. |

### 4.1 Acceptance scenarios (functional)

- **AC-01:** Entering an unoccupied TCP port produces "No listening process found" and does not expose a Kill button.
- **AC-02:** If one PID listens on ports 3000 and 9229, selecting either row identifies the correct endpoint and previews both detected ports before process termination.
- **AC-03:** If two PIDs are selected and one has multiple endpoints, the action targets each PID once, not once per table row.
- **AC-04:** A known protected system process cannot be terminated by changing renderer state, invoking IPC directly, or using a development-group tag.
- **AC-05:** A saved tag for port 3000 does not silently approve the termination of a different future owner of port 3000.
- **AC-06:** If a PID has exited or identity changed after preview, termination is refused or the user is required to preview again.
- **AC-07:** If one bulk target fails, other outcomes are reported accurately with no blanket success claim.
- **AC-08:** If the terminated process exits but the port remains in use, the UI reports "Process stopped; port still occupied" with refreshed ownership where available.
- **AC-09:** Unknown executable metadata is shown as unknown, not guessed from the port alone.
- **AC-10:** Parent/child inspection distinguishes ownership of multiple ports from process ancestry; stop-one never silently expands to descendants.
- **AC-11:** An older refresh request cannot replace the result of a newer request.
- **AC-12:** User-visible process names, executable metadata, and command lines cannot inject HTML, event handlers, or script through rendering.

## 5. Safety and destructive-action policy

### 5.1 Proposed risk categories (audit must validate)

| Category | UI treatment | Execution policy |
| --- | --- | --- |
| Protected | Clearly marked; Stop disabled | **Hard reject in main/service layer.** No renderer override. |
| Elevated risk / OS-related | Strong warning; highlight what could break | Require explicit per-target confirmation; determine whether selected classes must be blocked from bulk operations. |
| Insufficient information | "Unable to verify" with limitations | No "safe" label; deliberate confirmation or block if reliable identity verification is impossible. |
| Likely ordinary development process | Explain why it appears related to development | Still preview and confirm; do not rely on filename or typical port alone as authorization. |

**Policy decisions still open:** exact protected-process inventory, how to treat service-hosted processes, access-denied metadata, processes owned by other users, PID creation-time availability, and the threshold for refusing a termination.

### 5.2 Mandatory execution safeguards

1. Validate the renderer IPC sender and all inputs in the privileged main-process boundary.
2. Interpret target identity using more than a port role or a stale PID wherever the OS permits; re-query current ownership and process identity before stop.
3. Enforce protected-process checks in the backend, independent of confirmation dialogs.
4. Preview **unique process targets** and associated detected endpoints; a port grouping/tag must never expand action scope implicitly.
5. Use argument-based subprocess invocation (for example, execFile/spawn with shell disabled) or supported Windows APIs, not interpolated shell commands.
6. Preserve evidence of unknown/partial metadata and fail closed for clearly unsafe or invalid requests.
7. Return structured per-target states such as stopped, already-exited, refused, failed, and verification-unknown.
8. Recheck port occupancy separately from process exit. Treat races and a different process rebinding the port as possible.
9. Avoid automatic elevation or disabling Windows access controls; report the actual permissions limitation.
10. Never describe forced process termination as harmless or guaranteed to preserve application state.

**Important:** No heuristic can certify that an arbitrary user process is safe to stop. Product language must communicate confidence and limitations.

## 6. Proposed system architecture (not yet approved implementation)

The present app uses Electron main/preload/renderer, a port service, and port reference definitions. **Keep this separation as the starting point; do not rewrite for a framework merely to appear "production-grade."**

### 6.1 Responsibilities

| Layer | Responsibilities | Must not do |
| --- | --- | --- |
| Renderer / presentation | Search, filtering, selection, impact visualization, accessible dialogs, feedback | Run OS commands or decide final termination permission |
| Preload / IPC contracts | Minimal explicit API exposed with input/output contracts | Expose unrestricted ipcRenderer, shell, or Node |
| Application services | Discover + normalize, build snapshots, preview and enforce stop workflow, verify results | Rely on UI flags/tags as security checks |
| Domain logic | Listener/process identity, graph relationships, grouping, policy, result models | Depend on DOM or Electron APIs |
| Windows adapter | OS data collection and process actions; structured error mapping | Expose raw privileged operations to the renderer |
| Persistence | User preferences and role labels; constrained schema | Store stale process approvals or claim port ownership is permanent |

### 6.2 Proposed data model

- **Listener:** protocol, localAddress, localPort, state when meaningful, owningPid, observation timestamp.
- **ProcessIdentity:** pid, creationTime when available, executableName, executablePath when available, session/user metadata as allowed.
- **ProcessDetails:** commandLine (optional/sensitive), parentPid (optional), known descendants, identity/status confidence, metadata-unavailable reasons.
- **ProcessSnapshot:** observedAt, a set of listeners, a set of processes, discovery source/errors; avoid treating one scan as an atomic truth.
- **StopPreview:** intended target identity/identities, related ports, descendants for information, safety decision, warning reasons, snapshot freshness.
- **StopResult:** per-process disposition and error class, verification status, refreshed listener status.
- **UserTag:** role label and explicit association semantics; never authorizes future termination.

### 6.3 IPC workflow proposal

- Read/listen: **getListeners**, **getProcessDetails**.
- Preview: **previewStop** (selection of explicit identities) returns a fresh impact/policy decision.
- Execute: **stopSelected** uses a validated, freshness-checked selection; re-evaluates permissions and identity server-side.
- Verify: service refreshes affected processes/listeners and returns structured outcomes.
- Renderer never chooses whether a process is protected or sends arbitrary operating-system command strings.

API names, detailed types, use of TypeScript, exact folder structure, and choice of Windows API versus PowerShell remain pending audit. Avoid premature abstractions and retain vanilla JavaScript if it continues to be the simplest maintainable UI choice.

## 7. Discovery and performance design constraints

- Prefer supported Windows APIs or structured PowerShell/CIM output over deprecated WMIC or parsing locale-dependent display text.
- Assess Get-NetTCPConnection for listener discovery and Win32_Process/CIM for process relationships and available metadata; investigate permissions and performance before selecting them.
- Avoid one subprocess per listener and redundant metadata lookups for the same process.
- Deduplicate by a **real listener identity**, not merely "port + protocol + PID" if this hides distinct address bindings.
- Treat UDP explicitly if added; it does not have TCP's LISTENING state.
- Bound request duration, concurrency, and output size; support refresh cancellation or monotonic request IDs.
- Establish numerical discovery/refresh performance budgets from measured Windows baselines during Phase 2, not guesses now.
- Keep a documented compatibility matrix for target Windows versions and standard versus elevated execution.

## 8. UX standards and flows

### 8.1 Default flow: find and free a port

1. Port search is prominent; entering "3000" returns zero, one, or multiple current listeners.
2. Display process owner in plain language, with PID and technical fields available in details.
3. Display explanation: "Stopping this process also closes these detected listening endpoints" and distinguish child processes.
4. Show a warning tier with why it was assigned and how certain that assessment is.
5. Require an explicit destructive confirmation; disable while running and prevent duplicate submissions.
6. Present separate verification statements for process status and port status.
7. If unresolved, show the updated owner / access-denied reason and a clear retry or help option.

### 8.2 Bulk flow

- Explicit multi-select; count *distinct processes*, not rows.
- Preview all targets, owned ports, high-risk targets, and exclusions.
- No hidden addition of siblings/parents/descendants.
- Report a detailed result by process; do not suppress partial failures.

### 8.3 Accessibility and clarity

- All interactive actions keyboard-operable; meaningful focus, labels, sorting semantics, and menu/dialog behavior.
- Errors exposed visibly and accessibly; do not rely exclusively on color.
- Do not call a process "safe" merely because it is Node.js, on port 3000, or labeled Backend.
- Make empty, loading, stale-data, and incomplete-metadata states explicit.
- Avoid overwhelm: default view shows goal-oriented information, with optional advanced inspection.

## 9. Engineering and quality standards

### 9.1 Code and maintainability

- Single responsibility and module boundaries; platform logic is independently testable from Electron and the DOM.
- Prefer clear, typed data contracts (TypeScript recommended **for evaluation**, not yet mandated) and runtime validation at IPC.
- Use structured domain errors, not only raw command stderr.
- No unrelated mass rewrite or UI framework migration without a documented benefit.
- Pin and maintain supported dependencies; assess Electron/Chromium/Node security updates.
- Format/lint consistently; document decisions when they meaningfully constrain future work.

### 9.2 Security

- Maintain contextIsolation and nodeIntegration restrictions; verify actual sandbox settings.
- Constrain navigation, new windows, permissions, external links, and content security policy according to Electron security guidance.
- Validate all IPC sender frames and inputs, especially process-kill requests.
- Treat executable paths, product names, and command lines as untrusted text in the renderer; prefer textContent over HTML interpolation.
- Reduce shell exposure; apply least privilege and a protected-process policy.
- Document logs and avoid unnecessarily persisting command lines, usernames, or sensitive environment information.

### 9.3 Tests

- Unit: listener parser/adapter normalization; PID and identity validation; policy decisions; tag semantics; deduplication; parent/child calculations.
- Contract: IPC input validation and sender checks; structured success/failure objects.
- Integration: mocked Windows command/API results including missing WMIC, access denied, raced exits, new owner rebinding, malformed/locale-specific outputs.
- Windows E2E: actual simple dev-server conflict, process with multiple ports, multi-select, parent/child relationships, protected target rejection, permission failures, and both installer/portable builds.
- UI accessibility: keyboard-only find/inspect/stop flow; focus and screen-reader labels.
- Regression: reproduce every confirmed Phase 2 defect and add a test before fixing where practical.

### 9.4 Release engineering

- Reproducible installs/builds, CI checks (lint, tests, packaging), dependency vulnerability review, tested installer and portable builds.
- Clear supported-OS matrix, documented privileges, installation/uninstallation instructions, privacy expectations, changelog, license file, and release notes.
- Assess Windows code signing and publisher reputation/SmartScreen experience before broad distribution.
- Publish no production-ready claim until release gates are met.

## 10. Existing-repository baseline (static observations, not runtime validation)

Current source at commit e4a1585:

- **main.js:** Electron BrowserWindow and handlers for getPorts / killProcess.
- **preload.js:** Minimal bridge exposing those two methods.
- **src/services/portService.js:** netstat enumeration, WMIC/tasklist process lookup, PowerShell app metadata, taskkill.
- **src/services/portReference.js:** Port-number labels and some system-process metadata.
- **src/renderer/app.js:** Search, sort, tab switch, port tagging, details, individual/bulk kill.
- **src/renderer/index.html / styles.css:** Dark-themed table-driven UI.
- **package.json:** Electron 28 range, electron-builder 24 range, Windows x64 NSIS/portable build configuration.
- **Missing in tree:** Automated tests, CI workflows, LICENSE file, this plan prior to the planning branch.

### 10.1 Phase 2 audit hypotheses and known static code concerns

These are **investigation items**, not claims of reproduced Windows failures.

| Audit ID | Static concern or hypothesis | Location | Verification needed |
| --- | --- | --- | --- |
| AUD-01 | IPC kill accepts a PID without enforceable protected-target policy | main.js; portService.js | Test direct IPC calls and critical-target policy |
| AUD-02 | Saved tag keyed only by port may apply to unrelated future owners | renderer/app.js | Reassign port to new process; inspect group impact |
| AUD-03 | Dynamic innerHTML plus incomplete quoted-attribute escaping | renderer/app.js | Malicious product-name metadata test, CSP evaluation |
| AUD-04 | WMIC removal degrades process paths and application metadata | portService.js | Test current Windows 11 installations without WMIC |
| AUD-05 | PID parsing accepts partial strings and imposes arbitrary upper bound | portService.js | Strict validator regression tests |
| AUD-06 | Metadata fetch invokes PowerShell per row without PID-level caching | portService.js | Profile 1 PID/many ports and many unique PIDs |
| AUD-07 | UDP row length and state handling may exclude UDP records | portService.js | Fixture-based verification; decide UDP scope |
| AUD-08 | Detail view selects first row with matching PID, not clicked endpoint | renderer/app.js | One PID listening on 2+ ports |
| AUD-09 | Bulk stop may repeat PIDs and hides individual failures | renderer/app.js | Duplicate ownership and access-denied tests |
| AUD-10 | Out-of-order refresh can render older results | renderer/app.js | Controlled latency/interleaving test |
| AUD-11 | Port-number heuristics do not prove service or process safety | portReference.js | Adversarial classification fixtures |
| AUD-12 | No tests/CI and aging Electron dependency baseline | repo/package files | Build/lint/test setup and dependency audit |
| AUD-13 | Listener deduplication may conflate address bindings | portService.js | IPv4/IPv6/listen-on-specific-address fixtures |
| AUD-14 | Process-exit / PID-reuse race at confirmation time | UI to main kill flow | Simulated process churn and identity checks |
| AUD-15 | Keyboard navigation and accessible names incomplete | renderer/index.html/app.js | Manual keyboard and accessibility check |

**Evidence labels for the audit:** Confirmed-by-source, Reproduced-on-Windows, Not-reproduced, Open / needs environment. Severity and remediation must identify actual impact and reproduction evidence.

## 11. Phased implementation and review sequence

### Phase 1 — Master Plan v1 (this document)

**Deliverables:** Approved problem statement, feature register, principles, acceptance scenarios, safety constraints, proposed architecture, and audit checklist.

**Exit gate:** Product requirements are traceable and provisional technical decisions are marked as such. **This gate does not validate implementation.**

### Phase 2 — In-depth technical audit

**Work:**

1. Establish a clean Windows baseline, exact OS/build/Node/npm/Electron versions, reproducible install and startup.
2. Review entire source and dependency chain against FR-01..FR-17 and security standards.
3. Build minimal fixture-driven tests for discovery, selection, validation, and destructive-action boundaries.
4. Reproduce or disprove AUD-01..AUD-15, recording steps, expected/actual results, logs (with sensitive values redacted), and environment.
5. Profile discovery, refresh, and metadata resolution on a representative machine.
6. Exercise protected process, unknown metadata, duplicate servers, PID reuse, permissions, multi-port ownership, and partial failure.
7. Review Windows portability, installer and portable execution, and keyboard UX.
8. Produce prioritized findings, evidence, recommended fixes, and unanswered design decisions.

**Exit gate:** No high-impact remediation is scheduled solely from conjecture where a reproducible check is feasible; safety gaps have explicit risk treatment and owners. The audit may require user-run Windows test evidence if remote execution is unavailable.

### Phase 3 — Finalize architecture and implementation roadmap

**Work:** Resolve discovery adapter, identity policy, protected-process rules, IPC contracts, persistence semantics, language/tooling, test plan, and milestones. Document alternatives and tradeoffs.

**Exit gate:** Architectural decisions are recorded and linked to verified findings; implementation tasks have dependencies and acceptance tests.

### Phase 4 — Implement incrementally

**Suggested order (not calendar estimates):**

- **M1 Safety foundation:** privileged validation, process identity recheck, protected targets, safer renderer data handling, accurate stop semantics.
- **M2 Reliable discovery:** Windows adapter, executable/command-line metadata, deduplicated snapshots, relationships, current-owner refresh, race handling.
- **M3 Goal-oriented UX:** quick lookup, related ports, impact preview, confirmation, informative results, recovery.
- **M4 Bulk and groups:** multi-selection, per-target reporting, safe tags, optional dev-server guidance.
- **M5 Quality:** tests, accessibility, CI, packaging, dependencies, docs.

**Exit gate:** Each implemented feature meets its acceptance scenarios and regression tests. Changes ship in reviewable increments, not a single rewrite.

### Phase 5 — Validate production readiness

**Exit gate checklist (all required before labeling release production-ready):**

- [ ] All Must-have feature scenarios demonstrated on a supported Windows environment.
- [ ] Protected-target and IPC safety tests pass; no known critical/high severity safety defect remains without explicit treatment.
- [ ] Discovery produces correct endpoint → owner relationships for tested TCP scenarios.
- [ ] Process identity churn, stale preview, partial failure, and permission-denied paths are exercised.
- [ ] Process stop and port-free verification are reported separately and truthfully.
- [ ] Automated tests and CI pass from a clean checkout.
- [ ] Electron and transitive dependencies reviewed for supported/secure versions and actionable vulnerabilities.
- [ ] Installer and portable build smoke-tested, including unprivileged execution and uninstall.
- [ ] UI keyboard accessibility and high-risk warnings reviewed.
- [ ] README, license, compatibility requirements, limitations, changelog, and user-facing troubleshooting are current.
- [ ] Release assets have hashes and a deliberate distribution/signing decision.
- [ ] Outstanding bugs and feature deferrals are recorded in release notes.

## 12. Decisions, open questions, and change control

### 12.1 Approved and fixed for planning

- Developer-first, beginner-friendly **port conflict resolver**; not a generic Task Manager clone.
- Engineering excellence + feature improvement are parallel goals.
- Simplicity, safety, and transparent consequences are guiding principles.
- All features in Section 4 and their priorities are approved as the current product baseline.
- First-release actions are user initiated; automatic conflict resolution is future scope.
- Process ancestry inspection is required; stopping a parent is **not** treated as automatically stopping its children.
- Work proceeds in five phases: master plan, audit, architecture/roadmap, incremental implementation, release validation.

### 12.2 Proposals to be confirmed after audit

- Use of TypeScript and scope of migration.
- Windows discovery implementation: APIs, structured PowerShell/CIM, or hybrid.
- Exact protected-target policy, additional caution levels, and handling for limited permissions.
- Efficient process metadata cache and refresh strategy.
- Organization/storage schema for dev-role tags.
- Optional graceful process stop; optional future advanced stop-tree action.
- Final support matrix and numeric performance thresholds.
- Packaging/signing/CI tooling.

### 12.3 Important open questions (do not block Phase 2)

1. How should multiple listeners with the same numeric port but different protocols/addresses be displayed and searched?
2. When process creation time/path is hidden, which termination actions can safely be offered?
3. How do we identify a known critical Windows process beyond fragile port-number or filename heuristics?
4. What is the least confusing way to show children without encouraging unsafe tree termination?
5. Should "development groups" persist per port, process identity, executable, or an explicit user-defined rule?
6. Do we include UDP in v1, or explicitly label the inventory as TCP listeners only?
7. Should the product support Windows 10 after its general support end, and for how long?
8. What measured discovery latency and refresh frequency are realistic on typical developer machines?

### 12.4 Change policy

- Update this plan when a product requirement or agreed priority changes; note the decision and rationale.
- Capture detailed engineering choices in small architecture-decision records after Phase 2.
- Link verified audit evidence and later implementation PRs/tests to feature IDs.
- Do not silently expand destructive behavior while implementing UI improvements.

## 13. Reference material

- Repository baseline: https://github.com/dev-rygar/port-manager/tree/e4a1585cb7755c24a04140834d92d9a3754d28ee
- Electron security checklist: https://www.electronjs.org/docs/latest/tutorial/security
- Microsoft: WMIC retirement (WMI itself is still supported): https://learn.microsoft.com/en-us/windows/win32/wmisdk/wmic
- Microsoft: TCP listeners and process ownership: https://learn.microsoft.com/en-us/powershell/module/nettcpip/get-nettcpconnection
- Microsoft: taskkill semantics (/PID, /F, /T): https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/taskkill

---

**Document lifecycle:** Phase 1 product baseline. Technical choices and release readiness remain pending evidence from Phases 2–5.
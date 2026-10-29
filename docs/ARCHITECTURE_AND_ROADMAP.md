# Port Manager — Phase 3 Architecture & Implementation Roadmap

**Version:** 0.1 — provisional architecture proposal  
**Date:** 2026-10-30  
**Status:** Ready for product/engineering review; **not** finalized or approved for production  
**Baseline code:** main at e4a1585cb7755c24a04140834d92d9a3754d28ee  
**Depends on:** [Master Plan v1 (PR #1)](https://github.com/dev-rygar/port-manager/pull/1), [Phase 2 Engineering Audit (PR #2)](https://github.com/dev-rygar/port-manager/pull/2), and [Deferred Windows Testing](https://github.com/dev-rygar/port-manager/blob/audit/engineering-audit-v1/docs/DEFERRED_WINDOWS_TESTING.md)

> **Meaning of this document:** The architectural boundaries and development sequence are a recommended implementation direction based on inspected source and controlled probes. OS-specific adapter selection, protected-process rules, and performance targets require real Windows evidence. Deferring those tests does not mean they passed, and it does not waive any production-release criteria.

## 1. Objective and non-negotiable constraints

Port Manager is a Windows desktop **port-conflict resolver** for developers, especially people who do not know the Windows process commands. The primary journey remains:

**Find port → identify current owner → preview all affected endpoints → safely stop the explicitly selected process(es) → verify whether the port became available.**

The architecture serves two approved goals: **engineering excellence** and **feature improvement**. It must uphold the approved principles of **simple by default**, **safe by design**, and **transparent about consequences**.

**Constraints:**

- A port is not terminated; a process is. One process can own several listening endpoints.
- Parent/child process relationships are different from multiple ports owned by one PID.
- An unknown application is not automatically safe; a common port number is not reliable process identity.
- The renderer cannot authorize privileged actions; persistent labels/tags cannot authorize process termination.
- The first release does not auto-kill unknown processes or implicitly terminate process trees.
- The app should operate as a standard user where possible and explain restrictions rather than requesting blanket elevation.
- We must preserve existing utility value while fixing safety and correctness; no automatic framework rewrite.

## 2. Decision register

| ID | Decision / proposal | Status | Rationale / condition |
| --- | --- | --- | --- |
| ADR-01 | Keep Electron as the desktop shell | **Provisional recommendation** | Existing main/preload separation is useful; upgrade from Electron 28 to a maintained compatible version. |
| ADR-02 | Keep vanilla JavaScript renderer initially | **Provisional recommendation** | Scope does not justify a rewrite to React; revisit if UI state complexity warrants it. |
| ADR-03 | Process identity and listener endpoints are separate domain entities | **Required design principle** | One PID may bind multiple endpoints; address/protocol matter. |
| ADR-04 | Windows OS operations live behind a single platform adapter interface | **Provisional recommendation** | Allows isolated unit testing and replacing WMIC/netstat without changing UI code. |
| ADR-05 | Main process validates IPC sender, inputs, and termination permissions | **Required security boundary** | The renderer is untrusted for kill authorization. |
| ADR-06 | Stop requests use fresh process identity and revalidation | **Required safety outcome; mechanism open** | PID-only kill is vulnerable to reuse and stale previews; exact mechanism must be tested on Windows. |
| ADR-07 | Stop is explicitly separate from stop-tree | **Approved product behavior** | Inspect ancestry/descendants, but never silently include them in a standard stop action. |
| ADR-08 | Port labels/tags are organizational only | **Required safety outcome** | A future process on the same port must not inherit authorization to stop. |
| ADR-09 | Preview, execute, and verify are distinct service stages | **Recommended contract** | A successful taskkill command does not prove the requested port is free. |
| ADR-10 | Prefer structured supported Windows metadata API over WMIC | **Provisional; adapter unresolved** | Windows-version, permissions, and performance evidence still pending. |
| ADR-11 | Types/runtime validation at domain/IPC boundaries | **Recommended** | TypeScript adoption is optional; runtime validation cannot be replaced with static types. |
| ADR-12 | No automatic elevation or arbitrary shell command execution | **Required security principle** | Least-privilege and bounded OS operations. |
| ADR-13 | First-release network scope is TCP listening endpoints | **Provisional recommendation** | UDP support must be explicitly modeled or deferred; confirm against product requirements. |

**Open decisions must be recorded; a recommendation is not a validated Windows implementation.**

## 3. Target module boundaries

The following is a **logical architecture**, not a commitment to specific directory names or a dependency-injection framework:

    Renderer (search, table, inspector, preview, results)
       |
    Preload (explicit limited methods, data-only contracts)
       |
    Electron Main (sender verification, runtime input validation)
       |
    Application services
      - DiscoverSnapshot: orchestrate listeners and process metadata
      - ResolveRelations: match owned endpoints, parent/children
      - PreviewStop: normalize unique selected process targets, evaluate impact
      - ExecuteStop: revalidate identities and protection policy
      - VerifyStop: re-query process and port occupancy, report outcomes
       |
    Domain (pure functions, models, policy decisions, typed errors)
       |
    Windows adapter (network/process read, process stop, OS error mapping)
       |
    Windows OS APIs or bounded command invocations

Persistence stays separate and stores **preferences/labels**, not permanent process identities or stale kill authorization.

### 3.1 Responsibilities

| Boundary | Owns | Explicitly does not own |
| --- | --- | --- |
| Renderer | Filtering, sorting, selection, readable explanation, confirmation, keyboard accessibility | Safety policy, shell commands, authorization |
| Preload | Minimal named IPC calls, serialization | Generic ipcRenderer passthrough |
| Main | Validate sender, runtime schema, permitted operation, bounded request lifecycle | UI state and process classification from port hints |
| Application | Fetch fresh snapshots, build stop preview, orchestrate stop/verify, per-target results | Rely on tags or caller-provided process names |
| Domain | Listener identity, process identity, relationship graph, stop policy, error categories | Electron or child_process APIs |
| Windows adapter | Retrieve listeners/metadata/ancestry; execute permitted termination; map OS errors | Decide UI labels or persisted group tags |
| Preference store | Tagged port roles and display preferences | Approval to stop a current or future process |

### 3.2 Proposed domain data contracts

- **Listener:** protocol, localAddress, localPort, state, owningPid, observedAt. Do not merge distinct address bindings into one string.
- **ProcessIdentity:** pid, creationTime when available, executable identity when available, identityConfidence/limitations. A PID alone is not sufficient proof of continuity.
- **ProcessInfo:** name, path and command line when permitted, parentPid, descendants/relationship confidence. Mark unavailable fields as unavailable.
- **Snapshot:** capture timestamp, collection source(s), listener records, process records, partialError list. Collection is not assumed atomic.
- **StopTarget:** explicit process identity from the current preview, not an arbitrary port or group ID.
- **StopPreview:** current targets, detected affected endpoints, observed children (informational), policy result, warnings, timestamp and expiry.
- **StopResult:** per-target status (stopped / alreadyExited / refused / failed / identityChanged / unverifiable), reason, verified process state, verified endpoint/port state.
- **PortTag:** user label scoped by declared semantics; never a kill authorization token.

**Privacy:** Executable paths and especially command lines can contain credentials or local personal data. Avoid persistent raw command-line storage and redact logs/tests.

### 3.3 Recommended privileged API lifecycle

These are conceptual commands, **not committed method names**:

1. **snapshot():** Return currently observed listeners, processes, timestamps, and partial-data warnings.
2. **previewStop(targetIdentities):** Re-resolve targets and all detected owned listeners; evaluate the backend safety policy; issue a short-lived preview handle bound to the requesting window/session.
3. **executeStop(previewHandle, userAcknowledgement):** Revalidate the handle, caller, process identity, current ownership, and policy; reject stale/unverifiable/protected targets. Work on unique process identities only.
4. **verifyStop():** After a bounded wait, independently check process exit and current listener ownership; return structured outcomes. Do not infer free port from taskkill exit code alone.
5. **invalidate on changes:** A new target identity, expired preview, or changed impact must trigger a new preview/confirmation.

**Critical limitation:** A re-query followed by a PID-only command still has a narrow time-of-check/time-of-use race. Investigate Windows handle-based execution/identity verification if required for a defensible safety guarantee. The design must not pretend that separate “check then taskkill” operations are atomic.

**Renderer failure behavior:** If discovery fails, label the snapshot incomplete; do not silently present guessed identity as verified. If an operation fails partway through, return per-target outcomes rather than a blanket success alert.

## 4. Windows integration — decisions held pending evidence

The current service uses netstat, WMIC, tasklist, PowerShell, and taskkill. It is easy to start with but has known parser, metadata, timeout, and PID-safety defects.

### Candidate choices

| Concern | Candidates | Evaluation criteria |
| --- | --- | --- |
| Listening sockets | Get-NetTCPConnection, supported Windows API, or tested fallback | Correct ownership, IPv4/IPv6/address fidelity, privileges, speed, localization |
| Process metadata | Get-CimInstance Win32_Process / native API | PID, creation time, executable, command line, parent PID when available; restricted processes |
| Termination | Native Windows process handle APIs or bounded taskkill fallback | Identity stability, error specificity, safety guard enforcement, reliable verification |
| Output transport | Structured JSON/API result over parsing display text | Lossless fields, encoding, partial errors, reproducible fixtures |
| Caching | Per-snapshot PID metadata cache, bounded concurrency | Avoid repeated PowerShell per listener; correct invalidation |
| Error handling | Typed/unified adapter errors | Permission denied, PID exited, unavailable API, timeout, malformed output |

**Decision criteria and gates:** Run Windows tests WT-01–WT-09 from the deferred register and collect exact build/version, privileges, correctness, race handling, and performance. Only then accept a concrete Windows adapter implementation.

**Timeout and resource policy:** Every subprocess or OS query needs a bounded execution budget, cancellation/cleanup where supported, output-size limits, and explicit failure states. Set numeric budgets after measurements.

## 5. Security model and stop policy

- **Electron hardening:** Keep context isolation and disabled Node integration; validate sandbox behavior, add IPC sender checks, restrict unexpected navigation/new-window/permissions, maintain restrictive CSP, keep Electron supported.
- **Trusted boundary:** Main-process authorization must apply even if the renderer is modified, reloaded, or sends malformed/stale input.
- **Target identification:** For each selected endpoint, resolve the *actual process owner* and identity at preview time and again at execution time. Do not authorize by port number.
- **Protected / caution / unknown:** Known critical processes must be hard-blocked at the privileged boundary. Other risk tiers require an explicit reviewed policy; unknown identity is not equivalent to a safe process.
- **No implicit collateral scope:** A standard stop targets only the selected process instances, never a parent, sibling, or descendant merely because they are related. Still explain all ports owned by each selected instance.
- **Prevent misleading certainty:** “Port commonly used for Vite” is a hint, not proof the running process is Vite. Never show “safe to kill” based solely on process name or port.
- **IPC and invocation:** Runtime-validate arguments, use least-privilege OS operations, prefer argument-array subprocess APIs with shell disabled, and never pass arbitrary commands from renderer.
- **UI behavior:** Require visible impact preview for destructive actions; prevent double submits; report refused, failed, partial, and port-still-occupied outcomes.
- **Process trees:** Must-have visibility, not automatic tree killing. Consider any advanced tree-stop operation only in a separate reviewed feature proposal.

### Policy work intentionally left open

- Windows process-protection classification grounded in verified identity and Windows service behavior.
- Restricted process metadata and handling when creation time/identity cannot be established.
- Whether a native process-handle strategy is necessary for atomicity.
- Standard-user permissions and whether partial metadata may still permit a stop.
- Graceful shutdown possibilities versus force-only behavior, including user explanation.

## 6. Implementation sequence — small reviewable PRs

Each implementation PR should link the affected audit IDs and feature requirements, include new tests for changed behavior, and avoid unrelated UI rewrites. **Do not build the new bulk-kill UI on top of the existing unsafe service.**

### M0 — Test seams and safety containment

**Goal:** Make the current code safely changeable.

- Introduce a minimal automated test runner and lint/format tooling.
- Extract pure parsing, identity, and policy functions from Windows command execution.
- Add fixtures and regression tests reproducing PM-A01–A08, A11–A17.
- Establish CI for non-Windows unit tests and a future Windows verification job.
- If a build is shared before safety controls are complete, disable or restrict the unsafe kill path rather than relying on UI warnings.

**PR slices:** test harness → core parser fixtures → safety boundary test scaffolding.

**Gate:** Repeatable clean install/test pipeline for changed modules; destructive operations cannot bypass the configured guard.

### M1 — Privileged safety and stop contract

**Goal:** Build a backend users can trust.

- Enforce IPC sender/argument validation, protected-process policy, and strict PID parsing.
- Introduce explicit preview, short-lived handle/target identity, and revalidation.
- Prevent duplicate targets and accidental descendant termination.
- Remove unsafe renderer HTML attribute insertion and misleading app-name fallback.
- Introduce structured stop/error results with tests for stale identity, no-permission, and partial failure.

**PR slices:** IPC validation → policy/identity guard → preview/execute workflow → security regression checks.

**Gate:** Direct IPC tests reject protected/stale/invalid targets; no UI flag can bypass the backend policy. Windows-dependent identity implementation stays provisional until WT-06/07 evidence.

### M2 — Windows discovery and verification

**Goal:** Report exactly what is running and what changed.

- Replace WMIC-based metadata path with an audited supported approach.
- Preserve distinct listener address/protocol identities.
- Fetch parent/child relationships and available process metadata.
- Deduplicate metadata queries with bounded execution and consistent error models.
- Verify process status separately from current requested-port occupation.

**PR slices:** adapter interface → structured discovery → relationship graph → post-stop verification.

**Gate:** Pure contract tests pass, then WT-01–WT-06 on Windows confirm actual behaviors. An OS adapter is **not finalized** before that.

### M3 — Safe developer workflow

**Goal:** Make the common port-conflict scenario effortless.

- Port-first search, clear owner description, related ports and process tree inspector.
- Accessible impact preview and explicit stop confirmation.
- Arbitrary multi-process selection and accurate per-target outcome summary.
- Fix details-row identity, Development tab search consistency, stale refresh ordering, informative empty/error/loading states.
- Persist group tags only as labels; never reuse them as kill permissions.
- Add optional, evidence-qualified duplicate dev-server guidance.

**PR slices:** port lookup → details/related ports → confirmation/results → bulk actions → groups/accessibility.

**Gate:** FR-01–FR-15 Must-have/Should-have scenarios tested; keyboard-only flows verified; no hidden force-terminate action.

### M4 — Release readiness

**Goal:** Produce an installable artifact that is safe to publish.

- Upgrade to supported compatible Electron and packaging dependencies.
- Dependency audit, reproducible builds, CI, and Windows version/privilege matrix.
- Installer and portable smoke tests, uninstall, error handling, security restrictions and accessibility.
- License, corrected README, limitations, versioned release notes, checksums and signing/SmartScreen decision.
- Run deferred WT-01–WT-12, add evidence to audit, and retest all remediated defects.

**Gate:** No unresolved P1 release blocker, all Must-have acceptance checks pass, Windows tests documented, actual release artifacts reviewed. **No production-ready binary publication before this gate.**

## 7. Traceability: findings to work

| Audit findings | Primarily addressed in |
| --- | --- |
| PM-A01, A02 (unsafe stop and PID reuse) | M1; Windows proof in M2/M4 |
| PM-A03 (impact/verification gap) | M1+M2+M3 |
| PM-A04, A05 (tag and bulk risks) | M1+M3 |
| PM-A06, A07, A08 (identity misinformation, HTML, IPC) | M1 |
| PM-A09 (obsolete Electron) | M4; assess security urgency in M0 |
| PM-A10–A14 (WMIC, parsing, metadata, timeout, fan-out) | M2 |
| PM-A15–A19 (refresh, selection, search, feature gaps, accessibility) | M3 |
| PM-A20 (release pipeline/documentation) | M0+M4 |

Detailed acceptance criteria FR-01–FR-17 and AC-01–AC-12 remain in Master Plan v1. The implementation order is deliberately safety-first rather than UI-first.

## 8. Testing strategy and deferred evidence

### Now: can run without Windows

- Fixture-based parser/identity/policy tests.
- Renderer unit tests for markup safety, selection, refresh races, and feedback.
- Main IPC tests for forged/synthetic sender and invalid payload rejection.
- Fake adapter tests for process churn, multiple endpoints, partial failure, and verification outcomes.
- Static dependencies/build-config review.

### Later: requires Windows environment

All WT-01–WT-12 from the [deferred Windows testing register](https://github.com/dev-rygar/port-manager/blob/audit/engineering-audit-v1/docs/DEFERRED_WINDOWS_TESTING.md), especially:

- Real network/process relationship discovery and permission behavior.
- Reproduction of stale PID, process exit/port rebinding, and tested process-tree behavior with **test-only** processes.
- Timing, reliability, and resource benchmarks of supported Windows APIs.
- Security restrictions in packaged Electron; clean installer/portable execution.
- Accessibility and packaging verification in real Windows runtime.

**Safety:** Never attempt to kill critical OS processes to verify a guard; test the guard by inspecting rejection and using mocked/stubbed termination.

## 9. Open risks and design questions

| Question | Current recommendation | Blocking decision |
| --- | --- | --- |
| Stable process identity through kill | Prefer a verified process handle where needed; fail closed if identity cannot be guaranteed | Windows strategy/feasibility tests |
| Safe handling of unknown owners | Distinguish unknown metadata from unverifiable identity; cautious confirmation vs refusal based on risk | Policy and Windows behavior |
| OS listener API | Prefer structured supported API, benchmark alternatives | WT-01/02/09 |
| TCP vs UDP | Ship TCP LISTENING first; explicitly document UDP out of scope | Product scope sign-off |
| Parent-child process kill | Display only; optional future advanced operation | Approved product principle already set |
| TypeScript adoption | Favor introducing types at domain and IPC contracts; do not rewrite renderer first | Effort/benefit discussion |
| Windows support | Test modern Windows 11 first; decide precise Windows 10 compatibility policy | WT-01 and support policy |
| Signing/distribution | Document code signing and SmartScreen tradeoffs before release | M4 distribution decision |

## 10. Phase 3 review gate and next action

**Ready now:** Architecture boundaries, process-first data models, safety requirements, a staged PR plan, and a test strategy.

**Not finalized:** Windows adapter and exact termination mechanism, numeric performance budgets, protected-process policy inventory, tested OS compatibility, and sign-off on release readiness.

**Next implementation action once this proposal is reviewed:** M0 — set up test seams and regression checks, then M1 — protect the privileged stop pathway **before** adding new destructive UI features. Window-specific mechanisms must retain explicit blocking gates pending deferred Windows testing.

### Review checklist

- [ ] Confirm architectural boundaries and process-first identity model.
- [ ] Confirm proposed milestone order and scoped PR sizes.
- [ ] Resolve whether first release is explicitly TCP-listeners only.
- [ ] Decide whether to adopt TypeScript incrementally at domain/IPC boundaries.
- [ ] Preserve pending Windows tests as unresolved release gates.
- [ ] Track any revised product requirement in Master Plan, not silently in code.

---

**Change control:** This is a draft proposal for Phase 3. It does not claim all Phase 2 validation was completed. Merging this documentation is not authorization to publish an executable.

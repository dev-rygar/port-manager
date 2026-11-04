# Port Manager — Release Sprint S0/S1 Handoff

**Date:** 2026-11-04
**Sprint / story IDs:** S0-01, S0-02, S0-03; S1-01, S1-02, S1-03, S1-04
**Baseline:** `main` / `7fe087dd9257c5ab1a350c83468cd794ec676525`
**Feature branch:** `feature/s1-process-identity-preview`
**Epic:** [#11](https://github.com/dev-rygar/port-manager/issues/11)
**M1.2 issue:** [#10](https://github.com/dev-rygar/port-manager/issues/10)

## Scope and safety gate

This increment implements a read-only observed-listener and impact-preview slice. The main process derives the candidate from a fresh TCP snapshot and complete process metadata; the renderer cannot supply an adapter, snapshot, PID, deadline, or policy override. The preview token is opaque, short-lived, one-time, document-bound, superseded per trusted document, and globally bounded. Parent/child data, when available, is informational only. S1 does not claim Windows-handle-verified process-instance identity.

`DESTRUCTIVE_ACTIONS_ENABLED` remains `false`. No stop/execute IPC was added, no `taskkill` path is reachable from the new preview workflow, and no process termination test, elevation, or Windows configuration change was performed.

## S0 baseline verification

| Check | Expected | Observed | Evidence |
| --- | --- | --- | --- |
| Repository and branch | Verified before implementation | Local work began on `integration/m0-m1.1-port-conflict`; dedicated branch was created from verified `origin/main` | Git status/rev-parse output |
| Baseline commit | `7fe087dd9257c5ab1a350c83468cd794ec676525` | Exact match for `origin/main`; current branch was an ancestor before the feature branch was created | `git rev-parse origin/main` |
| Working tree | No tracked changes silently overwritten | Only two pre-existing untracked Windows reports; preserved and excluded | `git status --short` |
| Roadmap | Read without merging docs branch | Complete `docs/RELEASE_SPRINT_PLAN.md` read from `origin/docs/phase3-architecture-roadmap` | fetched ref |
| Existing gates | Record, do not reinterpret | M1.2, native Windows evidence, PR #1/#2/#3 documentation integration, and release remain open | Epic #11, Issue #10, tracker |

Baseline commands on `origin/main` completed before implementation:

- `npm.cmd run check:syntax` — PASS
- `npm.cmd test` — 80 tests: 64 pass, 0 fail, 16 TODO
- `git diff --check` — PASS

## S1 implementation

### Changed files

- `main.js` — registers read-only `ports:preview` and `ports:authorize-preview`; constructs sanitized requests and trusted-window binding.
- `preload.js` — exposes `previewImpact` and `authorizePreview` without exposing Node or service dependencies.
- `package.json` — includes `processPreviewService.js` in syntax checks.
- `src/services/processPreviewService.js` — testable Windows adapter boundary, exact endpoint matching, observed metadata correlation, protected/ambiguous/unknown refusal, affected-listener preview, informational relationships, bounded document-bound preview store, supersession, expiry and replay checks.
- `main.js` — main-owned document epoch invalidation on top-level navigation/reload and window destruction.
- `docs/S1_PROCESS_IDENTITY_PREVIEW_DESIGN.md` — observed-identity, token-binding, Windows-rights and limitation design note.
- `src/renderer/index.html` — adds a disabled-by-default read-only impact-preview control and live result region.
- `src/renderer/app.js` — requests a preview for the selected observed endpoint and renders affected listeners without offering a stop action.
- `test/main-ipc-baseline.test.js` — verifies preview IPC whitelisting, trusted binding, malformed payload refusal, same-URL reload invalidation and window-destruction invalidation.
- `test/process-preview.test.js` — verifies observed identity, exact endpoint matching, observation mismatch, impact, authorization, expiry, replay, supersession, bounded storage, protected/PID-0, partial metadata, ambiguity, and discovery-failure behavior.
- `test/renderer-baseline.test.js` — verifies the read-only impact preview renders affected endpoints, retains the disabled stopping message, and rejects delayed responses from stale selections/refreshes.
- `docs/test-results/RELEASE_SPRINT_S0_S1_HANDOFF.md` — this evidence report.

### Expected versus observed behavior

| Story | Happy-path expected | Observed | Unhappy/stale/permission expected | Observed |
| --- | --- | --- | --- | --- |
| S1-01 | Fresh listener + complete metadata yields observed PID, process metadata, endpoint and process path | PASS in injected adapter tests; `observedIdentity` is retained with explicit non-handle-verified status and endpoint tuple | Missing/partial metadata, creation time, or changed observation is unverifiable | PASS: non-actionable `refused`/`uncertain`, no token |
| S1-02 | Preview lists every current TCP listener for the observed PID and selected endpoint | PASS: two same-PID listener endpoints are returned; `TIME_WAIT`/PID 0 is excluded | Different possible owners are not collapsed into one target | PASS: `refused` as ambiguous |
| S1-03 | Trusted document receives opaque short-lived one-time handle | PASS: token returned, bound to document epoch, expires, is superseded by a newer preview, and is consumed once | Cross-window, cross-document, replayed, expired, malformed or substituted payload is stale/rejected | PASS in service and IPC/lifecycle tests |
| S1-04 | Ordinary complete metadata can be previewed for later review only | PASS: preview is non-actionable and explicitly says stopping is disabled | PID 0, PID 4, protected names, unknown/partial metadata, and failed discovery fail closed | PASS: refusal/uncertain states with no stop path |

## PR #12 review remediation

The remediation adds renderer request/selection generations, document-epoch lifecycle invalidation, exact endpoint matching, observation-mismatch refusal, bounded and superseding preview tokens, and labels that distinguish observed metadata from handle-verified identity. Destructive operations remain disabled.

## Backend in-flight preview race remediation — 2026-11-05

A per-binding request generation is now assigned at the **start** of each validated preview request. Newer requests immediately revoke previously issued tokens for their document. Earlier in-flight requests return `stalePreview` after asynchronous work rather than superseding tokens from newer requests. Document reload/closure invalidation advances a separate service-wide lifecycle generation, preventing requests started before invalidation from minting tokens later. The global token bound and single-use authorization remain intact.

New non-destructive regression tests cover (1) an old metadata request finishing after a newer successful preview, (2) a pending snapshot finishing after document invalidation, and (3) a newer failed request revoking an existing token before its own response. No actual OS process was stopped.

**Validation for this new commit:** GitHub CI pending; the previous verified baseline at `d0ba563` was **99 total / 83 passing / 16 TODO / 0 failing**. Do not claim the newly added tests passed until its own GitHub run completes.

## Validation

Previous PR #12 local validation (before this backend race remediation):

- `npm.cmd run check:syntax` — PASS
- `npm.cmd test` — PASS: 99 tests, 83 pass, 0 fail, 16 TODO
- `git diff --check` — PASS

All automated service, IPC, and renderer tests use mocks/in-memory DOMs. They do not prove native Windows identity or termination safety.

## Windows and release status

**Native Windows status: BLOCKED / NOT RUN for this increment.** No real listener/process termination test was performed. Existing Windows WT-01–WT-03 evidence remains inconclusive/blocked as recorded by the tracker. Mocked tests must not be promoted to Windows acceptance.

Remaining blockers:

- S2 handle-bound stop and immediate revalidation are not implemented.
- No same-handle Windows process creation-time verification or independent post-stop process/port verification exists.
- Destructive actions remain disabled and require separate review/authorization; no release or Phase 2/Issue #7 completion is claimed.
- The default read-only adapter conservatively refuses the current Electron process and matching executable path; reliable descendant ancestry still requires a future reviewed relationship adapter and is not used to authorize a stop.
- Native Windows permission, process identity, address-family and packaging validation remain open.

**Review verdict:** READY FOR S1 RE-REVIEW for this non-destructive remediation, not merge approval and not release approval.

**Next unblocked story:** S1 re-review; after the preview contract is accepted, S2 mocked handle-bound stop/revalidation design can proceed with the feature gate still off. If S1 review blocks, S5 remains an independent non-destructive option.

**Approval required before proceeding:** independent review of the identity/preview contract; separate explicit approval is required before any real termination test, feature-gate activation, merge, or release.

Pre-existing untracked files preserved and intentionally excluded from the feature branch:

- `docs/test-results/WINDOWS_PHASE2_FOLLOWUP_WT01-WT03.md`
- `docs/test-results/WINDOWS_PHASE2_INITIAL_WT01-WT03_2026-10-31.md`

# Port Manager — Release Sprint S0/S1 Handoff

**Date:** 2026-11-04
**Sprint / story IDs:** S0-01, S0-02, S0-03; S1-01, S1-02, S1-03, S1-04
**Baseline:** `main` / `7fe087dd9257c5ab1a350c83468cd794ec676525`
**Feature branch:** `feature/s1-process-identity-preview`
**Epic:** [#11](https://github.com/dev-rygar/port-manager/issues/11)
**M1.2 issue:** [#10](https://github.com/dev-rygar/port-manager/issues/10)

## Scope and safety gate

This increment implements a read-only process-instance identity and impact-preview slice. The main process derives ownership from a fresh TCP snapshot and complete process metadata; the renderer cannot supply an adapter, snapshot, PID, deadline, or policy override. The preview token is opaque, short-lived, one-time, and bound to the trusted window/session. Parent/child data, when available, is informational only.

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
- `src/services/processPreviewService.js` — testable Windows adapter boundary, exact endpoint matching, creation-time identity, protected/ambiguous/unknown refusal, affected-listener preview, informational relationships, opaque one-time preview store, expiry and binding checks.
- `docs/S1_PROCESS_IDENTITY_PREVIEW_DESIGN.md` — identity, token-binding, Windows-rights and limitation design note.
- `src/renderer/index.html` — adds a disabled-by-default read-only impact-preview control and live result region.
- `src/renderer/app.js` — requests a preview for the selected verified endpoint and renders affected listeners without offering a stop action.
- `test/main-ipc-baseline.test.js` — verifies preview IPC whitelisting, trusted binding, and malformed payload refusal.
- `test/process-preview.test.js` — verifies S1 identity, impact, authorization, expiry, replay, protected/PID-0, partial metadata, ambiguity, and discovery-failure behavior.
- `test/renderer-baseline.test.js` — verifies the read-only impact preview renders affected endpoints and retains the disabled stopping message.
- `docs/test-results/RELEASE_SPRINT_S0_S1_HANDOFF.md` — this evidence report.

### Expected versus observed behavior

| Story | Happy-path expected | Observed | Unhappy/stale/permission expected | Observed |
| --- | --- | --- | --- | --- |
| S1-01 | Fresh listener + complete metadata yields PID, creation identity, endpoint and process path | PASS in injected adapter tests; identity is `{ pid, creationTime }` and endpoint tuple is retained | Missing/partial metadata or creation time is unverifiable | PASS: non-actionable `refused`, no token |
| S1-02 | Preview lists every current TCP listener for the verified PID and selected endpoint | PASS: two same-PID listener endpoints are returned; `TIME_WAIT`/PID 0 is excluded | Different possible owners are not collapsed into one target | PASS: `refused` as ambiguous |
| S1-03 | Trusted window receives opaque short-lived one-time handle | PASS: token returned, bound, expires, and is consumed once | Cross-window, replayed, expired, malformed or substituted payload is stale/rejected | PASS in service and IPC tests |
| S1-04 | Ordinary complete metadata can be previewed for later review only | PASS: preview is non-actionable and explicitly says stopping is disabled | PID 0, PID 4, protected names, unknown/partial metadata, and failed discovery fail closed | PASS: refusal/uncertain states with no stop path |

## Validation

Final local validation for this increment:

- `npm.cmd run check:syntax` — PASS
- `npm.cmd test` — PASS: 90 tests, 74 pass, 0 fail, 16 TODO
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

**Review verdict:** READY FOR INDEPENDENT REVIEW for this non-destructive S0/S1 increment, not merge approval and not release approval.

**Next unblocked story:** S1 independent engineering review; after the preview contract is accepted, S2 mocked handle-bound stop/revalidation design can proceed with the feature gate still off. If S1 review blocks, S5 remains an independent non-destructive option.

**Approval required before proceeding:** independent review of the identity/preview contract; separate explicit approval is required before any real termination test, feature-gate activation, merge, or release.

Pre-existing untracked files preserved and intentionally excluded from the feature branch:

- `docs/test-results/WINDOWS_PHASE2_FOLLOWUP_WT01-WT03.md`
- `docs/test-results/WINDOWS_PHASE2_INITIAL_WT01-WT03_2026-10-31.md`

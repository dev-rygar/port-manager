# WT-01–WT-03 — Windows Initial + Follow-up Results (Reported Summary and Triage)

**Date reported:** 2026-10-31 (Asia/Manila); follow-up diagnosis received on the same date
**Evidence status:** Summary reported by project owner from local Codex-assisted Windows audit. The full local report and terminal outputs were **not accessible to this GitHub audit update**.
**Original local reports:** `WINDOWS_PHASE2_INITIAL_WT01-WT03_2026-10-31.md` and `WINDOWS_PHASE2_FOLLOWUP_WT01-WT03.md` (local-only, not copied/uploaded or independently reviewed here).
**Repository commit actually tested:** **Not yet verified from source report**.
**Application code changed during local testing:** No (per project owner's report).
**Processes terminated:** No existing processes; no destructive process operations reported.

> **Scope and credibility:** This file is a triage record, **not** a replacement for the author's original test report or independent verification of its logs. Items below retain owner-reported PASS/FAIL/NOT IMPLEMENTED labels until the actual report, exact command output, environment, and tested commit are reviewed. Do not declare the whole Phase 2 audit complete.

## 1. Reported outcomes

| ID | Owner-reported result | Evidence summarized by owner | Triage status |
| --- | --- | --- | --- |
| WT-01 | **FAIL / BLOCKED** | WMIC absent. CIM and Get-NetTCPConnection present but returned `Access denied` in non-elevated Codex session. | **Availability confirmed per owner; permission context unresolved; rerun.** |
| WT-02 | **FAIL / BLOCKED** | `netstat` matched test listener; `tasklist` fallback returned `ERROR: Access denied`; the app swallowed the error and mapped missing metadata to `Unknown`. | **Failure chain established by owner; fix error handling and metadata strategy, rerun.** |
| WT-03 | **NOT IMPLEMENTED / BLOCKED** | Some PID/name/path details inspectable; process creation identity, parent PID, descendants, command line not implemented. | **Feature gap and blocked runtime validation; implement, rerun.** |

**Clarification:** WMIC absence is a compatibility fact for the test environment; it is **not evidence that supported Windows metadata APIs are universally unavailable**. An access-denied result needs scope and privilege details to identify whether Windows itself, endpoint policy, the test account, or the Codex terminal/sandbox blocked the operation. `netstat` returning a correct PID is evidence that *one sample* of listener discovery worked, not the complete discovery stack.

## 2. Root-cause diagnosis and remaining unknowns

- [PM-A10 — WMIC dependency and tasklist fallback](../ENGINEERING_AUDIT.md): The current `getProcessInfo()` uses `wmic process get ...`; if it fails, falls back to `tasklist /fo csv /nh`. This fallback can lose path and command line and can fail on access or output-format issues.
- [PM-A06 — misleading application-name fallback](../ENGINEERING_AUDIT.md): Port-category hints must not substitute for verified process identity.
- [PM-A18 — missing process metadata and relationships](../ENGINEERING_AUDIT.md): Creation time, parent PID, descendants, command-line fields have no complete production data model.
- [Architecture](https://github.com/dev-rygar/port-manager/pull/3): The concrete Windows discovery adapter is intentionally provisional pending empirical permission and performance evidence.

### Follow-up findings (confirmed by owner/Codex report, not independently log-reviewed)

1. WMIC is missing on this Windows environment, so the existing WMIC-first metadata path cannot succeed.
2. The `tasklist /fo csv /nh` fallback was invoked but returned **`ERROR: Access denied`**. The service catches this error, silently returns an empty metadata map, and `getPorts()` fills in **`processName: Unknown`**.
3. `netstat` nevertheless successfully identified the disposable listener's port/address/PID. Listener detection and owning-process *metadata enrichment* fail at different stages.
4. CIM and `Get-NetTCPConnection` are installed but returned access denied **inside the non-elevated Codex session**. Their status in an ordinary non-elevated shell and supported Windows environments remains unresolved.
5. PowerShell execution policy affected `npm.ps1` only, **not** the process metadata failures. Avoid changes to system-wide execution policy as a purported fix.

**Actionable code defect:** The fallback catches `tasklist` errors without exposing them, so users see an unexplained `Unknown` process instead of an explicit metadata-unavailable/access-denied state. **Do not infer universal API incompatibility or that elevation is required.**

## 3. Safe read-only recheck recommended

First run these commands in a **normal, non-elevated PowerShell window outside the Codex execution environment**, then (if permitted) compare with Codex's original environment. No administration/elevation or system changes are required.

```powershell
# Confirm command availability and ordinary PowerShell host details
$PSVersionTable.PSVersion
Get-Command wmic, netstat, tasklist -ErrorAction SilentlyContinue | Select-Object Name, Source

# Test the current PowerShell host's PID only; do not dump unrelated processes
Get-Process -Id $PID -ErrorAction Stop | Select-Object Id, ProcessName, StartTime
Get-CimInstance Win32_Process -Filter "ProcessId = $PID" -ErrorAction Stop |
  Select-Object ProcessId, Name, ParentProcessId, CreationDate

# Read-only listener probe; avoid copying unrelated process details into published logs
Get-NetTCPConnection -State Listen -ErrorAction Stop |
  Select-Object -First 5 LocalAddress, LocalPort, OwningProcess
```

During a **fresh disposable listener session**, capture only the test PID/port plus the following, with sensitive fields redacted:

```powershell
# Replace the sample number with the disposable listener's saved PID
$testPid = 12345
tasklist /FI "PID eq $testPid" /FO CSV /NH
Get-Process -Id $testPid -ErrorAction SilentlyContinue | Select-Object Id, ProcessName
netstat -ano -p tcp | Select-String ":<TEST_PORT>"
```

**Important:** Replacing `<TEST_PORT>` in the last command with the actual test port is required. Do not execute commands that stop or modify arbitrary existing processes. If permission is denied, retain sanitized command name, error category, and whether the shell was Codex-managed or an ordinary terminal.

## 3.1 Ordinary PowerShell diagnostic — 2026-10-31

**Evidence:** The owner pasted direct terminal output from a **normal PowerShell session outside Codex**. Test command was `tasklist /FI "PID eq $myPid" /FO CSV /NH` with `$myPid = $PID`.

- **Observed:** `Get-Process -Id $myPid` identified `powershell` and PID `20000`; `tasklist` returned `"powershell.exe","20000","Console","1","108,660 K"`.
- **Interpretation:** `tasklist` and the native PowerShell process query **succeeded without elevation for this own-process example**. The earlier Codex-session tasklist access denial does not imply tasklist is unavailable or universally requires admin rights.
- **Still inconclusive:** The pasted combined command output did not clearly display CIM or `Get-NetTCPConnection` results; mixed formatting of multiple selections is a plausible cause. Do not mark either API as passing or failing outside Codex yet. Run each separately with explicit `-ErrorAction Stop` and `Format-List | Out-String`.
- **Not yet tested:** The disposable listener's metadata through an actual packaged Electron app in a normal desktop context.
- **Privacy:** Report preserves only the test process's own PID and name, not personal paths or unrelated process details.

**Assessment:** `tasklist` works for the ordinary shell's own PID but was denied in Codex. Do not equate this with an identified Codex sandbox mechanism. Keep WT-01/WT-02 FAIL / BLOCKED pending a controlled retest of the full application.

### Ordinary PowerShell — independently formatted diagnostics

**Evidence supplied directly by owner on 2026-10-31:** The two separate read-only commands returned explicit exception messages in the same non-elevated PowerShell terminal *outside Codex*:

```text
=== CIM TEST ===
CIM ERROR: Access denied

=== NETWORK TEST ===
NETWORK ERROR: Access denied
```

- `Get-CimInstance Win32_Process -Filter "ProcessId = $PID" -ErrorAction Stop` was **blocked by Access denied**, even when querying the invoking PowerShell process. The cmdlet exists; syntax/execution-policy absence is not the failure.
- `Get-NetTCPConnection -State Listen -ErrorAction Stop` was **blocked by Access denied** in the same ordinary terminal. The cmdlet exists.
- Thus, **CIM and NetTCP are not viable as required dependencies under the tested user's current non-elevated permission environment**. This does **not** prove they fail on all Windows configurations, nor identify the exact security policy/ACL causing denial.
- `tasklist` and `Get-Process` previously succeeded for the shell PID in that same terminal, but that does not prove the **Electron application** can query all other users' or service processes.
- Nothing was modified and no process was terminated. This was a read-only diagnostic.

**Engineering implication:** Design **best-effort, least-privilege metadata adapters** with explicit permission/command-unavailable errors; retain working `netstat` PID-only listener data while marking process identity as unavailable/uncertain; never authorize a stop based solely on PID, guessed port-service label, or stale process name. No blanket elevation or change to execution policy is justified by these findings.



## 4. Next engineering and test actions

- [ ] Attach or share a **sanitized copy of the original local report** so its OS build, tested commit, command outputs, and error contexts can be reviewed. The local Windows path itself is not accessible from this conversation.
- [x] Recheck CIM and NetTCP permissions in ordinary non-elevated PowerShell: both explicitly returned `Access denied` (owner's pasted output, 2026-10-31).
- [x] Establish the metadata failure chain in Codex's reported follow-up: WMIC absent → tasklist access denied → error swallowed → empty map → `Unknown` process. **Original terminal evidence still needs review.**
- [ ] Add explicit typed diagnostics for access-denied, command missing and missing-process metadata; stop silently swallowing fallback errors.
- [ ] Evaluate supported, least-privilege process metadata sources on this tested Windows build. Do **not** fix by requiring blanket elevation.
- [ ] Select and implement a structured, injectable Windows process/discovery adapter with precise error reporting (M2), and tests for missing WMIC, access denied, absent process, malformed data.
- [ ] Implement process-instance identity and stop preview/revalidation/verification safeguards (M1.2) before any real termination tests.
- [ ] Rerun WT-01–WT-03 after compatibility fixes; keep current FAIL/NOT IMPLEMENTED labels until evidence supports different outcomes.
- [ ] Perform WT-04–WT-06 only with test-only processes **after** relevant safety mechanisms are present and reviewed.

## 5. Release gate and handoff

**Phase 2 remains open.** WT-01 and WT-02 were attempted and remain **FAIL / BLOCKED** in the reported environment; WT-03 remains **NOT IMPLEMENTED / BLOCKED**. Other WT-04–WT-12 activities remain deferred. Neither this summary nor later code changes prove production readiness. No application code was modified to record these findings.

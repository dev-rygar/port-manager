# WT-01–WT-03 — Initial Windows Results (Reported Summary and Triage)

**Date reported:** 2026-10-31 (Asia/Manila)
**Evidence status:** Summary reported by project owner from local Codex-assisted Windows audit. The full local report and terminal outputs were **not accessible to this GitHub audit update**.
**Original local report filename:** `WINDOWS_PHASE2_INITIAL_WT01-WT03_2026-10-31.md` (not copied, uploaded, or verified).
**Repository commit actually tested:** **Not yet verified from source report**.
**Application code changed during local testing:** No (per project owner's report).
**Processes terminated:** No existing processes; no destructive process operations reported.

> **Scope and credibility:** This file is a triage record, **not** a replacement for the author's original test report or independent verification of its logs. Items below retain owner-reported PASS/FAIL/NOT IMPLEMENTED labels until the actual report, exact command output, environment, and tested commit are reviewed. Do not declare the whole Phase 2 audit complete.

## 1. Reported outcomes

| ID | Owner-reported result | Evidence summarized by owner | Triage status |
| --- | --- | --- | --- |
| WT-01 | **FAIL** | WMIC unavailable. `Get-CimInstance` / `Get-NetTCPConnection` attempts returned `Access denied`. | **Investigate execution context and API availability; rerun.** |
| WT-02 | **FAIL** | `netstat` matched the temporary listener's port, local address, and PID; Port Manager displayed owning process name as `Unknown`. | **Reproduce and diagnose metadata lookup/fallback; rerun.** |
| WT-03 | **NOT IMPLEMENTED** | PID/name/path partly inspectable; process creation identity, parent PID, descendants, and command-line information not implemented in app. | **Feature gap; implement and verify later.** |

**Clarification:** WMIC absence is a compatibility fact for the test environment; it is **not evidence that supported Windows metadata APIs are universally unavailable**. An access-denied result needs scope and privilege details to identify whether Windows itself, endpoint policy, the test account, or the Codex terminal/sandbox blocked the operation. `netstat` returning a correct PID is evidence that *one sample* of listener discovery worked, not the complete discovery stack.

## 2. Likely relevant source paths (not yet proven root cause)

- [PM-A10 — WMIC dependency and tasklist fallback](../ENGINEERING_AUDIT.md): The current `getProcessInfo()` uses `wmic process get ...`; if it fails, falls back to `tasklist /fo csv /nh`. This fallback can lose path and command line and can fail on access or output-format issues.
- [PM-A06 — misleading application-name fallback](../ENGINEERING_AUDIT.md): Port-category hints must not substitute for verified process identity.
- [PM-A18 — missing process metadata and relationships](../ENGINEERING_AUDIT.md): Creation time, parent PID, descendants, command-line fields have no complete production data model.
- [Architecture](https://github.com/dev-rygar/port-manager/pull/3): The concrete Windows discovery adapter is intentionally provisional pending empirical permission and performance evidence.

### Current hypotheses — confirm before fixing

1. **WMIC-first strategy fails** because WMIC is absent; the fallback was denied, gave incomplete data, or its output did not match the app's CSV parser.
2. **Permissions are environment-dependent.** `Get-NetTCPConnection` and `Get-CimInstance` may be denied by a restricted Codex terminal, application policy, or Windows account; compare with an ordinary, non-elevated PowerShell launched directly by the user.
3. **Transient PID mismatch or process lifecycle race** is possible if the server exited between the netstat snapshot and process metadata lookup.

Do not assume which hypothesis is true until the full report/logs are inspected.

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

## 4. Next engineering and test actions

- [ ] Attach or share a **sanitized copy of the original local report** so its OS build, tested commit, command outputs, and error contexts can be reviewed. The local Windows path itself is not accessible from this conversation.
- [ ] Recheck CIM and NetTCP permissions in ordinary non-elevated PowerShell versus the original Codex execution context.
- [ ] Reproduce the known `Unknown` process-name result with an explicit disposable PID and sanitized `tasklist`/`netstat` output; record whether WMIC fallback was attempted and why it failed.
- [ ] Evaluate supported, least-privilege process metadata sources on this tested Windows build. Do **not** fix by requiring blanket elevation.
- [ ] Select and implement a structured, injectable Windows process/discovery adapter with precise error reporting (M2), and tests for missing WMIC, access denied, absent process, malformed data.
- [ ] Implement process-instance identity and stop preview/revalidation/verification safeguards (M1.2) before any real termination tests.
- [ ] Rerun WT-01–WT-03 after compatibility fixes; keep current FAIL/NOT IMPLEMENTED labels until evidence supports different outcomes.
- [ ] Perform WT-04–WT-06 only with test-only processes **after** relevant safety mechanisms are present and reviewed.

## 5. Release gate and handoff

**Phase 2 remains open.** WT-01 and WT-02 were attempted and failed in the reported environment; WT-03 was identified as not implemented. Other WT-04–WT-12 activities remain deferred. Neither this summary nor later code changes prove production readiness. No application code was modified to record these findings.

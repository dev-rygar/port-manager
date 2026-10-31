# Windows Process-Discovery Improvement — WT-01–WT-03 Follow-up

**Date:** 2026-10-31 (Asia/Manila)
**Branch:** `feature/windows-process-discovery`
**Base commit:** `e4a1585cb7755c24a04140834d92d9a3754d28ee`
**Scope:** Non-destructive discovery only. Termination code and termination tests were not changed or executed.

## Implementation

- `netstat.exe -ano` remains the authoritative listener/address/port/PID source.
- WMIC and CIM are no longer required for discovery metadata.
- Each unique listener PID is first queried through shell-free `execFile` to `powershell.exe` using `Get-Process -Id`.
- If that lookup is unavailable or denied, one `tasklist.exe /fo csv /nh` fallback is attempted for unresolved PIDs.
- Metadata failures are returned on the listener row instead of being swallowed:
  - `available`
  - `partial`
  - `permission-denied`
  - `command-unavailable`
  - `process-exited`
  - `unavailable`
- `applicationName` is derived only from process metadata. Port-reference labels remain in `portService` and are not presented as verified process identity.
- `Get-Process` can return creation/start time when available; tasklist fallback is explicitly name-only.
- Metadata status is shown in the process-details panel, including permission-denied, missing-tool, exited, and partial states.
- Metadata lookup is limited to 64 unique PIDs per refresh and product-name lookups are deduplicated by executable path.

## Safety and limitations

- No process is terminated by discovery. `killProcess` remains unchanged.
- `Get-Process` is best effort and may fail for protected, foreign-user, exited, or otherwise inaccessible PIDs.
- A successful metadata lookup is not an atomic process-instance identity guarantee; PID reuse and TOCTOU handling remain unimplemented.
- Parent PID, descendants, command line, protected-target policy, preview, revalidation, and post-stop verification remain outside this change.
- WMIC absence remains a compatibility finding; this change removes the application dependency rather than making WMIC available.
- CIM and `Get-NetTCPConnection` remain optional validation paths and are not required by the basic listener path.
- Product-name lookup from an executable path remains best effort; failure does not overwrite the structured metadata status.
- The live cross-process smoke topology in this Codex session did not expose the disposable listener to `netstat`; the temporary process was cleaned up. This is inconclusive environment evidence and needs a normal Windows retest.

## Tests added

`test/service-discovery.test.js` covers:

- successful `Get-Process` lookup with name/path/creation time;
- access denied from both metadata sources;
- missing PowerShell/tasklist tools;
- process-exited classification without an unnecessary fallback retry;
- tasklist name-only fallback;
- preservation of netstat listener data when metadata is denied;
- prevention of a port label such as `Dev server` becoming application identity.
- preservation of permission-denied status when tasklist returns no matching row;
- preservation of command-unavailable status when both metadata tools are missing.

Available checks run:

```text
npm.cmd run check:syntax  PASS
npm.cmd test             PASS — 8 tests, 0 failures
```

The live `Get-Process` adapter was also exercised against the current PowerShell PID and returned name, executable path, and creation time with `metadataStatus: available`. The controlled cross-process listener smoke test was inconclusive in this session because `netstat` did not expose the disposable listener to the separate probe process; that temporary process was cleaned up.

## WT retest matrix

| Test | Newly retestable scope | Remaining status |
| --- | --- | --- |
| WT-01 | Basic listener discovery no longer depends on WMIC/CIM; metadata command availability and permission states are observable | WMIC absence remains a compatibility finding; CIM/NetTCP access denial remains BLOCKED in this environment |
| WT-02 | Retest netstat listener/address/port/PID plus best-effort `Get-Process` metadata; verify explicit fallback statuses | Full supported-API cross-check remains BLOCKED; multiple-address fidelity and performance remain open |
| WT-03 | Retest PID/name/path/start-time when `Get-Process` permits them; verify partial/denied/exited output | Parent/child relationships, descendants, command line, and atomic process identity remain NOT IMPLEMENTED |

The next real Windows validation should use a disposable listener and compare `netstat` with the new row fields. It should not treat `available` metadata as proof that a later termination target is the same process instance.

# S1 Process-Instance Identity and Impact Preview Design

## Purpose

S1 adds a read-only preview boundary for M1.2. It does not stop a process, open a process handle, enable the destructive feature flag, or claim Windows acceptance.

## Identity contract

The selected target is derived in the main process from a fresh `netstat.exe -ano` TCP snapshot and a main-process metadata lookup. A preview is eligible only when all of the following are available in the same observation:

- positive Windows PID;
- exact TCP protocol, local address, address family and port tuple;
- process name and executable path;
- `metadataStatus === "available"`;
- a parseable process creation timestamp.

The identity carried by the preview is `{ pid, creationTime }`. PID, process labels, persistent port tags, renderer payloads and parent/child labels are not sufficient identity evidence. PID 0, PID 4, protected names, incomplete metadata, ambiguous ownership and discovery errors refuse or produce an uncertain non-actionable result.

## Preview and authorization

The main process returns every current `LISTENING` TCP endpoint sharing the verified PID. The selected endpoint is retained separately and is highlighted in the renderer output. Parent/child relationships are informational and never become implicit stop targets.

The main process creates a cryptographically random opaque token with a 30-second lifetime. It stores the exact target and endpoint set, binds the token to the trusted `webContents` ID, Electron session ID, top-level frame routing ID and local document URL, and consumes it once. Cross-window, cross-session, expired and replayed tokens are stale. No execution endpoint exists in this slice.

## Windows rights and limitations

The existing read-only adapter obtains process metadata through the repository's bounded PowerShell/Get-Process and tasklist discovery path. This may return permission-denied, command-unavailable, timeout or process-exited states; those states are preserved and cannot create a preview token. S1 also requires a non-empty process name and executable path rather than trusting a status label alone.

S1 does not yet select or implement the OS-backed termination mechanism. S1 conservatively refuses the current Electron process and a target using the same executable path; S2 must add a reviewed Windows relationship source for reliable parent/descendant ancestry. S2 must also choose and review a same-handle Windows strategy that obtains the target process handle, verifies creation identity on that handle, checks rights without silent elevation, closes handles on every path, and independently verifies both process outcome and requested TCP occupancy. Until those pieces are reviewed and validated on Windows, all destructive actions remain disabled.

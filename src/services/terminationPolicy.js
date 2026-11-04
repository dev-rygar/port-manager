'use strict';

// Destructive process actions stay disabled until M1.2 can authorize a stable
// process instance across preview, revalidation, execution, and verification.
const DESTRUCTIVE_ACTIONS_ENABLED = false;

function assertDestructiveActionsEnabled() {
  if (!DESTRUCTIVE_ACTIONS_ENABLED) {
    throw new Error('Process termination is disabled until M1.2 process-instance authorization is implemented');
  }
}

// Conservative first-line guardrails. This is NOT a comprehensive Windows
// protected-process policy, nor does passing it prove an arbitrary process safe.
const PROTECTED_PROCESS_NAMES = new Set([
  'system', 'system idle process', 'registry',
  'smss.exe', 'csrss.exe', 'wininit.exe', 'winlogon.exe',
  'lsass.exe', 'lsaiso.exe', 'services.exe', 'svchost.exe',
  'dwm.exe', 'sihost.exe', 'fontdrvhost.exe',
  'explorer.exe', 'runtimebroker.exe', 'searchhost.exe',
  'startmenuexperiencehost.exe', 'wmiPrvSE.exe'.toLowerCase(),
  'spoolsv.exe', 'conhost.exe',
]);

// Windows process IDs are unsigned 32-bit integers. Do not use parseInt:
// "123abc", "1e2", fractional values, and negative values must be rejected.
function parseProcessId(value) {
  if (typeof value !== 'number' && typeof value !== 'string') {
    throw new Error('Invalid PID');
  }
  if (typeof value === 'string' && !/^[1-9][0-9]*$/.test(value)) {
    throw new Error('Invalid PID');
  }

  const pid = Number(value);
  if (!Number.isSafeInteger(pid) || pid < 1 || pid > 0xFFFFFFFF) {
    throw new Error('Invalid PID');
  }
  return pid;
}

function normalizeProcessName(value) {
  if (typeof value !== 'string') return '';
  return value.trim().split(/[\\/]/).pop().trim().toLowerCase();
}

function assertProcessCanBeStopped({ pid, processName, ownsListeningPort, metadataStatus, creationTime }) {
  const id = parseProcessId(pid);

  // Known critical PID on Windows, reject before any OS command is issued.
  if (id === 4) throw new Error('Protected Windows process');

  // The action was requested from the port UI. Without current ownership
  // this is stale and must not terminate an unrelated process.
  if (!ownsListeningPort) {
    throw new Error('Process no longer owns a detected listening port; refresh and try again');
  }

  if (metadataStatus !== undefined && metadataStatus !== 'available') {
    throw new Error('Cannot verify complete process metadata; termination refused');
  }
  if (metadataStatus !== undefined && !creationTime) {
    throw new Error('Cannot verify process instance creation time; termination refused');
  }

  const name = normalizeProcessName(processName);
  if (!name || name === 'unknown' || name === '—') {
    throw new Error('Cannot verify process name; refusing to stop an unknown process');
  }
  if (PROTECTED_PROCESS_NAMES.has(name)) {
    throw new Error('Protected or system-managed process; termination refused');
  }
  return { pid: id, processName: name };
}

module.exports = {
  DESTRUCTIVE_ACTIONS_ENABLED,
  assertDestructiveActionsEnabled,
  parseProcessId,
  assertProcessCanBeStopped,
  normalizeProcessName,
};

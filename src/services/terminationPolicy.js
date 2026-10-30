'use strict';

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

function assertProcessCanBeStopped({ pid, processName, ownsListeningPort }) {
  const id = parseProcessId(pid);

  // Known critical PID on Windows, reject before any OS command is issued.
  if (id === 4) throw new Error('Protected Windows process');

  // The action was requested from the port UI. Without current ownership
  // this is stale and must not terminate an unrelated process.
  if (!ownsListeningPort) {
    throw new Error('Process no longer owns a detected listening port; refresh and try again');
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

module.exports = { parseProcessId, assertProcessCanBeStopped, normalizeProcessName };

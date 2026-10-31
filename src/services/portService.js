const { exec, execFile } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);
const { getPortInfo, getFriendlyProcessName, getFallbackAppName } = require('./portReference');

const MAX_METADATA_PIDS = 64;

/** Known executable -> app name mappings (fast path) */
const KNOWN_APPS = {
  'node.exe': 'Node.js',
  'chrome.exe': 'Google Chrome',
  'msedge.exe': 'Microsoft Edge',
  'firefox.exe': 'Mozilla Firefox',
  'code.exe': 'Visual Studio Code',
  'devenv.exe': 'Visual Studio',
  'sqlservr.exe': 'SQL Server',
  'mysqld.exe': 'MySQL',
  'mongod.exe': 'MongoDB',
  'postgres.exe': 'PostgreSQL',
  'java.exe': 'Java',
  'javaw.exe': 'Java',
};

/**
 * Run netstat -ano to get listening ports and their PIDs.
 * Filter for LISTENING state only.
 */
async function getNetstat(commandRunner = runCommand) {
  const { stdout } = await commandRunner('netstat.exe', ['-ano'], {
    encoding: 'utf8',
    windowsHide: true,
  });

  const lines = String(stdout || '').split('\n').filter(Boolean);
  const results = [];

  for (const line of lines) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 5) continue;

    const proto = parts[0];
    if (proto !== 'TCP' && proto !== 'UDP') continue;

    const localAddr = parts[1];
    const state = parts.length >= 5 ? parts[parts.length - 2] : '';
    const pid = parts[parts.length - 1];

    // Only include LISTENING for TCP, or all for UDP (no state)
    if (proto === 'TCP' && state !== 'LISTENING') continue;
    const parsedPid = parseListenerPid(pid);
    if (parsedPid === null) continue;

    const portMatch = localAddr.match(/:(\d+)$/);
    const port = portMatch ? portMatch[1] : null;
    if (!port) continue;

    results.push({
      protocol: proto,
      localAddress: localAddr,
      state: state || '-',
      pid: parsedPid,
      port: parseInt(port, 10),
    });
  }

  return results;
}

/** Run a Windows executable without a shell. */
function runCommand(file, args, options) {
  return execFileAsync(file, args, options);
}

function parseListenerPid(value) {
  if (!/^\d+$/.test(String(value))) return null;
  const pid = Number(value);
  if (!Number.isInteger(pid) || pid <= 0 || pid > 0xFFFFFFFF) return null;
  return pid;
}

function classifyMetadataError(error) {
  const text = [error?.message, error?.stderr, error?.stdout]
    .filter(Boolean)
    .join('\n')
    .toLowerCase();

  if (error?.code === 'ENOENT' || /not recognized|cannot find the path/.test(text)) {
    return 'command-unavailable';
  }
  if (/access is denied|access denied|unauthorized|0x80041003/.test(text)) {
    return 'permission-denied';
  }
  if (/cannot find a process|no process|process .*not found|does not exist/.test(text)) {
    return 'process-exited';
  }
  return 'unavailable';
}

function unavailableProcessInfo(status, source, error) {
  return {
    name: 'Unknown',
    path: '',
    creationTime: null,
    metadataStatus: status,
    metadataSource: source,
    metadataError: error || null,
  };
}

function normalizeProcessName(name) {
  const value = String(name || '').trim();
  if (!value) return '';
  return value.toLowerCase().endsWith('.exe') ? value : `${value}.exe`;
}

function parsePowerShellProcessInfo(stdout, pid) {
  const value = JSON.parse(String(stdout || '').trim());
  const name = normalizeProcessName(value.name);
  if (Number(value.id) !== pid || !name) {
    throw new Error('Process metadata missing');
  }

  const path = typeof value.path === 'string' ? value.path : '';
  return {
    name,
    path,
    creationTime: value.creationTime || null,
    metadataStatus: path ? 'available' : 'partial',
    metadataSource: 'Get-Process',
    metadataError: path ? null : 'Executable path unavailable',
  };
}

function parseTasklistCsv(stdout, wantedPids) {
  const wanted = new Set(wantedPids);
  const map = new Map();
  const lines = String(stdout || '').split(/\r?\n/).filter(Boolean);

  for (const line of lines) {
    const match = line.match(/^"([^"]+)","(\d+)"/);
    if (!match) continue;
    const pid = parseInt(match[2], 10);
    if (!wanted.has(pid)) continue;
    map.set(pid, {
      name: normalizeProcessName(match[1]),
      path: '',
      creationTime: null,
      metadataStatus: 'partial',
      metadataSource: 'tasklist',
      metadataError: 'Executable path unavailable',
    });
  }
  return map;
}

function getProcessCommand() {
  const script = [
    "$ErrorActionPreference='Stop'",
    '$targetPid=[int]$env:PORT_MANAGER_DISCOVERY_PID',
    '$p=Get-Process -Id $targetPid -ErrorAction Stop',
    '$path=$null; try { $path=$p.Path } catch {}',
    "$creationTime=$null; try { $creationTime=$p.StartTime.ToUniversalTime().ToString('o') } catch {}",
    '[pscustomobject]@{id=$p.Id;name=$p.ProcessName;path=$path;creationTime=$creationTime} | ConvertTo-Json -Compress',
  ].join(';');

  return ['-NoProfile', '-NonInteractive', '-Command', script];
}

/**
 * Get best-effort process metadata without WMIC or CIM.
 * Listener discovery remains independent: metadata failures produce an
 * explicit status for each PID rather than removing the listener row.
 */
async function getProcessInfo(pids, commandRunner = runCommand) {
  const uniquePids = [...new Set(pids)].filter(
    (pid) => Number.isInteger(pid) && pid > 0 && pid <= 0xFFFFFFFF
  );
  if (uniquePids.length === 0) return new Map();

  const map = new Map();
  const unresolved = [];
  const lookupPids = uniquePids.slice(0, MAX_METADATA_PIDS);

  for (const pid of uniquePids.slice(MAX_METADATA_PIDS)) {
    map.set(
      pid,
      unavailableProcessInfo(
        'unavailable',
        'metadata-limit',
        `Metadata lookup limit reached (${MAX_METADATA_PIDS} PIDs)`
      )
    );
  }

  for (const pid of lookupPids) {
    try {
      const { stdout } = await commandRunner(
        'powershell.exe',
        getProcessCommand(),
        {
          encoding: 'utf8',
          windowsHide: true,
          timeout: 3000,
          env: { ...process.env, PORT_MANAGER_DISCOVERY_PID: String(pid) },
        }
      );
      map.set(pid, parsePowerShellProcessInfo(stdout, pid));
    } catch (error) {
      const status = classifyMetadataError(error);
      if (status === 'process-exited') {
        map.set(pid, unavailableProcessInfo(status, 'Get-Process', error.message));
      } else {
        unresolved.push({ pid, status, error });
      }
    }
  }

  if (unresolved.length === 0) return map;

  try {
    const { stdout } = await commandRunner(
      'tasklist.exe',
      ['/fo', 'csv', '/nh'],
      { encoding: 'utf8', windowsHide: true, timeout: 3000 }
    );
    const tasklistMap = parseTasklistCsv(stdout, unresolved.map(({ pid }) => pid));

    for (const { pid, status, error: firstError } of unresolved) {
      map.set(
        pid,
        tasklistMap.get(pid) ||
          unavailableProcessInfo(
            status,
            'Get-Process/tasklist',
            `${firstError?.message || 'Primary metadata lookup failed'}; PID was not present in tasklist output`
          )
      );
    }
  } catch (error) {
    const fallbackStatus = classifyMetadataError(error);
    for (const { pid, status, error: firstError } of unresolved) {
      const finalStatus = fallbackStatus === 'permission-denied' ? 'permission-denied' : status;
      const message = [firstError?.message, error?.message].filter(Boolean).join('; ');
      map.set(pid, unavailableProcessInfo(finalStatus, 'Get-Process/tasklist', message));
    }
  }

  return map;
}

/**
 * Get friendly application name from executable path using PowerShell.
 * Falls back to process name if path is missing or lookup fails.
 */
async function getApplicationName(exePath, processName, commandRunner = runCommand) {
  const known = KNOWN_APPS[String(processName || '').toLowerCase()];
  if (known) return known;

  if (!exePath || !exePath.toLowerCase().endsWith('.exe')) return processName || 'Unknown process';

  try {
    const script = `$p='${exePath.replace(/'/g, "''")}';try{(Get-Item -LiteralPath $p -EA Stop).VersionInfo.ProductName}catch{''}`;
    const encoded = Buffer.from(script, 'utf16le').toString('base64');
    const { stdout } = await commandRunner(
      'powershell.exe',
      ['-NoProfile', '-EncodedCommand', encoded],
      { encoding: 'utf8', windowsHide: true, timeout: 3000 }
    );
    const name = stdout?.trim();
    return name || processName || 'Unknown process';
  } catch {
    return processName || 'Unknown process';
  }
}

/** Get all listening ports with best-effort process metadata. */
async function getPorts({ commandRunner = runCommand } = {}) {
  const netstatData = await getNetstat(commandRunner);
  const pids = netstatData.map((r) => r.pid);
  const processMap = await getProcessInfo(pids, commandRunner);

  const rows = netstatData.map((row) => {
    const info = processMap.get(row.pid) || unavailableProcessInfo('unavailable', 'metadata', 'No metadata result');
    return {
      ...row,
      processName: info.name,
      processPath: info.path,
      processCreationTime: info.creationTime,
      processMetadataStatus: info.metadataStatus,
      processMetadataSource: info.metadataSource,
      processMetadataError: info.metadataError,
    };
  });

  const appNamePromises = new Map();
  const appNames = await Promise.all(
    rows.map((r) => {
      const key = r.processPath || `name:${r.processName}`;
      if (!appNamePromises.has(key)) {
        appNamePromises.set(key, getApplicationName(r.processPath, r.processName, commandRunner));
      }
      return appNamePromises.get(key);
    })
  );

  const enriched = rows.map((r, i) => {
    const appName = appNames[i];
    const portInfo = getPortInfo(r.port);
    const friendlyProcess = getFriendlyProcessName(r.processName);

    // Resolve identity from process metadata only. Port labels are context, not identity.
    let applicationName = appName;
    if (r.processName === 'Unknown') {
      applicationName = 'Unknown process';
    } else if (!applicationName || applicationName === 'Unknown') {
      applicationName =
        getFallbackAppName(r.pid, r.processName) ||
        friendlyProcess ||
        r.processName ||
        'Unknown process';
    }

    return {
      ...r,
      applicationName,
      portType: portInfo.type,
      portService: portInfo.service,
      portDescription: portInfo.description,
    };
  });

  // Deduplicate: same port + protocol + PID (IPv4 and IPv6 often appear)
  const seen = new Map();
  for (const row of enriched) {
    const key = `${row.port}-${row.protocol}-${row.pid}`;
    if (seen.has(key)) {
      const existing = seen.get(key);
      if (!existing.localAddress.includes(row.localAddress)) {
        existing.localAddress += ', ' + row.localAddress;
      }
    } else {
      seen.set(key, { ...row });
    }
  }
  return Array.from(seen.values());
}

/**
 * Kill a process by PID using taskkill.
 * This path is intentionally unchanged by the discovery improvement.
 */
async function killProcess(pid) {
  const n = parseInt(pid, 10);
  if (!Number.isInteger(n) || n <= 0 || n >= 65536) {
    throw new Error('Invalid PID');
  }

  await execAsync(`taskkill /PID ${n} /F`, {
    encoding: 'utf8',
    windowsHide: true,
  });

  return { success: true, pid: n };
}

module.exports = {
  getPorts,
  getProcessInfo,
  parseListenerPid,
  classifyMetadataError,
  parseTasklistCsv,
  killProcess,
};

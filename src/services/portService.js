const { exec, execFile } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);
const { parseProcessId, assertProcessCanBeStopped } = require('./terminationPolicy');
const { getPortInfo, getFriendlyProcessName, getFallbackAppName } = require('./portReference');

/** Known executable → app name mappings (fast path) */
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
async function getNetstat() {
  const { stdout } = await execAsync('netstat -ano', {
    encoding: 'utf8',
    windowsHide: true,
  });

  const lines = stdout.split('\n').filter(Boolean);
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
    let parsedPid;
    try {
      parsedPid = parseProcessId(pid);
    } catch {
      continue;
    }

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

/**
 * Get process names and paths using WMIC (Windows Management Instrumentation).
 */
async function getProcessInfo(pids) {
  if (pids.length === 0) return new Map();

  try {
    const { stdout } = await execAsync(
      'wmic process get ProcessId,Name,ExecutablePath /format:list',
      { encoding: 'utf8', windowsHide: true }
    );

    const map = new Map();
    const blocks = stdout.split(/\r?\n\r?\n/).filter(Boolean);

    for (const block of blocks) {
      const lines = block.split(/\r?\n/);
      let pid, name = '', path = '';
      for (const line of lines) {
        const eq = line.indexOf('=');
        if (eq < 0) continue;
        const key = line.slice(0, eq).trim();
        const val = line.slice(eq + 1).trim();
        if (key === 'ProcessId') pid = parseInt(val, 10);
        else if (key === 'Name') name = val;
        else if (key === 'ExecutablePath') path = val;
      }
      if (!isNaN(pid) && pids.includes(pid)) {
        map.set(pid, { name: name || 'Unknown', path });
      }
    }

    return map;
  } catch {
    // Fallback: use tasklist for name only
    try {
      const { stdout } = await execAsync('tasklist /fo csv /nh', {
        encoding: 'utf8',
        windowsHide: true,
      });

      const map = new Map();
      const lines = stdout.split('\n').filter(Boolean);

      for (const line of lines) {
        const match = line.match(/^"([^"]+)","(\d+)"/);
        if (match) {
          const name = match[1];
          const pid = parseInt(match[2], 10);
          if (pids.includes(pid)) {
            map.set(pid, { name, path: '' });
          }
        }
      }
      return map;
    } catch {
      return new Map();
    }
  }
}

/**
 * Get friendly application name from executable path using PowerShell.
 * Falls back to process name if path is missing or lookup fails.
 */
async function getApplicationName(exePath, processName) {
  const known = KNOWN_APPS[processName];
  if (known) return known;

  if (!exePath || !exePath.endsWith('.exe')) return processName || '—';

  try {
    const script = `$p='${exePath.replace(/'/g, "''")}';try{(Get-Item -LiteralPath $p -EA Stop).VersionInfo.ProductName}catch{''}`;
    const encoded = Buffer.from(script, 'utf16le').toString('base64');
    const { stdout } = await execAsync(
      `powershell -NoProfile -EncodedCommand ${encoded}`,
      { encoding: 'utf8', windowsHide: true, timeout: 3000 }
    );
    const name = stdout?.trim();
    return name || processName || '—';
  } catch {
    return processName || '—';
  }
}

/**
 * Get all listening ports with process info.
 */
async function getPorts() {
  const netstatData = await getNetstat();
  const pids = netstatData.map((r) => r.pid);
  const processMap = await getProcessInfo(pids);

  const rows = netstatData.map((row) => {
    const info = processMap.get(row.pid) || { name: 'Unknown', path: '' };
    return {
      ...row,
      processName: info.name,
      processPath: info.path,
    };
  });

  // Resolve application names in parallel (batch for speed)
  const appNames = await Promise.all(
    rows.map((r) => getApplicationName(r.processPath, r.processName))
  );

  const enriched = rows.map((r, i) => {
    const appName = appNames[i];
    const portInfo = getPortInfo(r.port);
    const friendlyProcess = getFriendlyProcessName(r.processName);

    // Resolve application name: prefer ProductName, then PID fallback, port service, friendly process, process name
    let applicationName = appName;
    if (!applicationName || applicationName === 'Unknown' || applicationName === '—') {
      applicationName =
        getFallbackAppName(r.pid, r.processName) ||
        portInfo.service ||
        friendlyProcess ||
        r.processName ||
        '—';
    }

    return {
      ...r,
      applicationName,
      portType: portInfo.type,
      portService: portInfo.service,
      portDescription: portInfo.description,
    };
  });

  // Deduplicate: same port + protocol + PID (IPv4 and IPv6 often both appear)
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
 * Conservative, non-atomic safety checks before stopping a port-owning PID.
 * NOTE: This is NOT yet a PID-reuse-proof process identity contract. The
 * preview/revalidate/verify workflow will be implemented separately in M1/M2.
 */
async function killProcess(pid) {
  const id = parseProcessId(pid);

  // Block PID 4 without launching discovery or the termination executable.
  if (id === 4) throw new Error('Protected Windows process');

  // A stale PID absent from current listening sockets must never be targeted.
  const listeners = await getNetstat();
  const ownsListeningPort = listeners.some((row) => row.pid === id);

  // Fail closed when WMIC/tasklist cannot establish a usable process name.
  const processInfo = ownsListeningPort ? await getProcessInfo([id]) : new Map();
  assertProcessCanBeStopped({
    pid: id,
    processName: processInfo.get(id)?.name,
    ownsListeningPort,
  });

  // Shell interpolation is not necessary: send an argument array to taskkill.
  await execFileAsync('taskkill', ['/PID', String(id), '/F'], {
    encoding: 'utf8',
    windowsHide: true,
    timeout: 5000,
  });

  // taskkill success is NOT proof that the process exited or port is now free.
  return { success: true, pid: id };
}

module.exports = { getPorts, killProcess };

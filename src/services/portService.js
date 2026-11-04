'use strict';

const { execFile } = require('child_process');
const { promisify } = require('util');
const net = require('net');
const { parseProcessId, assertDestructiveActionsEnabled, assertProcessCanBeStopped } = require('./terminationPolicy');
const { getPortInfo, getFriendlyProcessName, getFallbackAppName } = require('./portReference');

const execFileAsync = promisify(execFile);
const DISCOVERY_DEADLINE_MS = 8000;
const NETSTAT_TIMEOUT_MS = 2000;
const METADATA_TIMEOUT_MS = 2500;
const MAX_METADATA_PIDS = 64;
const MAX_METADATA_CONCURRENCY = 4;

const KNOWN_APPS = {
  'node.exe': 'Node.js', 'chrome.exe': 'Google Chrome', 'msedge.exe': 'Microsoft Edge',
  'firefox.exe': 'Mozilla Firefox', 'code.exe': 'Visual Studio Code', 'devenv.exe': 'Visual Studio',
  'sqlservr.exe': 'SQL Server', 'mysqld.exe': 'MySQL', 'mongod.exe': 'MongoDB',
  'postgres.exe': 'PostgreSQL', 'java.exe': 'Java', 'javaw.exe': 'Java',
};

function runCommand(file, args, options = {}) {
  return execFileAsync(file, args, { windowsHide: true, ...options, shell: false });
}

function withTimeout(promise, timeoutMs, timeoutMessage) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(Object.assign(new Error(timeoutMessage || `Command timed out after ${timeoutMs}ms`), { code: 'ETIMEDOUT' })), Math.max(1, timeoutMs));
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function remainingBudget(deadlineAt) { return deadlineAt ? Math.max(0, deadlineAt - Date.now()) : Infinity; }

function parseListenerPid(value) {
  if (!/^\d+$/.test(String(value))) return null;
  const pid = Number(value);
  return Number.isInteger(pid) && pid > 0 && pid <= 0xFFFFFFFF ? pid : null;
}

function classifyMetadataError(error) {
  const text = [error?.message, error?.stderr, error?.stdout].filter(Boolean).join('\n').toLowerCase();
  if (error?.code === 'ETIMEDOUT' || /timed out|timeout/.test(text)) return 'timeout';
  if (error?.code === 'ENOENT' || /not recognized|cannot find the path/.test(text)) return 'command-unavailable';
  if (/access is denied|access denied|unauthorized|0x80041003/.test(text)) return 'permission-denied';
  if (/cannot find a process|no process|process .*not found|does not exist/.test(text)) return 'process-exited';
  return 'unavailable';
}

function unavailableProcessInfo(status, source, error) {
  return { name: 'Unknown', path: '', creationTime: null, metadataStatus: status, metadataSource: source, metadataError: error || null };
}

function normalizeProcessName(name) {
  const value = String(name || '').trim();
  if (!value) return '';
  const basename = value.split(/[\\/]/).pop();
  return basename.toLowerCase().endsWith('.exe') ? basename : `${basename}.exe`;
}

function parseEndpoint(value) {
  const text = String(value || '').trim();
  const bracketed = text.match(/^\[([^\]]+)\]:(\d+)$/);
  if (bracketed) return { host: bracketed[1], port: Number(bracketed[2]), family: net.isIP(bracketed[1]) };
  const match = text.match(/^(.+):(\d+)$/);
  if (!match) return null;
  return { host: match[1], port: Number(match[2]), family: net.isIP(match[1]) };
}

function parseNetstat(stdout, { listeningOnly = false } = {}) {
  const results = [];
  for (const rawLine of String(stdout || '').split(/\r?\n/)) {
    const parts = rawLine.trim().split(/\s+/);
    if (parts.length < 4) continue;
    const protocol = parts[0].toUpperCase();
    if (protocol !== 'TCP') continue;
    const local = parseEndpoint(parts[1]);
    if (!local || !local.port || !local.family) continue;
    const state = parts.length >= 5 ? parts[3].toUpperCase() : '';
    const ownerToken = parts[4];
    const parsedPid = parseListenerPid(ownerToken);
    const isUnknownOwner = parsedPid === null && (!ownerToken || ownerToken === '0');
    if (listeningOnly && (state !== 'LISTENING' || parsedPid === null)) continue;
    if (!listeningOnly && parsedPid === null && !isUnknownOwner) continue;
    results.push({ protocol, state: state || '-', localAddress: parts[1], localHost: local.host, addressFamily: local.family === 6 ? 'IPv6' : 'IPv4', port: local.port, pid: parsedPid === null ? 0 : parsedPid, ownerStatus: parsedPid === null ? 'unknown' : 'identified' });
  }
  return results;
}

async function getTcpSnapshot(commandRunner = runCommand, deadlineAt = Date.now() + NETSTAT_TIMEOUT_MS, signal) {
  const budget = Math.min(NETSTAT_TIMEOUT_MS, remainingBudget(deadlineAt));
  if (budget <= 0) throw Object.assign(new Error('Discovery deadline exceeded'), { code: 'ETIMEDOUT' });
  const result = await withTimeout(
    commandRunner('netstat.exe', ['-ano'], { encoding: 'utf8', timeout: budget, windowsHide: true, shell: false, signal }),
    budget,
    'netstat timed out'
  );
  return { entries: parseNetstat(result.stdout, { listeningOnly: false }), listeners: parseNetstat(result.stdout, { listeningOnly: true }), evidenceSource: 'netstat.exe -ano' };
}

async function getNetstat(commandRunner = runCommand) { return (await getTcpSnapshot(commandRunner)).listeners; }

function getProcessCommand() {
  const script = [
    "$ErrorActionPreference='Stop'", '$targetPid=[int]$env:PORT_MANAGER_DISCOVERY_PID',
    '$p=Get-Process -Id $targetPid -ErrorAction Stop', '$path=$null; try { $path=$p.Path } catch {}',
    "$creationTime=$null; try { $creationTime=$p.StartTime.ToUniversalTime().ToString('o') } catch {}",
    '[pscustomobject]@{id=$p.Id;name=$p.ProcessName;path=$path;creationTime=$creationTime} | ConvertTo-Json -Compress',
  ].join(';');
  return ['-NoProfile', '-NonInteractive', '-Command', script];
}

function parsePowerShellProcessInfo(stdout, pid) {
  const value = JSON.parse(String(stdout || '').trim());
  const name = normalizeProcessName(value.name);
  if (Number(value.id) !== pid || !name) throw new Error('Process metadata missing');
  const path = typeof value.path === 'string' ? value.path : '';
  return { name, path, creationTime: value.creationTime || null, metadataStatus: path ? 'available' : 'partial', metadataSource: 'Get-Process', metadataError: path ? null : 'Executable path unavailable' };
}

function parseTasklistCsv(stdout, wantedPids) {
  const wanted = new Set(wantedPids); const map = new Map();
  for (const line of String(stdout || '').split(/\r?\n/).filter(Boolean)) {
    const match = line.match(/^"([^"]+)","(\d+)"/); if (!match) continue;
    const pid = Number(match[2]); if (!wanted.has(pid)) continue;
    map.set(pid, { name: normalizeProcessName(match[1]), path: '', creationTime: null, metadataStatus: 'partial', metadataSource: 'tasklist', metadataError: 'Executable path unavailable' });
  }
  return map;
}

async function runMetadataCommand(commandRunner, file, args, options, deadlineAt) {
  const budget = Math.min(options.timeout || METADATA_TIMEOUT_MS, remainingBudget(deadlineAt));
  if (budget <= 0) throw Object.assign(new Error('Discovery deadline exceeded'), { code: 'ETIMEDOUT' });
  return withTimeout(commandRunner(file, args, { ...options, timeout: budget, shell: false }), budget, `${file} timed out`);
}

async function getProcessInfo(pids, commandRunner = runCommand, options = {}) {
  const uniquePids = [...new Set(pids)].filter((pid) => Number.isInteger(pid) && pid > 0 && pid <= 0xFFFFFFFF);
  if (!uniquePids.length) return new Map();
  const deadlineAt = options.deadlineAt || Date.now() + DISCOVERY_DEADLINE_MS;
  const map = new Map(); const lookupPids = uniquePids.slice(0, MAX_METADATA_PIDS);
  for (const pid of uniquePids.slice(MAX_METADATA_PIDS)) map.set(pid, unavailableProcessInfo('unavailable', 'metadata-limit', `Metadata lookup limit reached (${MAX_METADATA_PIDS} PIDs)`));
  const unresolved = []; let cursor = 0;
  async function worker() {
    while (cursor < lookupPids.length) {
      const pid = lookupPids[cursor++];
      try {
        const result = await runMetadataCommand(commandRunner, 'powershell.exe', getProcessCommand(), { encoding: 'utf8', windowsHide: true, env: { ...process.env, PORT_MANAGER_DISCOVERY_PID: String(pid) }, timeout: METADATA_TIMEOUT_MS }, deadlineAt);
        map.set(pid, parsePowerShellProcessInfo(result.stdout, pid));
      } catch (error) {
        const status = classifyMetadataError(error);
        if (status === 'process-exited') map.set(pid, unavailableProcessInfo(status, 'Get-Process', error.message));
        else unresolved.push({ pid, status, error });
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(MAX_METADATA_CONCURRENCY, lookupPids.length) }, worker));
  if (!unresolved.length || remainingBudget(deadlineAt) <= 0) {
    for (const item of unresolved) map.set(item.pid, unavailableProcessInfo(remainingBudget(deadlineAt) <= 0 ? 'timeout' : item.status, 'Get-Process', remainingBudget(deadlineAt) <= 0 ? 'Overall discovery deadline exceeded' : item.error?.message));
    return map;
  }
  try {
    const result = await runMetadataCommand(commandRunner, 'tasklist.exe', ['/fo', 'csv', '/nh'], { encoding: 'utf8', windowsHide: true, timeout: METADATA_TIMEOUT_MS }, deadlineAt);
    const fallback = parseTasklistCsv(result.stdout, unresolved.map(({ pid }) => pid));
    for (const item of unresolved) map.set(item.pid, fallback.get(item.pid) || unavailableProcessInfo(item.status, 'Get-Process/tasklist', `${item.error?.message || 'Primary lookup failed'}; PID was not present in tasklist output`));
  } catch (error) {
    const fallbackStatus = classifyMetadataError(error);
    for (const item of unresolved) map.set(item.pid, unavailableProcessInfo(fallbackStatus === 'permission-denied' ? 'permission-denied' : item.status, 'Get-Process/tasklist', [item.error?.message, error?.message].filter(Boolean).join('; ')));
  }
  return map;
}

function getApplicationName(processName) { return KNOWN_APPS[String(processName || '').toLowerCase()] || processName || 'Unknown process'; }

async function getPorts({ commandRunner = runCommand, deadlineMs = DISCOVERY_DEADLINE_MS } = {}) {
  const deadlineAt = Date.now() + deadlineMs; let snapshot;
  try { snapshot = await getTcpSnapshot(commandRunner, deadlineAt); }
  catch (error) {
    return {
      status: 'cannot-determine',
      ports: [],
      checkedAt: new Date().toISOString(),
      evidenceSource: 'netstat.exe -ano',
      error: error?.message || 'TCP listener discovery failed',
      errorCode: error?.code || 'DISCOVERY_FAILED',
    };
  }
  const processMap = await getProcessInfo(snapshot.listeners.map((row) => row.pid), commandRunner, { deadlineAt });
  const ports = snapshot.listeners.map((row) => {
    const info = processMap.get(row.pid) || unavailableProcessInfo('unavailable', 'metadata', 'No metadata result');
    const portInfo = getPortInfo(row.port); const friendlyProcess = getFriendlyProcessName(info.name);
    const applicationName = info.name === 'Unknown' ? 'Unknown process' : getApplicationName(info.name) || getFallbackAppName(row.pid, info.name) || friendlyProcess || info.name || 'Unknown process';
    return { ...row, processName: info.name, processPath: info.path, processCreationTime: info.creationTime, processMetadataStatus: info.metadataStatus, processMetadataSource: info.metadataSource, processMetadataError: info.metadataError, applicationName, portType: portInfo.type, portService: portInfo.service, portDescription: portInfo.description };
  });
  return { status: 'available', ports, checkedAt: new Date().toISOString(), evidenceSource: snapshot.evidenceSource };
}

async function killProcess(pid) {
  const id = parseProcessId(pid); if (id === 4) throw new Error('Protected Windows process');
  assertDestructiveActionsEnabled();
  const listeners = await getNetstat(); const ownsListeningPort = listeners.some((row) => row.pid === id);
  const processInfo = ownsListeningPort ? await getProcessInfo([id]) : new Map();
  assertProcessCanBeStopped({
    pid: id,
    processName: processInfo.get(id)?.name,
    metadataStatus: processInfo.get(id)?.metadataStatus,
    creationTime: processInfo.get(id)?.creationTime,
    ownsListeningPort,
  });
  await execFileAsync('taskkill', ['/PID', String(id), '/F'], { encoding: 'utf8', windowsHide: true, timeout: 5000, shell: false });
  return { success: true, pid: id };
}

module.exports = { DISCOVERY_DEADLINE_MS, MAX_METADATA_CONCURRENCY, getPorts, getNetstat, getTcpSnapshot, getProcessInfo, parseListenerPid, parseNetstat, parseEndpoint, classifyMetadataError, parseTasklistCsv, killProcess };

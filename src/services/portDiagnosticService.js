'use strict';

const net = require('net');
const { execFile } = require('child_process');
const { promisify } = require('util');
const { getTcpSnapshot, getProcessInfo } = require('./portService');

const CHECK_DEADLINE_MS = 5000;
const PROBE_TIMEOUT_MS = 1500;
const ALTERNATIVE_LIMIT = 12;
const execFileAsync = promisify(execFile);

function defaultCommandRunner(file, args, options) {
  return execFileAsync(file, args, { windowsHide: true, shell: false, ...options });
}

function validateRequest({ port, protocol = 'TCP', localAddress = '127.0.0.1' } = {}) {
  const parsedPort = typeof port === 'number' && Number.isInteger(port) ? port : Number(port);
  if (!Number.isInteger(parsedPort) || parsedPort < 1 || parsedPort > 65535) throw new Error('Port must be an integer from 1 to 65535');
  if (protocol !== 'TCP') throw new Error('Only TCP port checks are supported');
  if (typeof localAddress !== 'string' || net.isIP(localAddress) === 0) throw new Error('Local address must be a supported IPv4 or IPv6 address');
  return { port: parsedPort, protocol, localAddress };
}

function isWildcard(host) { return host === '0.0.0.0' || host === '::'; }

function sameAddressScope(requested, listener) {
  const listenerFamily = listener.addressFamily === 'IPv6' ? 6 : 4;
  if (requested.family !== listenerFamily) return false;
  if (requested.host === listener.localHost) return true;
  if (requested.family === 4 && listener.localHost === '0.0.0.0') return true;
  if (requested.family === 6 && listener.localHost === '::') return true;
  if (isWildcard(requested.host)) return true;
  return false;
}

function parseExcludedRanges(stdout) {
  const ranges = [];
  for (const line of String(stdout || '').split(/\r?\n/)) {
    const match = line.match(/\b(\d+)\s*(?:-\s*|\s+)(\d+)\b/);
    if (match) ranges.push({ start: Number(match[1]), end: Number(match[2]) });
  }
  return ranges;
}

function rangeContains(ranges, port) { return ranges.some((range) => port >= range.start && port <= range.end); }

async function getExcludedPortContext(commandRunner, deadlineAt) {
  try {
    const result = await commandRunner('netsh.exe', ['interface', 'ipv4', 'show', 'excludedportrange', 'protocol=tcp'], { encoding: 'utf8', timeout: Math.max(1, deadlineAt - Date.now()), windowsHide: true, shell: false });
    return { status: 'available', source: 'netsh.exe excluded TCP ranges', ranges: parseExcludedRanges(result.stdout), error: null };
  } catch (error) {
    return { status: 'unavailable', source: 'netsh.exe excluded TCP ranges', ranges: [], error: error?.message || 'Excluded-range lookup failed' };
  }
}

function makeResult(request, outcome, evidenceSource, details = {}) {
  return { ...request, checkedAt: new Date().toISOString(), outcome, evidenceSource, ...details };
}

async function checkPort({ port, protocol = 'TCP', localAddress = '127.0.0.1', adapters = {} } = {}) {
  const request = validateRequest({ port, protocol, localAddress });
  const deadlineAt = Date.now() + CHECK_DEADLINE_MS;
  const commandRunner = adapters.commandRunner;
  const snapshotGetter = adapters.getTcpSnapshot || ((runner, deadline) => getTcpSnapshot(runner, deadline));
  const runner = commandRunner || undefined;
  let snapshot;
  try {
    snapshot = await snapshotGetter(runner, deadlineAt);
  } catch (error) {
    return makeResult(request, 'Cannot determine', 'netstat.exe -ano', { reason: error?.message || 'TCP inspection failed', listener: null, process: null, context: { nonListening: [], excludedRanges: { status: 'unavailable', ranges: [], error: 'TCP inspection failed' } } });
  }

  const scoped = snapshot.entries.filter((entry) => entry.port === request.port && sameAddressScope({ host: request.localAddress, family: net.isIP(request.localAddress) }, entry));
  const listener = scoped.find((entry) => entry.state === 'LISTENING');
  const excluded = adapters.getExcludedPortContext
    ? await adapters.getExcludedPortContext(runner, deadlineAt)
    : await getExcludedPortContext(runner || defaultCommandRunner, deadlineAt);
  const context = { nonListening: scoped.filter((entry) => entry.state !== 'LISTENING'), excludedRanges: excluded, addressScope: request.localAddress };
  if (listener) {
    let process = null;
    try {
      const info = await (adapters.getProcessInfo || getProcessInfo)([listener.pid], runner, { deadlineAt });
      process = info.get(listener.pid) || null;
    } catch (error) {
      process = { name: 'Unknown', metadataStatus: 'unavailable', metadataError: error?.message || 'Metadata lookup failed' };
    }
    return makeResult(request, 'Listening', 'netstat.exe -ano', { listener, process, context });
  }
  const excludedAtCheck = excluded.status === 'available' && rangeContains(excluded.ranges, request.port);
  return makeResult(request, 'No listener observed', 'netstat.exe -ano', { listener: null, process: null, reason: excludedAtCheck ? 'The port is in a reported excluded range; this is context, not proof of this error.' : 'No TCP LISTENING socket matched this address and port.', context });
}

function probePort({ port, localAddress = '127.0.0.1', protocol = 'TCP', adapters = {} } = {}) {
  const request = validateRequest({ port, protocol, localAddress });
  const createServer = adapters.createServer || (() => net.createServer());
  const timeoutMs = adapters.timeoutMs || PROBE_TIMEOUT_MS;
  const cleanupTimeoutMs = adapters.cleanupTimeoutMs || 250;
  return new Promise((resolve) => {
    const server = createServer(); let settled = false; let timer;
    const finish = (result) => {
      if (settled) return; settled = true; clearTimeout(timer);
      let cleanupTimer;
      const resolveAfterCleanup = () => { clearTimeout(cleanupTimer); resolve(result); };
      cleanupTimer = setTimeout(() => {
        try { server.closeAllConnections?.(); } catch { /* best effort cleanup */ }
        try { server.closeIdleConnections?.(); } catch { /* best effort cleanup */ }
        resolveAfterCleanup();
      }, cleanupTimeoutMs);
      try { server.close(resolveAfterCleanup); } catch { resolveAfterCleanup(); }
    };
    server.once('error', (error) => {
      const outcome = error.code === 'EADDRINUSE' ? 'Unavailable' : error.code === 'EACCES' ? 'Cannot determine' : 'Cannot determine';
      finish(makeResult(request, outcome, 'explicit temporary TCP bind probe', { probe: { status: error.code === 'EADDRINUSE' ? 'EADDRINUSE' : error.code === 'EACCES' ? 'EACCES' : 'error', error: error.message }, reason: error.code === 'EADDRINUSE' ? 'The address is already in use at probe time.' : error.code === 'EACCES' ? 'The OS denied the bind probe.' : error.message }));
    });
    timer = setTimeout(() => finish(makeResult(request, 'Cannot determine', 'explicit temporary TCP bind probe', { probe: { status: 'timeout', error: 'Bind probe timed out' }, reason: 'The temporary bind probe exceeded its cleanup deadline.' })), timeoutMs);
    try {
      server.listen({ host: request.localAddress, port: request.port }, () => finish(makeResult(request, 'Available at check time', 'explicit temporary TCP bind probe', { probe: { status: 'success', warning: 'This probe briefly used the port and does not guarantee a later bind.' }, reason: 'The temporary TCP bind succeeded and was closed immediately.' })));
    } catch (error) {
      finish(makeResult(request, 'Cannot determine', 'explicit temporary TCP bind probe', { probe: { status: error.code || 'error', error: error.message }, reason: error.message }));
    }
  });
}

async function findAlternativePort({ port, protocol = 'TCP', localAddress = '127.0.0.1', adapters = {}, limit = ALTERNATIVE_LIMIT } = {}) {
  const request = validateRequest({ port, protocol, localAddress });
  const check = adapters.checkPort || checkPort;
  const probe = adapters.probePort || probePort;
  const candidates = [];
  const maxCandidates = Math.min(ALTERNATIVE_LIMIT, Math.max(1, Number.isInteger(limit) ? limit : ALTERNATIVE_LIMIT));
  for (let offset = 1; offset <= maxCandidates && candidates.length < maxCandidates; offset += 1) {
    const candidate = request.port + offset;
    if (candidate > 65535) break;
    const passive = await check({ ...request, port: candidate, adapters });
    if (passive.outcome === 'Listening') continue;
    const excluded = passive.context?.excludedRanges;
    if (excluded?.status === 'available' && rangeContains(excluded.ranges, candidate)) continue;
    const result = await probe({ ...request, port: candidate, adapters });
    if (result.outcome === 'Available at check time') {
      candidates.push({ ...result, port: candidate, guidance: `Configure your development server to use port ${candidate}.` });
      break;
    }
  }
  return { requested: request, checkedAt: new Date().toISOString(), candidate: candidates[0] || null, outcome: candidates[0] ? 'Available at check time' : 'Cannot determine', evidenceSource: 'bounded alternative-port probes' };
}

module.exports = { CHECK_DEADLINE_MS, PROBE_TIMEOUT_MS, validateRequest, parseExcludedRanges, sameAddressScope, checkPort, probePort, findAlternativePort };

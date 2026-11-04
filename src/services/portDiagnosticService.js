'use strict';

const net = require('net');
const { execFile } = require('child_process');
const { promisify } = require('util');
const { getTcpSnapshot, getProcessInfo } = require('./portService');

const CHECK_DEADLINE_MS = 5000;
const PROBE_TIMEOUT_MS = 1500;
const CLEANUP_TIMEOUT_MS = 250;
const ALTERNATIVE_DEADLINE_MS = 5000;
const ALTERNATIVE_LIMIT = 12;
const execFileAsync = promisify(execFile);

function defaultCommandRunner(file, args, options) {
  return execFileAsync(file, args, { windowsHide: true, shell: false, ...options });
}

function timeoutError(message) { return Object.assign(new Error(message), { code: 'ETIMEDOUT' }); }

function remainingBudget(deadlineAt) { return Math.max(0, deadlineAt - Date.now()); }

function withTimeout(promise, timeoutMs, message) {
  let timer;
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(timeoutError(message)), Math.max(1, timeoutMs)); });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
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

function hasAmbiguousDualStackListener(request, entries) {
  return request.localAddress !== '::' && net.isIP(request.localAddress) === 4 && entries.some((entry) => entry.state === 'LISTENING' && entry.port === request.port && entry.addressFamily === 'IPv6' && entry.localHost === '::');
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

async function getExcludedPortContext(commandRunner, deadlineAt, family, signal) {
  const familyLabel = family === 6 ? 'ipv6' : 'ipv4';
  const source = `netsh.exe ${familyLabel} excluded TCP ranges`;
  const budget = remainingBudget(deadlineAt);
  if (budget <= 0) return { status: 'timeout', family: familyLabel, source, ranges: [], error: 'Diagnostic deadline exceeded' };
  try {
    const result = await withTimeout(commandRunner('netsh.exe', ['interface', familyLabel, 'show', 'excludedportrange', 'protocol=tcp'], { encoding: 'utf8', timeout: budget, windowsHide: true, shell: false, signal }), budget, `${source} lookup timed out`);
    return { status: 'available', family: familyLabel, source, ranges: parseExcludedRanges(result.stdout), error: null };
  } catch (error) {
    return { status: error?.code === 'ETIMEDOUT' ? 'timeout' : 'unavailable', family: familyLabel, source, ranges: [], error: error?.message || 'Excluded-range lookup failed' };
  }
}

async function getDiagnosticContext(adapters, deadlineAt, family, signal) {
  const commandRunner = adapters.commandRunner || defaultCommandRunner;
  const snapshot = adapters.networkSnapshot || await (adapters.getTcpSnapshot || ((runner, deadline, abortSignal) => getTcpSnapshot(runner, deadline, abortSignal)))(commandRunner, deadlineAt, signal);
  const excluded = adapters.excludedPortContext || await getExcludedPortContext(commandRunner, deadlineAt, family, signal);
  return { snapshot, excluded };
}

function makeResult(request, outcome, evidenceSource, details = {}) {
  return { ...request, checkedAt: new Date().toISOString(), outcome, evidenceSource, ...details };
}

async function checkPort({ port, protocol = 'TCP', localAddress = '127.0.0.1', adapters = {}, signal } = {}) {
  const request = validateRequest({ port, protocol, localAddress });
  const deadlineAt = adapters.deadlineAt || Date.now() + CHECK_DEADLINE_MS;
  const requestedFamily = net.isIP(request.localAddress);
  let diagnosticContext;
  try {
    diagnosticContext = adapters.networkContext || await getDiagnosticContext(adapters, deadlineAt, requestedFamily, signal);
  } catch (error) {
    return makeResult(request, 'Cannot determine', 'netstat.exe -ano', {
      reason: error?.message || 'TCP inspection failed', listener: null, process: null,
      context: { nonListening: [], excludedRanges: { status: 'unavailable', family: requestedFamily === 6 ? 'ipv6' : 'ipv4', ranges: [], error: 'TCP inspection failed' } },
    });
  }

  const { snapshot, excluded } = diagnosticContext;
  const scoped = snapshot.entries.filter((entry) => entry.port === request.port && sameAddressScope({ host: request.localAddress, family: requestedFamily }, entry));
  const listener = scoped.find((entry) => entry.state === 'LISTENING');
  const crossFamilyAmbiguous = hasAmbiguousDualStackListener(request, snapshot.entries);
  const context = {
    nonListening: scoped.filter((entry) => entry.state !== 'LISTENING'),
    excludedRanges: excluded,
    addressScope: request.localAddress,
    addressFamily: requestedFamily === 6 ? 'IPv6' : 'IPv4',
    crossFamilyAmbiguous,
  };

  if (listener) {
    let process = null;
    if (listener.pid > 0) {
      try {
        const info = await (adapters.getProcessInfo || getProcessInfo)([listener.pid], adapters.commandRunner, { deadlineAt, signal });
        process = info.get(listener.pid) || null;
      } catch (error) {
        process = { name: 'Unknown', metadataStatus: 'unavailable', metadataError: error?.message || 'Metadata lookup failed' };
      }
    }
    return makeResult(request, 'Listening', 'netstat.exe -ano', { listener, process, context });
  }

  if (crossFamilyAmbiguous) {
    return makeResult(request, 'Cannot determine', 'netstat.exe -ano', {
      listener: null, process: null,
      reason: 'An IPv6 wildcard listener may also cover this IPv4 bind on a dual-stack system; the snapshot cannot prove availability.',
      context,
    });
  }

  const excludedAtCheck = excluded.status === 'available' && rangeContains(excluded.ranges, request.port);
  return makeResult(request, 'No listener observed', 'netstat.exe -ano', {
    listener: null, process: null,
    reason: excludedAtCheck ? 'The port is in a reported excluded range; this is context, not proof of this error.' : 'No TCP LISTENING socket matched this address and port.',
    context,
  });
}

function probePort({ port, localAddress = '127.0.0.1', protocol = 'TCP', adapters = {}, signal, deadlineAt } = {}) {
  const request = validateRequest({ port, protocol, localAddress });
  const createServer = adapters.createServer || (() => net.createServer());
  const timeoutMs = Math.min(adapters.timeoutMs || PROBE_TIMEOUT_MS, deadlineAt ? remainingBudget(deadlineAt) : PROBE_TIMEOUT_MS);
  const cleanupTimeoutMs = adapters.cleanupTimeoutMs || CLEANUP_TIMEOUT_MS;

  return new Promise((resolve) => {
    const server = createServer();
    let settled = false;
    let listeningObserved = false;
    let bindFailed = false;
    let closeRequested = false;
    let closeConfirmed = false;
    let closeFailed = null;
    let cleanupTimedOut = false;
    let closeAttempts = 0;
    let requestedOutcome = null;
    let operationTimer;
    let cleanupTimer;

    const makeProbeResult = () => {
      const cleanupConfirmed = closeConfirmed && !closeFailed && !cleanupTimedOut;
      if (!cleanupConfirmed) {
        return makeResult(request, 'Cannot determine', 'explicit temporary TCP bind probe', {
          reason: closeFailed ? `The temporary probe could not confirm cleanup: ${closeFailed.message}` : 'The temporary probe did not confirm socket cleanup before its deadline.',
          probe: { status: cleanupTimedOut ? 'cleanup-timeout' : 'cleanup-failed', cleanupConfirmed: false },
        });
      }
      return makeResult(request, requestedOutcome.outcome, 'explicit temporary TCP bind probe', {
        reason: requestedOutcome.reason,
        probe: { ...requestedOutcome.probe, cleanupConfirmed: true },
      });
    };

    const finalize = () => {
      if (settled || !closeConfirmed && !closeFailed && !cleanupTimedOut) return;
      settled = true;
      clearTimeout(operationTimer);
      clearTimeout(cleanupTimer);
      resolve(makeProbeResult());
    };

    const forceCloseConnections = () => {
      try { server.closeAllConnections?.(); } catch { /* best effort */ }
      try { server.closeIdleConnections?.(); } catch { /* best effort */ }
    };

    const requestClose = (force = false) => {
      if (closeRequested && !force) return;
      closeRequested = true;
      if (force) closeConfirmed = false;
      clearTimeout(cleanupTimer);
      cleanupTimer = setTimeout(() => {
        cleanupTimedOut = true;
        forceCloseConnections();
        finalize();
      }, cleanupTimeoutMs);
      const attemptClose = () => {
        closeAttempts += 1;
        try {
          server.close((error) => {
            if (error && error.code !== 'ERR_SERVER_NOT_RUNNING') {
              closeFailed = error;
              if (closeAttempts < 2 && !cleanupTimedOut) {
                setTimeout(attemptClose, 0);
                return;
              }
            } else {
              closeFailed = null;
              if (listeningObserved || bindFailed) closeConfirmed = true;
            }
            finalize();
          });
        } catch (error) {
          if (bindFailed && error.code === 'ERR_SERVER_NOT_RUNNING') closeConfirmed = true;
          else closeFailed = error;
          if (closeFailed && closeAttempts < 2 && !cleanupTimedOut) {
            setTimeout(attemptClose, 0);
            return;
          }
          finalize();
        }
      };
      attemptClose();
    };

    const failOrTimeout = (kind, error) => {
      if (!requestedOutcome) {
        requestedOutcome = kind === 'timeout'
          ? { outcome: 'Cannot determine', reason: 'The temporary bind probe timed out.', probe: { status: 'timeout' } }
          : { outcome: error?.code === 'EADDRINUSE' ? 'Unavailable' : 'Cannot determine', reason: error?.code === 'EADDRINUSE' ? 'The address is already in use at probe time.' : error?.code === 'EACCES' ? 'The OS denied the bind probe.' : error?.message || 'Bind probe failed.', probe: { status: error?.code || 'error', error: error?.message } };
      }
      if (kind !== 'timeout') bindFailed = true;
      requestClose();
    };

    const onListening = () => {
      if (listeningObserved) return;
      listeningObserved = true;
      if (requestedOutcome) requestClose(true);
      else {
        requestedOutcome = { outcome: 'Available at check time', reason: 'The temporary TCP bind succeeded and was closed immediately.', probe: { status: 'success', warning: 'This probe briefly used the port and does not guarantee a later bind.' } };
        requestClose();
      }
    };

    const onError = (error) => {
      if (!requestedOutcome) failOrTimeout('error', error);
    };

    server.once('listening', onListening);
    server.once('error', onError);
    operationTimer = setTimeout(() => failOrTimeout('timeout'), Math.max(1, timeoutMs));
    if (signal) {
      if (signal.aborted) {
        failOrTimeout('timeout');
        return;
      }
      signal.addEventListener('abort', () => failOrTimeout('timeout'), { once: true });
    }
    try {
      server.listen({ host: request.localAddress, port: request.port }, onListening);
    } catch (error) {
      failOrTimeout('error', error);
    }
  });
}

async function findAlternativePort({ port, protocol = 'TCP', localAddress = '127.0.0.1', adapters = {}, limit = ALTERNATIVE_LIMIT, deadlineMs = ALTERNATIVE_DEADLINE_MS } = {}) {
  const request = validateRequest({ port, protocol, localAddress });
  const deadlineAt = adapters.deadlineAt || Date.now() + deadlineMs;
  const maxCandidates = Math.min(ALTERNATIVE_LIMIT, Math.max(1, Number.isInteger(limit) ? limit : ALTERNATIVE_LIMIT));
  let networkContext = null;

  if (!adapters.checkPort) {
    try { networkContext = adapters.networkContext || await getDiagnosticContext(adapters, deadlineAt, net.isIP(request.localAddress)); }
    catch (error) { return { requested: request, checkedAt: new Date().toISOString(), outcome: 'Cannot determine', evidenceSource: 'bounded alternative-port search', candidate: null, reason: error?.message || 'Unable to obtain a bounded network snapshot' }; }
  }

  for (let offset = 1; offset <= maxCandidates; offset += 1) {
    if (remainingBudget(deadlineAt) <= 0) break;
    const candidatePort = request.port + offset;
    if (candidatePort > 65535) break;
    const checkAdapters = networkContext ? { ...adapters, networkContext } : adapters;
    let passive;
    const passiveController = typeof AbortController === 'function' ? new AbortController() : null;
    try {
      passive = await withTimeout(Promise.resolve((adapters.checkPort || checkPort)({ ...request, port: candidatePort, adapters: checkAdapters, signal: passiveController?.signal })), remainingBudget(deadlineAt), 'Alternative-port search deadline exceeded');
    } catch (error) {
      passiveController?.abort();
      return { requested: request, checkedAt: new Date().toISOString(), outcome: 'Cannot determine', evidenceSource: 'bounded alternative-port search', candidate: null, reason: error?.message || 'Alternative-port diagnostic failed' };
    }
    if (passive.outcome === 'Listening' || passive.outcome === 'Cannot determine') continue;
    const excluded = passive.context?.excludedRanges;
    if (excluded?.status === 'available' && rangeContains(excluded.ranges, candidatePort)) continue;

    const probeAdapters = { ...adapters, timeoutMs: Math.min(adapters.timeoutMs || PROBE_TIMEOUT_MS, remainingBudget(deadlineAt)), cleanupTimeoutMs: Math.min(adapters.cleanupTimeoutMs || CLEANUP_TIMEOUT_MS, Math.max(1, remainingBudget(deadlineAt))) };
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    try {
      const probePromise = Promise.resolve((adapters.probePort || probePort)({ ...request, port: candidatePort, adapters: probeAdapters, deadlineAt, signal: controller?.signal }));
      const result = await withTimeout(probePromise, remainingBudget(deadlineAt), 'Alternative-port search deadline exceeded');
      if (result.outcome === 'Available at check time' && result.probe?.cleanupConfirmed !== false) {
        return { requested: request, checkedAt: new Date().toISOString(), outcome: 'Available at check time', evidenceSource: 'bounded alternative-port probes', candidate: { ...result, port: candidatePort, guidance: `Configure your development server to use port ${candidatePort}.` } };
      }
    } catch (error) {
      controller?.abort();
      return { requested: request, checkedAt: new Date().toISOString(), outcome: 'Cannot determine', evidenceSource: 'bounded alternative-port search', candidate: null, reason: error?.message || 'Alternative-port probe exceeded its deadline' };
    }
  }
  return { requested: request, checkedAt: new Date().toISOString(), outcome: 'Cannot determine', evidenceSource: 'bounded alternative-port search', candidate: null, reason: remainingBudget(deadlineAt) <= 0 ? 'Alternative-port search deadline expired before availability was established.' : 'No candidate was established during the bounded search.' };
}

module.exports = { CHECK_DEADLINE_MS, PROBE_TIMEOUT_MS, CLEANUP_TIMEOUT_MS, ALTERNATIVE_DEADLINE_MS, validateRequest, parseExcludedRanges, sameAddressScope, hasAmbiguousDualStackListener, getExcludedPortContext, getDiagnosticContext, checkPort, probePort, findAlternativePort };

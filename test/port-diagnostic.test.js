'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { parseNetstat } = require('../src/services/portService');
const { checkPort, probePort, findAlternativePort, parseExcludedRanges } = require('../src/services/portDiagnosticService');

function mockServer({ error, listen = true, listeningDelayMs = 0, closeError = null, closeCallback = true } = {}) {
  const calls = { listen: 0, close: 0 };
  const listeners = {};
  return {
    calls,
    closed: false,
    once(type, callback) { listeners[type] = callback; },
    listen(_options, callback) {
      calls.listen += 1;
      if (error) return queueMicrotask(() => listeners.error(error));
      if (listen) setTimeout(() => {
        listeners.listening?.();
        callback?.();
      }, listeningDelayMs);
    },
    close(callback) {
      calls.close += 1;
      if (!closeCallback) return;
      queueMicrotask(() => {
        if (!closeError) this.closed = true;
        callback?.(closeError);
      });
    },
  };
}

test('diagnostics: TCP LISTENING rows preserve IPv4, IPv6, and wildcard bindings while excluding UDP', () => {
  const rows = parseNetstat([
    'TCP 127.0.0.1:5173 0.0.0.0:0 LISTENING 1234',
    'TCP [::1]:5173 [::]:0 LISTENING 2345',
    'TCP 0.0.0.0:5173 0.0.0.0:0 LISTENING 3456',
    'TCP 127.0.0.1:5173 127.0.0.1:6000 TIME_WAIT 4567',
    'UDP 0.0.0.0:5173 *:* 9999',
  ].join('\r\n'), { listeningOnly: false });

  assert.equal(rows.length, 4);
  assert.deepEqual(rows.map((row) => row.localAddress), ['127.0.0.1:5173', '[::1]:5173', '0.0.0.0:5173', '127.0.0.1:5173']);
  assert.equal(rows[1].addressFamily, 'IPv6');
  assert.equal(rows[3].state, 'TIME_WAIT');
});

function diagnosticAdapters(entries, processes = new Map(), excluded = { status: 'available', ranges: [] }) {
  return {
    getTcpSnapshot: async () => ({ entries, listeners: entries.filter((entry) => entry.state === 'LISTENING') }),
    getProcessInfo: async () => processes,
    commandRunner: async (file) => {
      if (file === 'netsh.exe') return { stdout: excluded.ranges.map((range) => `${range.start} ${range.end}`).join('\r\n') };
      throw new Error(`Unexpected command ${file}`);
    },
  };
}

test('diagnostics: listening result includes exact endpoint and verified owner only when metadata is available', async () => {
  const listener = { protocol: 'TCP', state: 'LISTENING', localHost: '127.0.0.1', localAddress: '127.0.0.1:5173', addressFamily: 'IPv4', port: 5173, pid: 1234 };
  const result = await checkPort({ port: 5173, localAddress: '127.0.0.1', adapters: diagnosticAdapters([listener], new Map([[1234, { name: 'node.exe', metadataStatus: 'available' }]])) });
  assert.equal(result.outcome, 'Listening');
  assert.equal(result.listener.localAddress, '127.0.0.1:5173');
  assert.equal(result.process.name, 'node.exe');
});

test('diagnostics: no listener is not reported as free and excluded ranges remain context', async () => {
  const timeWait = { protocol: 'TCP', state: 'TIME_WAIT', localHost: '127.0.0.1', localAddress: '127.0.0.1:5173', addressFamily: 'IPv4', port: 5173, pid: 0 };
  const result = await checkPort({ port: 5173, adapters: diagnosticAdapters([timeWait], new Map(), { status: 'available', ranges: [{ start: 5173, end: 5173 }] }) });
  assert.equal(result.outcome, 'No listener observed');
  assert.match(result.reason, /excluded range/);
  assert.equal(result.context.nonListening[0].state, 'TIME_WAIT');
});

test('diagnostics: excluded-range lookup errors do not become a false conflict explanation', async () => {
  const result = await checkPort({ port: 5173, adapters: { getTcpSnapshot: async () => ({ entries: [], listeners: [] }), commandRunner: async () => { throw new Error('Access is denied'); } } });
  assert.equal(result.outcome, 'No listener observed');
  assert.equal(result.context.excludedRanges.status, 'unavailable');
  assert.doesNotMatch(result.reason, /excluded range/);
});

test('diagnostics: explicit bind probes classify success, EADDRINUSE, EACCES, and always close', async () => {
  const success = mockServer();
  const available = await probePort({ port: 5173, adapters: { createServer: () => success } });
  assert.equal(available.outcome, 'Available at check time');
  assert.equal(success.closed, true);
  assert.equal(success.calls.close, 1);

  const inUse = mockServer({ error: Object.assign(new Error('busy'), { code: 'EADDRINUSE' }) });
  const unavailable = await probePort({ port: 5173, adapters: { createServer: () => inUse } });
  assert.equal(unavailable.outcome, 'Unavailable');
  assert.equal(unavailable.probe.status, 'EADDRINUSE');
  assert.equal(inUse.calls.close, 1);

  const denied = mockServer({ error: Object.assign(new Error('denied'), { code: 'EACCES' }) });
  const cannotDetermine = await probePort({ port: 5173, adapters: { createServer: () => denied } });
  assert.equal(cannotDetermine.outcome, 'Cannot determine');
  assert.equal(cannotDetermine.probe.status, 'EACCES');
  assert.equal(denied.calls.close, 1);

  const timedOut = mockServer();
  timedOut.listen = () => {};
  timedOut.close = () => { timedOut.calls.close += 1; };
  timedOut.closeAllConnections = () => { timedOut.calls.forceClose = (timedOut.calls.forceClose || 0) + 1; };
  const timed = await probePort({ port: 5173, adapters: { createServer: () => timedOut, timeoutMs: 5, cleanupTimeoutMs: 5 } });
  assert.equal(timed.outcome, 'Cannot determine');
  assert.equal(timed.probe.status, 'cleanup-timeout');
  assert.equal(timed.probe.cleanupConfirmed, false);
  assert.equal(timedOut.calls.close, 1);
  assert.equal(timedOut.calls.forceClose, 1);
});

test('diagnostics: an already-aborted probe never calls listen', async () => {
  const server = mockServer();
  const controller = new AbortController();
  controller.abort();
  const result = await probePort({ port: 5173, signal: controller.signal, adapters: { createServer: () => server, cleanupTimeoutMs: 5 } });
  assert.equal(server.calls.listen, 0);
  assert.equal(server.calls.close, 1);
  assert.equal(result.outcome, 'Cannot determine');
  assert.equal(result.probe.cleanupConfirmed, false);
  assert.equal(result.probe.status, 'cleanup-timeout');
});

test('diagnostics: late listening after timeout cannot claim cleanup and failed close is explicit', async () => {
  const late = mockServer({ listeningDelayMs: 25, closeCallback: false });
  const lateResult = await probePort({ port: 5173, adapters: { createServer: () => late, timeoutMs: 5, cleanupTimeoutMs: 5 } });
  assert.equal(lateResult.outcome, 'Cannot determine');
  assert.equal(lateResult.probe.cleanupConfirmed, false);
  assert.equal(lateResult.probe.status, 'cleanup-timeout');
  await new Promise((resolve) => setTimeout(resolve, 35));
  assert.ok(late.calls.close >= 1);

  const closeFailed = mockServer({ closeError: Object.assign(new Error('close failed'), { code: 'EIO' }) });
  const failedResult = await probePort({ port: 5173, adapters: { createServer: () => closeFailed } });
  assert.equal(failedResult.outcome, 'Cannot determine');
  assert.equal(failedResult.probe.status, 'cleanup-failed');
  assert.equal(failedResult.probe.cleanupConfirmed, false);
  assert.equal(closeFailed.calls.close, 2);
});

test('diagnostics: parser-to-checkPort preserves a Windows TIME_WAIT row with PID 0', async () => {
  const timeWaitLine = '  TCP    127.0.0.1:5173     127.0.0.1:6000     TIME_WAIT       0\r\n';
  assert.equal(parseNetstat(timeWaitLine)[0].pid, 0);
  const runner = async (file) => {
    if (file === 'netstat.exe') return { stdout: timeWaitLine };
    if (file === 'netsh.exe') return { stdout: '' };
    throw new Error(`Unexpected command ${file}`);
  };
  const result = await checkPort({ port: 5173, adapters: { commandRunner: runner } });
  assert.equal(result.outcome, 'No listener observed');
  assert.equal(result.listener, null);
  assert.deepEqual(result.context.nonListening[0], {
    protocol: 'TCP', state: 'TIME_WAIT', localAddress: '127.0.0.1:5173', localHost: '127.0.0.1',
    addressFamily: 'IPv4', port: 5173, pid: 0, ownerStatus: 'unknown',
  });
});

test('diagnostics: failed netstat is an explicit unknown state', async () => {
  const runner = async () => { throw Object.assign(new Error('netstat timed out'), { code: 'ETIMEDOUT' }); };
  const result = await checkPort({ port: 5173, adapters: { commandRunner: runner } });
  assert.equal(result.outcome, 'Cannot determine');
  assert.match(result.reason, /netstat timed out/);
  assert.equal(result.evidenceSource, 'netstat.exe -ano');
});

test('diagnostics: IPv6 wildcard evidence remains ambiguous for an IPv4 request', async () => {
  const listener = { protocol: 'TCP', state: 'LISTENING', localHost: '::', localAddress: '[::]:5173', addressFamily: 'IPv6', port: 5173, pid: 4321 };
  const result = await checkPort({ port: 5173, localAddress: '127.0.0.1', adapters: diagnosticAdapters([listener]) });
  assert.equal(result.outcome, 'Cannot determine');
  assert.equal(result.context.crossFamilyAmbiguous, true);
});

test('diagnostics: IPv6 checks use IPv6 exclusion evidence only', async () => {
  const calls = [];
  const result = await checkPort({ port: 5173, localAddress: '::1', adapters: {
    commandRunner: async (file, args) => {
      calls.push({ file, args });
      if (file === 'netstat.exe') return { stdout: '' };
      return { stdout: 'Start Port    End Port\r\n5173 5173\r\n' };
    },
  } });
  assert.equal(result.outcome, 'No listener observed');
  assert.equal(result.context.excludedRanges.family, 'ipv6');
  assert.match(result.context.excludedRanges.source, /ipv6/);
  assert.deepEqual(calls.find((call) => call.file === 'netsh.exe').args.slice(0, 3), ['interface', 'ipv6', 'show']);
});

test('diagnostics: alternative search is bounded and returns an available-at-check-time candidate', async () => {
  const probes = [];
  const result = await findAlternativePort({ port: 5173, limit: 3, adapters: {
    checkPort: async ({ port }) => ({ outcome: port === 5174 ? 'Listening' : 'No listener observed' }),
    probePort: async ({ port }) => { probes.push(port); return { port, outcome: port === 5175 ? 'Available at check time' : 'Unavailable' }; },
  } });
  assert.equal(result.candidate.port, 5175);
  assert.deepEqual(probes, [5175]);
});

test('diagnostics: alternative search skips excluded candidates and clamps the requested limit', async () => {
  const probes = [];
  const result = await findAlternativePort({ port: 5173, limit: 99, adapters: {
    checkPort: async ({ port }) => ({ outcome: 'No listener observed', context: { excludedRanges: { status: 'available', ranges: port === 5174 ? [{ start: 5174, end: 5174 }] : [] } } }),
    probePort: async ({ port }) => { probes.push(port); return { port, outcome: 'Available at check time' }; },
  } });
  assert.equal(result.candidate.port, 5175);
  assert.deepEqual(probes, [5175]);
});

test('diagnostics: alternative search reuses one passive snapshot and obeys its overall deadline', async () => {
  const calls = [];
  const result = await findAlternativePort({ port: 5173, limit: 3, deadlineMs: 100, adapters: {
    commandRunner: async (file) => {
      calls.push(file);
      if (file === 'netstat.exe') return { stdout: '' };
      return { stdout: '' };
    },
    probePort: async ({ port }) => ({ port, outcome: 'Available at check time', probe: { cleanupConfirmed: true } }),
  } });
  assert.equal(result.outcome, 'Available at check time');
  assert.equal(result.candidate.port, 5174);
  assert.equal(calls.filter((file) => file === 'netstat.exe').length, 1);
  assert.equal(calls.filter((file) => file === 'netsh.exe').length, 1);

  let passiveAborted = false;
  const slow = await findAlternativePort({ port: 5173, limit: 3, deadlineMs: 20, adapters: {
    checkPort: ({ signal }) => new Promise((resolve) => {
      signal?.addEventListener('abort', () => { passiveAborted = true; resolve({ outcome: 'Cannot determine' }); }, { once: true });
      setTimeout(() => resolve({ outcome: 'No listener observed' }), 100);
    }),
  } });
  assert.equal(slow.outcome, 'Cannot determine');
  assert.match(slow.reason, /deadline/i);
  assert.equal(passiveAborted, true);
});

test('diagnostics: excluded range parser is read-only and range-based', () => {
  assert.deepEqual(parseExcludedRanges('Start Port    End Port\r\n5173 5173\r\n5200 5210'), [{ start: 5173, end: 5173 }, { start: 5200, end: 5210 }]);
});

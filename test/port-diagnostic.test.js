'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { parseNetstat } = require('../src/services/portService');
const { checkPort, probePort, findAlternativePort, parseExcludedRanges } = require('../src/services/portDiagnosticService');

function mockServer({ error, listen = true } = {}) {
  const calls = { listen: 0, close: 0 };
  const listeners = {};
  return {
    calls,
    once(type, callback) { listeners[type] = callback; },
    listen(_options, callback) {
      calls.listen += 1;
      if (error) return queueMicrotask(() => listeners.error(error));
      if (listen) queueMicrotask(callback);
    },
    close(callback) { calls.close += 1; queueMicrotask(callback); },
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
  assert.equal(timed.probe.status, 'timeout');
  assert.equal(timedOut.calls.close, 1);
  assert.equal(timedOut.calls.forceClose, 1);
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

test('diagnostics: excluded range parser is read-only and range-based', () => {
  assert.deepEqual(parseExcludedRanges('Start Port    End Port\r\n5173 5173\r\n5200 5210'), [{ start: 5173, end: 5173 }, { start: 5200, end: 5210 }]);
});

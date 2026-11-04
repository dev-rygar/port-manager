'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createProcessPreviewService, createWindowsProcessAdapter } = require('../src/services/processPreviewService');

const CREATION_TIME = '2026-11-04T00:00:00.000Z';

function endpoint(localAddress, localHost, port, pid, state = 'LISTENING') {
  return {
    protocol: 'TCP', state, localAddress, localHost, addressFamily: localHost.includes(':') ? 'IPv6' : 'IPv4', port, pid,
  };
}

function createFixture({ metadata = {}, entries, now = 1000, relationships } = {}) {
  let clockValue = now;
  let tokenNumber = 0;
  const snapshot = {
    status: 'available',
    evidenceSource: 'mock netstat',
    entries: entries || [
      endpoint('127.0.0.1:3000', '127.0.0.1', 3000, 70000),
      endpoint('0.0.0.0:3001', '0.0.0.0', 3001, 70000),
      endpoint('127.0.0.1:3000', '127.0.0.1', 3000, 0, 'TIME_WAIT'),
    ],
  };
  const adapter = {
    getSnapshot: async () => snapshot,
    getProcessInfo: async (pids) => new Map(pids.map((pid) => [pid, metadata[pid] || {
      name: 'node.exe', path: 'C:\\node.exe', creationTime: CREATION_TIME, metadataStatus: 'available', metadataError: null,
    }])),
    getProcessRelationships: async () => relationships || ({ status: 'unavailable', parent: null, descendants: [], reason: 'mock unavailable', isSelfOrDescendant: false }),
  };
  const service = createProcessPreviewService({
    adapter,
    clock: () => clockValue,
    tokenGenerator: () => `token-${++tokenNumber}-${'a'.repeat(40)}`,
    ttlMs: 100,
  });
  return { service, advance(ms) { clockValue += ms; } };
}

test('S1-01/S1-02: preview derives exact identity and includes all same-instance listeners', async () => {
  const fixture = createFixture({ relationships: {
    status: 'available',
    parent: { pid: 60000, name: 'cmd.exe' },
    descendants: [{ pid: 70001, name: 'child.exe' }],
  } });
  const result = await fixture.service.previewStop({ port: 3000, protocol: 'TCP', localAddress: '127.0.0.1' }, { sessionId: 'window-a' });

  assert.equal(result.status, 'preview-ready');
  assert.equal(result.actionable, false);
  assert.deepEqual(result.target.identity, { pid: 70000, creationTime: CREATION_TIME });
  assert.equal(result.target.processName, 'node.exe');
  assert.equal(result.selectedEndpoint.localAddress, '127.0.0.1:3000');
  assert.deepEqual(result.affectedEndpoints.map((item) => item.port), [3000, 3001]);
  assert.equal(result.affectedEndpoints.some((item) => item.state === 'TIME_WAIT'), false);
  assert.equal(result.relationships.informationalOnly, true);
  assert.equal(result.relationships.isSelfOrDescendant, false);
  assert.equal(result.relationships.descendants[0].pid, 70001);
  assert.equal(result.preview.oneTime, true);
});

test('S1-01/S1-04: incomplete metadata refuses a non-actionable preview', async () => {
  const fixture = createFixture({ metadata: {
    70000: { name: 'node.exe', path: '', creationTime: null, metadataStatus: 'partial', metadataError: 'path unavailable' },
  } });
  const result = await fixture.service.previewStop({ port: 3000, localAddress: '127.0.0.1' }, { sessionId: 'window-a' });
  assert.equal(result.status, 'refused');
  assert.match(result.reason, /metadata and creation time/);
  assert.equal('preview' in result, false);

  const missingPath = createFixture({ metadata: {
    70000: { name: 'node.exe', path: '', creationTime: CREATION_TIME, metadataStatus: 'available' },
  } });
  const missingPathResult = await missingPath.service.previewStop({ port: 3000, localAddress: '127.0.0.1' }, { sessionId: 'window-a' });
  assert.equal(missingPathResult.status, 'refused');
  assert.match(missingPathResult.reason, /metadata and creation time/);
});

test('S1-04: protected PID 4 and PID 0 owners cannot obtain a preview token', async () => {
  const protectedFixture = createFixture({ entries: [endpoint('127.0.0.1:4', '127.0.0.1', 4, 4)], metadata: {
    4: { name: 'System', path: 'C:\\Windows\\System32\\ntoskrnl.exe', creationTime: CREATION_TIME, metadataStatus: 'available' },
  } });
  const protectedResult = await protectedFixture.service.previewStop({ port: 4, localAddress: '127.0.0.1' }, { sessionId: 'window-a' });
  assert.equal(protectedResult.status, 'refused');
  assert.match(protectedResult.reason, /Protected/);

  const pidZeroFixture = createFixture({ entries: [endpoint('127.0.0.1:5', '127.0.0.1', 5, 0)] });
  const pidZeroResult = await pidZeroFixture.service.previewStop({ port: 5, localAddress: '127.0.0.1' }, { sessionId: 'window-a' });
  assert.equal(pidZeroResult.status, 'refused');
  assert.match(pidZeroResult.reason, /PID 0|unknown/);
});

test('S1-03: preview authorization is one-time, short-lived, and bound to its window', async () => {
  const fixture = createFixture();
  const binding = { sessionId: 'window-a', frameId: 1 };
  const result = await fixture.service.previewStop({ port: 3000, localAddress: '127.0.0.1' }, binding);
  const token = result.preview.token;

  const wrongWindow = fixture.service.authorizePreview({ token }, { sessionId: 'window-b', frameId: 1 });
  assert.equal(wrongWindow.status, 'stalePreview');
  assert.match(wrongWindow.reason, /another trusted window/);

  const wrongFrame = fixture.service.authorizePreview({ token }, { sessionId: 'window-a', frameId: 2 });
  assert.equal(wrongFrame.status, 'stalePreview');
  assert.match(wrongFrame.reason, /another trusted window/);

  const authorized = fixture.service.authorizePreview({ token }, binding);
  assert.equal(authorized.status, 'authorized-preview');
  assert.equal(authorized.actionable, false);
  assert.match(authorized.reason, /No process termination/);

  const replay = fixture.service.authorizePreview({ token }, binding);
  assert.equal(replay.status, 'stalePreview');

  const expiring = await fixture.service.previewStop({ port: 3000, localAddress: '127.0.0.1' }, binding);
  fixture.advance(101);
  const expired = fixture.service.authorizePreview({ token: expiring.preview.token }, binding);
  assert.equal(expired.status, 'stalePreview');
});

test('S1-04: ambiguous ownership and failed discovery remain explicit', async () => {
  const ambiguous = createFixture({ entries: [
    endpoint('127.0.0.1:3000', '127.0.0.1', 3000, 70000),
    endpoint('0.0.0.0:3000', '0.0.0.0', 3000, 70001),
  ] });
  const ambiguousResult = await ambiguous.service.previewStop({ port: 3000, localAddress: '127.0.0.1' }, { sessionId: 'window-a' });
  assert.equal(ambiguousResult.status, 'refused');
  assert.match(ambiguousResult.reason, /ambiguous/);

  const failed = createProcessPreviewService({ adapter: { getSnapshot: async () => { throw Object.assign(new Error('netstat timed out'), { code: 'ETIMEDOUT' }); } } });
  const failedResult = await failed.previewStop({ port: 3000, localAddress: '127.0.0.1' }, { sessionId: 'window-a' });
  assert.equal(failedResult.status, 'uncertain');
  assert.equal(failedResult.errorCode, 'ETIMEDOUT');
  assert.equal('preview' in failedResult, false);
});

test('S1-04: the Electron process or a known descendant is refused before preview authorization', async () => {
  const fixture = createFixture({ relationships: {
    status: 'available',
    isSelfOrDescendant: true,
    parent: null,
    descendants: [],
  } });
  const result = await fixture.service.previewStop({ port: 3000, localAddress: '127.0.0.1' }, { sessionId: 'window-a' });
  assert.equal(result.status, 'refused');
  assert.match(result.reason, /Electron application or one of its descendants/);
  assert.equal('preview' in result, false);

  const currentPid = process.pid;
  const adapter = createWindowsProcessAdapter({
    getSnapshot: async () => ({ status: 'available', evidenceSource: 'mock netstat', entries: [endpoint(`127.0.0.1:3000`, '127.0.0.1', 3000, currentPid)] }),
    lookupProcessInfo: async () => new Map([[currentPid, { name: 'node.exe', path: process.execPath, creationTime: CREATION_TIME, metadataStatus: 'available' }]]),
  });
  const productionSelfCheck = createProcessPreviewService({ adapter });
  const selfResult = await productionSelfCheck.previewStop({ port: 3000, localAddress: '127.0.0.1' }, { sessionId: 'window-a' });
  assert.equal(selfResult.status, 'refused');
  assert.match(selfResult.reason, /Electron application or one of its descendants/);
});

test('S1-03: unexpected authorization payloads are rejected', async () => {
  const fixture = createFixture();
  for (const payload of [null, [], {}, { token: 'short' }, { token: 'a'.repeat(64), pid: 70000 }]) {
    assert.throws(() => fixture.service.authorizePreview(payload, { sessionId: 'window-a' }), /Invalid preview authorization request/);
  }
});

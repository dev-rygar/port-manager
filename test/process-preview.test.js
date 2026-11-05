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
  assert.deepEqual(result.target.observedIdentity, { pid: 70000, creationTime: CREATION_TIME });
  assert.equal(result.target.identityStatus, 'observed-subsequent-metadata');
  assert.equal(result.target.executionAuthority, false);
  assert.equal(result.target.processName, 'node.exe');
  assert.equal(result.selectedEndpoint.localAddress, '127.0.0.1:3000');
  assert.deepEqual(result.affectedEndpoints.map((item) => item.port), [3000, 3001]);
  assert.equal(result.affectedEndpoints.some((item) => item.state === 'TIME_WAIT'), false);
  assert.equal(result.relationships.informationalOnly, true);
  assert.equal(result.relationships.isSelfOrDescendant, false);
  assert.equal(result.relationships.descendants[0].pid, 70001);
  assert.equal(result.preview.oneTime, true);
});

test('S1-01: a wildcard listener cannot substitute for the exact selected endpoint', async () => {
  const fixture = createFixture({ entries: [endpoint('0.0.0.0:3000', '0.0.0.0', 3000, 70001)] });
  const result = await fixture.service.previewStop({ port: 3000, localAddress: '127.0.0.1' }, { sessionId: 'window-a' });
  assert.equal(result.status, 'refused');
  assert.match(result.reason, /The selected listener endpoint is no longer present; preview is non-actionable/);
  assert.equal(result.actionable, false);
  assert.equal('preview' in result, false);
});

test('S1-01: an exact listener cannot substitute for a selected wildcard endpoint', async () => {
  const fixture = createFixture({ entries: [endpoint('127.0.0.1:3000', '127.0.0.1', 3000, 70001)] });
  const result = await fixture.service.previewStop({ port: 3000, localAddress: '0.0.0.0' }, { sessionId: 'window-a' });
  assert.equal(result.status, 'refused');
  assert.match(result.reason, /The selected listener endpoint is no longer present; preview is non-actionable/);
  assert.equal(result.actionable, false);
  assert.equal('preview' in result, false);
});

test('S1-01: when no listener exists on the port at all, preview is uncertain', async () => {
  const fixture = createFixture({ entries: [] });
  const result = await fixture.service.previewStop({ port: 3000, localAddress: '127.0.0.1' }, { sessionId: 'window-a' });
  assert.equal(result.status, 'uncertain');
  assert.match(result.reason, /No matching LISTENING socket was observed/);
  assert.equal(result.actionable, false);
  assert.equal('preview' in result, false);
});

test('S1-01: exact listener is refused when exact and wildcard have different owner PIDs', async () => {
  const fixture = createFixture({ entries: [
    endpoint('127.0.0.1:3000', '127.0.0.1', 3000, 70000),
    endpoint('0.0.0.0:3000', '0.0.0.0', 3000, 70001),
  ] });
  const result = await fixture.service.previewStop({ port: 3000, localAddress: '127.0.0.1' }, { sessionId: 'window-a' });
  assert.equal(result.status, 'refused');
  assert.match(result.reason, /More than one process could own the requested address scope/);
  assert.equal(result.actionable, false);
  assert.equal('preview' in result, false);
});

test('S1-01: exact listener succeeds when both exact and wildcard share the same verified owner PID', async () => {
  const fixture = createFixture({ entries: [
    endpoint('127.0.0.1:3000', '127.0.0.1', 3000, 70000),
    endpoint('0.0.0.0:3000', '0.0.0.0', 3000, 70000),
  ] });
  const result = await fixture.service.previewStop({ port: 3000, localAddress: '127.0.0.1' }, { sessionId: 'window-a' });
  assert.equal(result.status, 'preview-ready');
  assert.equal(result.selectedEndpoint.localAddress, '127.0.0.1:3000');
  assert.equal(result.target.observedIdentity.pid, 70000);
});

test('S1-01: a changed observation is uncertain and never becomes execution authority', async () => {
  const pid = 70000;
  const adapter = {
    getSnapshot: async () => ({
      status: 'available',
      observationId: 'listener-observation-1',
      evidenceSource: 'mock netstat',
      entries: [endpoint('127.0.0.1:3000', '127.0.0.1', 3000, pid)],
    }),
    getProcessInfo: async () => new Map([[pid, {
      name: 'node.exe', path: 'C:\\node.exe', creationTime: CREATION_TIME,
      metadataStatus: 'available', observationId: 'process-observation-2',
    }]]),
    getProcessRelationships: async () => ({ status: 'unavailable', isSelfOrDescendant: false }),
  };
  const service = createProcessPreviewService({ adapter });
  const result = await service.previewStop({ port: 3000, localAddress: '127.0.0.1' }, { sessionId: 'window-a' });
  assert.equal(result.status, 'uncertain');
  assert.equal(result.identityStatus, 'observation-mismatch');
  assert.equal(result.actionable, false);
  assert.equal('preview' in result, false);
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

test('S1-03/S1-04: a newer preview supersedes the older token for the same document', async () => {
  const fixture = createFixture();
  const binding = { sessionId: 'window-a', frameId: 1 };
  const older = await fixture.service.previewStop({ port: 3000, localAddress: '127.0.0.1' }, binding);
  const newer = await fixture.service.previewStop({ port: 3001, localAddress: '0.0.0.0' }, binding);

  const stale = fixture.service.authorizePreview({ token: older.preview.token }, binding);
  assert.equal(stale.status, 'stalePreview');
  const current = fixture.service.authorizePreview({ token: newer.preview.token }, binding);
  assert.equal(current.status, 'authorized-preview');
  assert.equal(current.target.pid, 70000);
});

test('S1-03: document invalidation makes an otherwise live token stale', async () => {
  const fixture = createFixture();
  const binding = { sessionId: 'window-a', documentEpoch: 1 };
  const result = await fixture.service.previewStop({ port: 3000, localAddress: '127.0.0.1' }, binding);
  fixture.service.invalidateAllPreviews();
  const stale = fixture.service.authorizePreview({ token: result.preview.token }, binding);
  assert.equal(stale.status, 'stalePreview');
});

function deferredPreviewOperation() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function previewTestAdapter(overrides = {}) {
  const snapshot = {
    status: 'available',
    evidenceSource: 'mock netstat',
    entries: [endpoint('127.0.0.1:3000', '127.0.0.1', 3000, 70000)],
  };
  const metadata = new Map([[70000, {
    name: 'node.exe', path: 'C:\\node.exe', creationTime: CREATION_TIME, metadataStatus: 'available',
  }]]);
  return {
    getSnapshot: async () => snapshot,
    getProcessInfo: async () => metadata,
    getProcessRelationships: async () => ({ status: 'unavailable', parent: null, descendants: [], isSelfOrDescendant: false }),
    ...overrides,
  };
}

test('S1-03: older in-flight metadata response cannot replace a newer completed preview token', async () => {
  const metadataPending = deferredPreviewOperation();
  const metadataStarted = deferredPreviewOperation();
  let lookupCount = 0;
  const adapter = previewTestAdapter({
    getProcessInfo: async () => {
      if (++lookupCount === 1) {
        metadataStarted.resolve();
        return metadataPending.promise;
      }
      return new Map([[70000, { name: 'node.exe', path: 'C:\\node.exe', creationTime: CREATION_TIME, metadataStatus: 'available' }]]);
    },
  });
  const service = createProcessPreviewService({ adapter });
  const binding = { sessionId: 'window-a', documentEpoch: 1 };
  const request = { port: 3000, localAddress: '127.0.0.1' };
  const requestA = service.previewStop(request, binding);
  await metadataStarted.promise;
  const resultB = await service.previewStop(request, binding);
  assert.equal(resultB.status, 'preview-ready');

  metadataPending.resolve(new Map([[70000, {
    name: 'node.exe', path: 'C:\\node.exe', creationTime: CREATION_TIME, metadataStatus: 'available',
  }]]));
  const resultA = await requestA;
  assert.equal(resultA.status, 'stalePreview');
  assert.equal(resultA.actionable, false);
  assert.equal('preview' in resultA, false);
  assert.equal(service.authorizePreview({ token: resultB.preview.token }, binding).status, 'authorized-preview');
});

test('S1-03: reload invalidates a pending snapshot so it cannot mint a new preview token', async () => {
  const pendingSnapshot = deferredPreviewOperation();
  const snapshotStarted = deferredPreviewOperation();
  const snapshot = {
    status: 'available', evidenceSource: 'mock netstat',
    entries: [endpoint('127.0.0.1:3000', '127.0.0.1', 3000, 70000)],
  };
  let snapshotCalls = 0;
  const service = createProcessPreviewService({
    adapter: previewTestAdapter({
      getSnapshot: () => {
        if (++snapshotCalls === 1) {
          snapshotStarted.resolve();
          return pendingSnapshot.promise;
        }
        return Promise.resolve(snapshot);
      },
    }),
  });
  const binding = { sessionId: 'window-a', documentEpoch: 1 };
  const request = { port: 3000, localAddress: '127.0.0.1' };
  const pending = service.previewStop(request, binding);
  await snapshotStarted.promise;
  service.invalidateAllPreviews();
  pendingSnapshot.resolve(snapshot);
  const invalidated = await pending;
  assert.equal(invalidated.status, 'stalePreview');
  assert.equal('preview' in invalidated, false);

  // A new document can request its own fresh token after the old one was invalidated.
  const newBinding = { sessionId: 'window-a', documentEpoch: 2 };
  const current = await service.previewStop(request, newBinding);
  assert.equal(current.status, 'preview-ready');
  assert.equal(service.authorizePreview({ token: current.preview.token }, binding).status, 'stalePreview');
  assert.equal(service.authorizePreview({ token: current.preview.token }, newBinding).status, 'authorized-preview');
});

test('S1-03: a new failing request immediately revokes the prior issued preview token', async () => {
  const failedSnapshot = deferredPreviewOperation();
  const nextSnapshotStarted = deferredPreviewOperation();
  let snapshotCalls = 0;
  const adapter = previewTestAdapter({
    getSnapshot: () => {
      if (++snapshotCalls === 1) {
        return Promise.resolve({
          status: 'available', evidenceSource: 'mock netstat',
          entries: [endpoint('127.0.0.1:3000', '127.0.0.1', 3000, 70000)],
        });
      }
      nextSnapshotStarted.resolve();
      return failedSnapshot.promise;
    },
  });
  const service = createProcessPreviewService({ adapter });
  const binding = { sessionId: 'window-a', documentEpoch: 1 };
  const request = { port: 3000, localAddress: '127.0.0.1' };
  const prior = await service.previewStop(request, binding);
  assert.equal(prior.status, 'preview-ready');
  const newer = service.previewStop(request, binding);
  await nextSnapshotStarted.promise;

  // The first token must be stale before the new request finishes.
  assert.equal(service.authorizePreview({ token: prior.preview.token }, binding).status, 'stalePreview');
  failedSnapshot.reject(new Error('netstat timed out'));
  const failed = await newer;
  assert.equal(failed.status, 'uncertain');
  assert.equal('preview' in failed, false);
  assert.equal(service.authorizePreview({ token: prior.preview.token }, binding).status, 'stalePreview');
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

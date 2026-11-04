'use strict';

// IPC tests use a fake Electron window. No Electron app or Windows command runs.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');

const projectRoot = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(projectRoot, 'main.js'), 'utf8');
const expectedUrl = pathToFileURL(path.join(projectRoot, 'src', 'renderer', 'index.html')).href;

function createMainHarness() {
  const handlers = new Map();
  const calls = [];
  const diagnosticCalls = [];
  const previewCalls = [];
  let window = null;

  class FakeBrowserWindow {
    constructor(options) {
      this.options = options;
      this.webContents = {
        mainFrame: { url: expectedUrl },
        on(type, callback) { this[type] = callback; },
        setWindowOpenHandler(callback) { this.windowOpenHandler = callback; },
      };
      window = this;
    }
    loadFile(value) { this.file = value; }
    once() {}
    show() {}
    isDestroyed() { return false; }
  }
  FakeBrowserWindow.getAllWindows = () => window ? [window] : [];

  const electron = {
    app: {
      whenReady: () => Promise.resolve(),
      on: () => {},
      quit: () => {},
    },
    BrowserWindow: FakeBrowserWindow,
    ipcMain: {
      handle(channel, callback) { handlers.set(channel, callback); },
    },
  };

  const requireStub = (id) => {
    if (id === 'electron') return electron;
    if (id === 'path') return path;
    if (id === 'url') return { pathToFileURL };
    if (id === './src/services/ipcSecurity') return require('../src/services/ipcSecurity');
    if (id === './src/services/terminationPolicy') return require('../src/services/terminationPolicy');
    if (id === './src/services/portService') {
      return {
        getPorts: async () => [{ port: 3000, pid: 1234 }],
        killProcess: async (pid) => {
          calls.push(pid);
          throw new Error('OS execution is disabled in IPC tests');
        },
      };
    }
    if (id === './src/services/portDiagnosticService') {
      const { validateRequest } = require('../src/services/portDiagnosticService');
      return {
        validateRequest,
        checkPort: async (request) => { diagnosticCalls.push({ channel: 'check', request }); return { ...request, outcome: 'No listener observed' }; },
        probePort: async (request) => { diagnosticCalls.push({ channel: 'probe', request }); return { ...request, outcome: 'Cannot determine' }; },
        findAlternativePort: async (request) => { diagnosticCalls.push({ channel: 'alternative', request }); return { requested: request, candidate: null, outcome: 'Cannot determine' }; },
      };
    }
    if (id === './src/services/processPreviewService') {
      return {
        createProcessPreviewService: () => ({
          previewStop: async (request, binding) => { previewCalls.push({ channel: 'preview', request, binding }); return { status: 'uncertain', ...request }; },
          authorizePreview: (payload, binding) => { previewCalls.push({ channel: 'authorize', payload, binding }); return { status: 'stalePreview' }; },
        }),
      };
    }
    throw new Error('Unexpected dependency: ' + id);
  };

  vm.runInNewContext(source, {
    require: requireStub,
    __dirname: projectRoot,
    console: { error: () => {} },
    process: { platform: 'win32' },
  }, { filename: 'main.js' });
  return {
    handlers, calls, diagnosticCalls, previewCalls,
    getWindow: () => window,
    trustedEvent: () => ({ sender: window.webContents, senderFrame: window.webContents.mainFrame }),
  };
}

async function readyHarness() {
  const harness = createMainHarness();
  await Promise.resolve();
  assert.ok(harness.getWindow(), 'App window should be created');
  return harness;
}

test('IPC: narrow discovery, diagnostic, and termination channels are registered', () => {
  const h = createMainHarness();
  assert.deepEqual(Array.from(h.handlers.keys()).sort(), ['ports:alternative', 'ports:authorize-preview', 'ports:check', 'ports:get', 'ports:kill', 'ports:preview', 'ports:probe']);
});

test('IPC: authorized discovery delegates to service', async () => {
  const h = await readyHarness();
  const rows = await h.handlers.get('ports:get')(h.trustedEvent());
  assert.equal(rows.length, 1);
  assert.equal(rows[0].port, 3000);
  assert.deepEqual(h.calls, []);
});

test('PM-A08: untrusted senders cannot call discovery or termination', async () => {
  const h = await readyHarness();
  const impostor = { sender: { id: 9999 }, senderFrame: { url: 'https://untrusted.example' } };
  await assert.rejects(h.handlers.get('ports:get')(impostor), /Unauthorized IPC sender/);
  await assert.rejects(h.handlers.get('ports:kill')(impostor, 1234), /Unauthorized IPC sender/);
  await assert.rejects(h.handlers.get('ports:check')(impostor, { port: 5173 }), /Unauthorized IPC sender/);
  await assert.rejects(h.handlers.get('ports:probe')(impostor, { port: 5173 }), /Unauthorized IPC sender/);
  assert.deepEqual(h.calls, []);
});

test('PM-A08: a child frame of the trusted window is not an authorized sender', async () => {
  const h = await readyHarness();
  const impostor = { sender: h.getWindow().webContents, senderFrame: { url: expectedUrl } };
  await assert.rejects(h.handlers.get('ports:kill')(impostor, 1234), /Unauthorized IPC sender/);
  assert.deepEqual(h.calls, []);
});

test('PM-A08: even a top-level trusted frame with the wrong URL is rejected', async () => {
  const h = await readyHarness();
  h.getWindow().webContents.mainFrame.url = 'https://untrusted.example';
  await assert.rejects(h.handlers.get('ports:get')(h.trustedEvent()), /Unauthorized IPC sender/);
});

test('PM-A11: malformed PIDs are rejected at IPC before reaching service', async () => {
  const h = await readyHarness();
  const handler = h.handlers.get('ports:kill');
  for (const pid of ['123abc', 0, -1, 1.5, '1e2', {}, null, 0x100000000]) {
    await assert.rejects(handler(h.trustedEvent(), pid), /Invalid PID/);
  }
  assert.deepEqual(h.calls, []);
});

test('PM-A12: trusted IPC cannot bypass the disabled termination feature gate', async () => {
  const h = await readyHarness();
  await assert.rejects(h.handlers.get('ports:kill')(h.trustedEvent(), 70000), /termination is disabled until M1.2/);
  assert.deepEqual(h.calls, []);
});

test('IPC: diagnostic handlers strip renderer adapters, snapshots, timing, and limit overrides', async () => {
  const h = await readyHarness();
  const trusted = h.trustedEvent();

  await h.handlers.get('ports:check')(trusted, {
    port: '5173', protocol: 'TCP', localAddress: '127.0.0.1',
    adapters: { networkContext: { snapshot: { entries: [{ state: 'LISTENING', pid: 9999 }] } }, timeoutMs: 1 },
    networkSnapshot: { entries: [{ state: 'LISTENING', pid: 9999 }] }, deadlineAt: 1, deadlineMs: 1,
  });
  await h.handlers.get('ports:probe')(trusted, {
    port: 5174, protocol: 'TCP', localAddress: '127.0.0.1',
    adapters: { cleanupTimeoutMs: 999999, timeoutMs: 1 }, signal: { aborted: true },
  });
  await h.handlers.get('ports:alternative')(trusted, {
    port: 5175, protocol: 'TCP', localAddress: '127.0.0.1',
    adapters: { networkSnapshot: { entries: [] }, deadlineMs: 1 }, deadlineMs: 1, limit: 999,
  });

  assert.deepEqual(JSON.parse(JSON.stringify(h.diagnosticCalls)), [
    { channel: 'check', request: { port: 5173, protocol: 'TCP', localAddress: '127.0.0.1' } },
    { channel: 'probe', request: { port: 5174, protocol: 'TCP', localAddress: '127.0.0.1' } },
    { channel: 'alternative', request: { port: 5175, protocol: 'TCP', localAddress: '127.0.0.1' } },
  ]);
});

test('IPC: invalid diagnostic payloads are rejected before service dispatch', async () => {
  const h = await readyHarness();
  const trusted = h.trustedEvent();
  const payloads = [null, [], '5173', 5173, {}, { port: 5173, protocol: 'UDP' }, { port: 5173, localAddress: 'not-an-ip' }];
  for (const channel of ['ports:check', 'ports:probe', 'ports:alternative']) {
    for (const payload of payloads) {
      await assert.rejects(h.handlers.get(channel)(trusted, payload));
    }
  }
  assert.deepEqual(h.diagnosticCalls, []);
});

test('IPC: preview strips renderer-owned internals and authorization binds to the trusted window', async () => {
  const h = await readyHarness();
  const trusted = h.trustedEvent();
  await h.handlers.get('ports:preview')(trusted, {
    port: 5173, protocol: 'TCP', localAddress: '127.0.0.1',
    networkContext: { snapshot: { entries: [{ pid: 4, state: 'LISTENING' }] } },
    adapters: { getProcessInfo: 'spoofed', deadlineAt: 1 }, signal: { aborted: true },
  });
  await h.handlers.get('ports:authorize-preview')(trusted, { token: 'a'.repeat(64) });

  assert.deepEqual(JSON.parse(JSON.stringify(h.previewCalls)), [
    { channel: 'preview', request: { port: 5173, protocol: 'TCP', localAddress: '127.0.0.1' }, binding: { webContentsId: 'main-window', sessionId: 'main-session', frameId: null, frameUrl: expectedUrl } },
    { channel: 'authorize', payload: { token: 'a'.repeat(64) }, binding: { webContentsId: 'main-window', sessionId: 'main-session', frameId: null, frameUrl: expectedUrl } },
  ]);
});

test('IPC: malformed preview and authorization payloads are rejected before service dispatch', async () => {
  const h = await readyHarness();
  const trusted = h.trustedEvent();
  for (const payload of [null, [], '5173', {}, { port: 5173, protocol: 'UDP' }, { port: 5173, localAddress: 'not-an-ip' }]) {
    await assert.rejects(h.handlers.get('ports:preview')(trusted, payload));
  }
  for (const payload of [null, [], {}, { token: 'short' }, { token: 'a'.repeat(64), target: {} }]) {
    await assert.rejects(h.handlers.get('ports:authorize-preview')(trusted, payload));
  }
  assert.deepEqual(h.previewCalls, []);
});

test('Electron: sandbox enabled and unexpected navigation/window open denied', async () => {
  const h = await readyHarness();
  const w = h.getWindow();
  assert.equal(w.options.webPreferences.sandbox, true);
  assert.equal(w.options.webPreferences.contextIsolation, true);
  assert.equal(w.options.webPreferences.nodeIntegration, false);
  assert.equal(w.webContents.windowOpenHandler().action, 'deny');
  let blocked = false;
  w.webContents['will-navigate']({ preventDefault() { blocked = true; } }, 'https://untrusted.example');
  assert.equal(blocked, true);
});

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
    throw new Error('Unexpected dependency: ' + id);
  };

  vm.runInNewContext(source, {
    require: requireStub,
    __dirname: projectRoot,
    console: { error: () => {} },
    process: { platform: 'win32' },
  }, { filename: 'main.js' });
  return {
    handlers, calls,
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

test('IPC: only narrow discovery and termination channels are registered', () => {
  const h = createMainHarness();
  assert.deepEqual(Array.from(h.handlers.keys()).sort(), ['ports:get', 'ports:kill']);
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

test('IPC: valid high PID reaches the service boundary', async () => {
  const h = await readyHarness();
  await assert.rejects(h.handlers.get('ports:kill')(h.trustedEvent(), 70000), /OS execution is disabled/);
  assert.deepEqual(h.calls, [70000]);
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

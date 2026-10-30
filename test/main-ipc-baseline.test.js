'use strict';

// Main-process IPC registration tests with a fake Electron API; no BrowserWindow or
// real Windows command is started. Authorization-focused checks are TODO until M1.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../main.js'), 'utf8');

function createMainHarness() {
  const handlers = new Map();
  const calls = [];
  const electron = {
    app: {
      whenReady: () => new Promise(() => {}), // Do not create an actual window.
      on: () => {},
      quit: () => {},
    },
    BrowserWindow: class FakeBrowserWindow {},
    ipcMain: {
      handle(channel, callback) { handlers.set(channel, callback); },
    },
  };
  electron.BrowserWindow.getAllWindows = () => [];

  const module = { exports: {} };
  const requireStub = (id) => {
    if (id === 'electron') return electron;
    if (id === 'path') return path;
    if (id === './src/services/portService') {
      return {
        getPorts: async () => [{ port: 3000, pid: 1234 }],
        killProcess: async (pid) => {
          calls.push(pid);
          throw new Error('OS execution is intentionally disabled in M0 tests');
        },
      };
    }
    throw new Error('Unexpected dependency: ' + id);
  };
  vm.runInNewContext(source, {
    require: requireStub,
    module,
    exports: module.exports,
    console: { error: () => {} },
    process: { platform: 'win32' },
  }, { filename: 'main.js' });
  return { handlers, calls };
}

test('IPC: only the two current narrow channels are registered', () => {
  const h = createMainHarness();
  assert.deepEqual(Array.from(h.handlers.keys()).sort(), ['ports:get', 'ports:kill']);
});

test('IPC: get channel delegates to service and returns snapshot records', async () => {
  const h = createMainHarness();
  const rows = await h.handlers.get('ports:get')({});
  assert.equal(rows.length, 1);
  assert.equal(rows[0].port, 3000);
  assert.deepEqual(h.calls, []);
});

// These must become passing negative tests when main-process safety checks land.
test.todo('PM-A08: process-stop IPC rejects requests from untrusted sender frames');
test.todo('PM-A01: direct IPC cannot bypass protected-target enforcement');
test.todo('PM-A11: IPC rejects malformed PID inputs before reaching the OS adapter');

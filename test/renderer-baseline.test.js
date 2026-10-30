'use strict';

// Minimal in-memory DOM / IPC doubles. No Electron window is started and no PID is killed.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../src/renderer/app.js'), 'utf8');

function element(id) {
  const values = new Set();
  return {
    id,
    value: '',
    innerHTML: '',
    textContent: '',
    dataset: {},
    listeners: {},
    classList: {
      add: (name) => values.add(name),
      remove: (name) => values.delete(name),
      toggle: (name, force) => {
        const shouldAdd = force === undefined ? !values.has(name) : force;
        if (shouldAdd) values.add(name);
        else values.delete(name);
      },
      contains: (name) => values.has(name),
    },
    addEventListener(type, callback) { this.listeners[type] = callback; },
    querySelectorAll() { return []; },
  };
}

function createRendererHarness(initialRows) {
  const elements = new Map();
  const get = (id) => {
    if (!elements.has(id)) elements.set(id, element(id));
    return elements.get(id);
  };
  const storage = new Map();
  let rows = initialRows;
  const calls = [];
  const document = {
    getElementById: get,
    querySelectorAll: () => [],
    addEventListener: () => {},
    removeEventListener: () => {},
    createElement: () => {
      let raw = '';
      return {
        set textContent(value) { raw = String(value); },
        get textContent() { return raw; },
        get innerHTML() {
          return raw.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        },
      };
    },
  };
  const window = {
    portManager: {
      getPorts: async () => rows,
      killProcess: async (pid) => {
        calls.push(pid);
        throw new Error('Mocked kill is intentionally disabled in UI tests');
      },
    },
  };
  const module = vm.runInNewContext(
    source + '\n({loadPorts,renderTable,renderCurrentTab,renderDevTab,getTags,setTag,getTag,showDetails,filterPorts})',
    {
      document, window,
      localStorage: {
        getItem: (key) => storage.get(key) ?? null,
        setItem: (key, value) => storage.set(key, value),
      },
      confirm: () => false,
      alert: () => { throw new Error('Unexpected alert'); },
      setTimeout: () => {},
      console,
    },
    { filename: 'app.js' }
  );
  return { app: module, get, storage, calls, setRows: (next) => { rows = next; } };
}

const rows = [
  {
    port: 3000, pid: 1234, protocol: 'TCP', localAddress: '127.0.0.1:3000',
    portType: 'development', portService: 'Dev server', portDescription: 'Port hint only',
    processName: 'node.exe', applicationName: 'Node.js', processPath: 'C:\\node.exe',
  },
  {
    port: 5173, pid: 4567, protocol: 'TCP', localAddress: '127.0.0.1:5173',
    portType: 'development', portService: 'Vite', portDescription: 'Port hint only',
    processName: 'node.exe', applicationName: 'Node.js', processPath: 'C:\\node.exe',
  },
];

test('renderer: port search filters the All Ports table', async () => {
  const h = createRendererHarness(rows);
  await h.app.loadPorts();
  h.get('search').value = '3000';
  h.app.renderCurrentTab();
  assert.match(h.get('table-body').innerHTML, /class="port">3000</);
  assert.doesNotMatch(h.get('table-body').innerHTML, /class="port">5173</);
  assert.deepEqual(h.calls, []);
});

test('renderer: existing tag preference is persisted by numeric port', async () => {
  const h = createRendererHarness(rows);
  await h.app.loadPorts();
  h.app.setTag(3000, 'backend');
  assert.equal(h.app.getTag(3000), 'backend');
  assert.deepEqual(JSON.parse(h.storage.get('port-manager-tags')), { 3000: 'backend' });
  assert.deepEqual(h.calls, []);
  // Tag storage is characterization only. A tag MUST NOT grant stop authorization (PM-A04).
});

test('renderer: details fields are inserted as plain text', async () => {
  const h = createRendererHarness(rows);
  await h.app.loadPorts();
  h.app.showDetails(rows[0]);
  assert.equal(h.get('detail-app').textContent, 'Node.js');
  assert.equal(h.get('detail-pid').textContent, 1234);
  assert.equal(h.get('detail-port').textContent, 3000);
  assert.equal(h.get('detail-path').textContent, 'C:\\node.exe');
  assert.deepEqual(h.calls, []);
});

test('renderer: no-match search produces an empty All Ports table', async () => {
  const h = createRendererHarness(rows);
  await h.app.loadPorts();
  h.get('search').value = 'no-matching-process';
  h.app.renderCurrentTab();
  assert.equal(h.get('table-body').innerHTML, '');
  // A friendly empty-search state is still required in M3 (PM-A19).
});

test.todo('PM-A04: persistent port labels never authorize termination of a future owner');
test.todo('PM-A07: app metadata cannot inject attributes through innerHTML');
test.todo('PM-A15: older refresh results cannot overwrite newer snapshots');
test.todo('PM-A16: selecting one of several ports for a PID preserves the selected endpoint');
test.todo('PM-A17: search applies consistently in the Development tab');
test.todo('PM-A19: keyboard-driven details and sorting are accessible');

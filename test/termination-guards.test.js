'use strict';

// All Windows subprocess calls are intercepted. These are guardrail unit tests,
// NOT proof of race-free termination or complete Windows process protection.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const { parseProcessId, assertProcessCanBeStopped } = require('../src/services/terminationPolicy');
const source = fs.readFileSync(path.join(__dirname, '../src/services/portService.js'), 'utf8');

function createHarness({ pid = 70000, processName = 'node.exe', listening = true, unknown = false, wmicUnavailable = false, taskkillFails = false } = {}) {
  const commands = [];
  const exec = function exec() {};
  const execFile = function execFile() {};
  const module = { exports: {} };
  const requires = (id) => {
    if (id === 'child_process') return { exec, execFile };
    if (id === 'net') return require('node:net');
    if (id === 'util') {
      return {
        promisify: (fn) => async (...args) => {
          const [command] = args;
          if (fn === execFile) {
            commands.push({ type: 'execFile', command, argv: args[1], options: args[2] });
            if (command === 'taskkill') {
              if (taskkillFails) throw new Error('Access is denied');
              return { stdout: 'SUCCESS' };
            }
            if (command === 'netstat.exe') {
              return { stdout: listening
                ? 'TCP 127.0.0.1:3000 0.0.0.0:0 LISTENING ' + pid + '\r\n'
                : 'TCP 127.0.0.1:4000 0.0.0.0:0 LISTENING 5555\r\n' };
            }
            if (command === 'powershell.exe') {
              if (wmicUnavailable) throw new Error('PowerShell missing');
              return { stdout: unknown ? '' : JSON.stringify({ id: pid, name: processName.replace(/\.exe$/i, ''), path: 'C:\\Fake\\' + processName, creationTime: '2026-10-31T00:00:00.000Z' }) };
            }
            if (command === 'tasklist.exe') return { stdout: unknown ? '' : '"' + processName + '","' + pid + '","Console","1","1,234 K"\r\n' };
          }
          throw new Error('Unexpected command ' + command);
        },
      };
    }
    if (id === './portReference') return require('../src/services/portReference');
    if (id === './terminationPolicy') return require('../src/services/terminationPolicy');
    throw new Error('Unexpected module ' + id);
  };
  vm.runInNewContext(source, { module, exports: module.exports, require: requires, Buffer, console, process: { env: {} }, setTimeout, clearTimeout },
    { filename: 'portService.js' });
  return { commands, service: module.exports };
}

test('PM-A11: only canonical positive Windows PIDs are accepted', () => {
  for (const value of [1, 123, 70000, 0xFFFFFFFF, '70000']) {
    assert.equal(parseProcessId(value), Number(value));
  }
  for (const value of [0, -1, '0', '0123', '123abc', '1e2', 1.5, NaN, Infinity, {}, null, 0x100000000]) {
    assert.throws(() => parseProcessId(value), /Invalid PID/);
  }
});

test('PM-A01: protected PID 4 is blocked before any OS command', async () => {
  const h = createHarness({ pid: 4 });
  await assert.rejects(h.service.killProcess(4), /Protected Windows process/);
  assert.equal(h.commands.length, 0);
});

test('PM-A12: termination is disabled before any OS command, including protected names', async () => {
  const h = createHarness({ pid: 70000, processName: 'SVCHOST.EXE' });
  await assert.rejects(h.service.killProcess(70000), /termination is disabled until M1.2/);
  assert.equal(h.commands.length, 0);
});

test('PM-A12: termination is disabled before unknown metadata can reach taskkill', async () => {
  const h = createHarness({ pid: 70000, unknown: true });
  await assert.rejects(h.service.killProcess(70000), /termination is disabled until M1.2/);
  assert.equal(h.commands.length, 0);
});

test('PM-A12: termination is disabled before stale listener checks can reach taskkill', async () => {
  const h = createHarness({ pid: 70000, listening: false });
  await assert.rejects(h.service.killProcess(70000), /termination is disabled until M1.2/);
  assert.equal(h.commands.length, 0);
});

test('PM-A11: malformed PID never invokes the OS or a truncated target', async () => {
  const h = createHarness();
  await assert.rejects(h.service.killProcess('70000abc'), /Invalid PID/);
  assert.equal(h.commands.length, 0);
});

test('PM-A12: ordinary listener cannot invoke argument-array taskkill while disabled', async () => {
  const h = createHarness({ pid: 70000 });
  await assert.rejects(h.service.killProcess(70000), /termination is disabled until M1.2/);
  assert.equal(h.commands.filter((c) => c.command === 'taskkill').length, 0);
});

test('PM-A12: taskkill failure path is unreachable while termination is disabled', async () => {
  const h = createHarness({ taskkillFails: true });
  await assert.rejects(h.service.killProcess(70000), /termination is disabled until M1.2/);
  assert.equal(h.commands.filter((c) => c.command === 'taskkill').length, 0);
});

test('PM-A12: name-only fallback cannot authorize termination while disabled', async () => {
  const h = createHarness({ wmicUnavailable: true });
  await assert.rejects(h.service.killProcess(70000), /termination is disabled until M1.2/);
  assert.equal(h.commands.filter((c) => c.command === 'taskkill').length, 0);
});

test('M1: suspicious names are denied by policy regardless of PID range', () => {
  for (const name of ['lsass.exe', 'WinLogon.EXE', 'explorer.exe', 'C:\\Windows\\svchost.exe', 'SYSTEM']) {
    assert.throws(() => assertProcessCanBeStopped({ pid: 70000, processName: name, ownsListeningPort: true, metadataStatus: 'available', creationTime: '2026-11-04T00:00:00.000Z' }), /Protected/);
  }
});

test('M1.2 prerequisite: partial metadata cannot authorize a process instance', () => {
  assert.throws(() => assertProcessCanBeStopped({
    pid: 70000, processName: 'node.exe', ownsListeningPort: true, metadataStatus: 'partial', creationTime: null,
  }), /complete process metadata/);
  assert.throws(() => assertProcessCanBeStopped({
    pid: 70000, processName: 'node.exe', ownsListeningPort: true, metadataStatus: 'available', creationTime: null,
  }), /creation time/);
});

test('M1.2 prerequisite: metadata status and creation time are mandatory', () => {
  assert.throws(() => assertProcessCanBeStopped({ pid: 70000, processName: 'node.exe', ownsListeningPort: true, creationTime: '2026-11-04T00:00:00.000Z' }), /complete process metadata/);
  assert.throws(() => assertProcessCanBeStopped({ pid: 70000, processName: 'node.exe', ownsListeningPort: true, metadataStatus: 'available', creationTime: 'not-a-time' }), /creation time/);
});

// Still open until preview/revalidation/OS-specific identity work is complete.
test.todo('PM-A02: process creation-time identity prevents PID reuse across preview and stop');
test.todo('PM-A03: a successful taskkill is followed by independent process and listener verification');

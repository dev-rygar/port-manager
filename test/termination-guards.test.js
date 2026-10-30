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
    if (id === 'util') {
      return {
        promisify: (fn) => async (...args) => {
          const [command] = args;
          if (fn === execFile) {
            commands.push({ type: 'execFile', command, argv: args[1], options: args[2] });
            if (taskkillFails) throw new Error('Access is denied');
            return { stdout: 'SUCCESS' };
          }
          commands.push({ type: 'exec', command, options: args[1] });
          if (command === 'netstat -ano') {
            return { stdout: listening
              ? 'TCP 127.0.0.1:3000 0.0.0.0:0 LISTENING ' + pid + '\r\n'
              : 'TCP 127.0.0.1:4000 0.0.0.0:0 LISTENING 5555\r\n' };
          }
          if (command.startsWith('wmic ')) {
            if (wmicUnavailable) throw new Error('WMIC missing');
            return { stdout: unknown ? '' :
              'Name=' + processName + '\r\nExecutablePath=C:\\Fake\\' + processName + '\r\nProcessId=' + pid + '\r\n\r\n' };
          }
          if (command.startsWith('tasklist ')) {
            return { stdout: unknown ? '' : '"' + processName + '","' + pid + '","Console","1","1,234 K"\r\n' };
          }
          throw new Error('Unexpected command ' + command);
        },
      };
    }
    if (id === './portReference') return require('../src/services/portReference');
    if (id === './terminationPolicy') return require('../src/services/terminationPolicy');
    throw new Error('Unexpected module ' + id);
  };
  vm.runInNewContext(source, { module, exports: module.exports, require: requires, Buffer, console },
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

test('PM-A01: reported system-managed executable is blocked before taskkill', async () => {
  const h = createHarness({ pid: 70000, processName: 'SVCHOST.EXE' });
  await assert.rejects(h.service.killProcess(70000), /Protected or system-managed process/);
  assert.ok(h.commands.some((c) => c.command === 'netstat -ano'));
  assert.ok(h.commands.every((c) => c.type !== 'execFile'));
});

test('PM-A01: unknown process name fails closed, even if port is a common dev port', async () => {
  const h = createHarness({ pid: 70000, unknown: true });
  await assert.rejects(h.service.killProcess(70000), /Cannot verify process name/);
  assert.ok(h.commands.every((c) => c.type !== 'execFile'));
});

test('PM-A01: no current listening endpoint means no termination', async () => {
  const h = createHarness({ pid: 70000, listening: false });
  await assert.rejects(h.service.killProcess(70000), /no longer owns a detected listening port/);
  assert.ok(h.commands.every((c) => c.type !== 'execFile'));
});

test('PM-A11: malformed PID never invokes the OS or a truncated target', async () => {
  const h = createHarness();
  await assert.rejects(h.service.killProcess('70000abc'), /Invalid PID/);
  assert.equal(h.commands.length, 0);
});

test('M1: known ordinary listener uses argument-array taskkill (no shell)', async () => {
  const h = createHarness({ pid: 70000 });
  const result = await h.service.killProcess(70000);
  assert.equal(result.success, true);
  assert.equal(result.pid, 70000);
  const taskkill = h.commands.filter((c) => c.type === 'execFile');
  assert.equal(taskkill.length, 1);
  assert.equal(taskkill[0].command, 'taskkill');
  assert.deepEqual(Array.from(taskkill[0].argv), ['/PID', '70000', '/F']);
  assert.equal(taskkill[0].options.windowsHide, true);
  assert.ok(taskkill[0].options.timeout > 0);
});

test('M1: taskkill failure is returned as a rejection, not success', async () => {
  const h = createHarness({ taskkillFails: true });
  await assert.rejects(h.service.killProcess(70000), /Access is denied/);
});

test('M1: WMIC unavailability can use tasklist name-only fallback', async () => {
  const h = createHarness({ wmicUnavailable: true });
  const result = await h.service.killProcess(70000);
  assert.equal(result.pid, 70000);
  assert.equal(h.commands.filter((c) => c.type === 'execFile').length, 1);
});

test('M1: suspicious names are denied by policy regardless of PID range', () => {
  for (const name of ['lsass.exe', 'WinLogon.EXE', 'explorer.exe', 'C:\\Windows\\svchost.exe', 'SYSTEM']) {
    assert.throws(() => assertProcessCanBeStopped({ pid: 70000, processName: name, ownsListeningPort: true }), /Protected/);
  }
});

// Still open until preview/revalidation/OS-specific identity work is complete.
test.todo('PM-A02: process creation-time identity prevents PID reuse across preview and stop');
test.todo('PM-A03: a successful taskkill is followed by independent process and listener verification');

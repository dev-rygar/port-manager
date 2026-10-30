'use strict';

// M0 characterization tests run with built-in Node tooling. Every OS command is mocked.
// These tests document functioning behavior, NOT proof that destructive actions are safe.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const projectRoot = path.resolve(__dirname, '..');
const source = (file) => fs.readFileSync(path.join(projectRoot, file), 'utf8');

const SAMPLE_NETSTAT = [
  '  Proto  Local Address          Foreign Address        State           PID',
  '  TCP    0.0.0.0:3000           0.0.0.0:0              LISTENING       1234',
  '  TCP    127.0.0.1:3001         0.0.0.0:0              LISTENING       1234',
  '  TCP    127.0.0.1:49999        127.0.0.1:50000        ESTABLISHED     1234',
].join('\r\n');

const SAMPLE_WMIC = [
  'Name=node.exe',
  'ExecutablePath=C:\\Program Files\\nodejs\\node.exe',
  'ProcessId=1234',
  '',
  '',
].join('\r\n');

function createServiceHarness(resolver) {
  const commands = [];
  const module = { exports: {} };
  const fakeRequire = (id) => {
    if (id === 'child_process') {
      return {
        exec: () => { throw new Error('OS execution is forbidden in tests'); },
        execFile: () => { throw new Error('OS execution is forbidden in tests'); },
      };
    }
    if (id === 'util') {
      return {
        promisify: () => async (command, options) => {
          commands.push({ command, options });
          return { stdout: await resolver(command, options) };
        },
      };
    }
    if (id === './portReference') return require('../src/services/portReference');
    if (id === './terminationPolicy') return require('../src/services/terminationPolicy');
    throw new Error('Unexpected module: ' + id);
  };
  vm.runInNewContext(source('src/services/portService.js'), {
    module, exports: module.exports, require: fakeRequire, Buffer, console,
  }, { filename: 'portService.js' });
  return { service: module.exports, commands };
}

function defaultCommands(command) {
  if (command === 'netstat -ano') return SAMPLE_NETSTAT;
  if (command.startsWith('wmic ')) return SAMPLE_WMIC;
  if (command === 'taskkill') return 'SUCCESS';
  throw new Error('Unexpected OS command in test: ' + command);
}

test('discovery: listening TCP endpoints are returned, established TCP is omitted', async () => {
  const { service, commands } = createServiceHarness(defaultCommands);
  const rows = await service.getPorts();

  assert.equal(rows.length, 2);
  assert.deepEqual(Array.from(rows, (row) => row.port), [3000, 3001]);
  assert.ok(rows.every((row) => row.protocol === 'TCP' && row.state === 'LISTENING'));
  assert.ok(rows.every((row) => row.pid === 1234 && row.processName === 'node.exe'));
  assert.ok(rows.every((row) => row.applicationName === 'Node.js'));
  assert.ok(commands.every(({ command }) => !command.startsWith('taskkill')));
});

test('discovery: missing WMIC invokes a name-only tasklist fallback', async () => {
  const { service, commands } = createServiceHarness((command) => {
    if (command === 'netstat -ano') return SAMPLE_NETSTAT;
    if (command.startsWith('wmic ')) throw new Error('wmic missing');
    if (command.startsWith('tasklist ')) return '"node.exe","1234","Console","1","25,440 K"\r\n';
    throw new Error('Unexpected OS command: ' + command);
  });
  const rows = await service.getPorts();
  assert.equal(rows.length, 2);
  assert.ok(rows.every((row) => row.processName === 'node.exe' && row.processPath === ''));
  assert.ok(commands.some(({ command }) => command.startsWith('tasklist ')));
});

test('discovery: missing process data is represented in processName', async () => {
  const { service } = createServiceHarness((command) => {
    if (command === 'netstat -ano') return SAMPLE_NETSTAT;
    if (command.startsWith('wmic ')) return '';
    throw new Error('Unexpected command: ' + command);
  });
  const rows = await service.getPorts();
  assert.ok(rows.every((row) => row.processName === 'Unknown'));
  // Existing applicationName fallback may still show a port-name guess.
  // That misleading presentation is a documented release blocker (PM-A06).
});

test('reference: common port hints are separate from discovered process identity', () => {
  const { getPortInfo, isSystemPid } = require('../src/services/portReference');
  assert.equal(getPortInfo(3000).type, 'development');
  assert.equal(getPortInfo(5432).service, 'PostgreSQL');
  assert.equal(getPortInfo(17342).type, 'unknown');
  assert.equal(isSystemPid(4), true);
  assert.equal(isSystemPid(1234), false);
});

// These are deliberately TODO rather than green assertions of dangerous current behavior.
// Convert each to a passing regression test when its implementation milestone lands.
test.todo('PM-A01: backend refuses protected processes even when invoked directly');
test.todo('PM-A02: execution rechecks process instance identity before termination');
test.todo('PM-A03: preview includes all detected related ports and stop verifies occupancy');
test.todo('PM-A05: bulk stop deduplicates process targets and reports partial failures');
test.todo('PM-A06: unknown executable is never labeled as a verified dev server');
test.todo('PM-A11: strict PID validation rejects malformed values and accepts valid high PIDs');
test.todo('PM-A12: separate local-address bindings remain distinct listener records');
test.todo('PM-A13: metadata lookup is deduplicated and concurrency bounded');

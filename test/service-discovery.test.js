'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { getPorts, getProcessInfo } = require('../src/services/portService');

function deniedError() {
  const error = new Error('Command failed: Access is denied');
  error.stderr = 'ERROR: Access is denied';
  return error;
}

function missingToolError() {
  const error = new Error('spawn powershell.exe ENOENT');
  error.code = 'ENOENT';
  return error;
}

function exitedError(pid) {
  const error = new Error(`Cannot find a process with the process identifier ${pid}`);
  error.stderr = error.message;
  return error;
}

test('discovery metadata: Get-Process lookup returns structured identity without embedding the PID', async () => {
  const calls = [];
  const runner = async (file, args, options) => {
    calls.push({ file, args, options });
    assert.equal(file, 'powershell.exe');
    assert.ok(args.some((arg) => arg.includes('$targetPid=[int]$env:PORT_MANAGER_DISCOVERY_PID')));
    assert.equal(options.env.PORT_MANAGER_DISCOVERY_PID, '1234');
    assert.doesNotMatch(args.join(' '), /1234/);
    return {
      stdout: JSON.stringify({
        id: 1234,
        name: 'node',
        path: 'C:\\Program Files\\nodejs\\node.exe',
        creationTime: '2026-10-31T00:00:00.000Z',
      }),
    };
  };

  const info = await getProcessInfo([1234], runner);

  assert.deepEqual(info.get(1234), {
    name: 'node.exe',
    path: 'C:\\Program Files\\nodejs\\node.exe',
    creationTime: '2026-10-31T00:00:00.000Z',
    metadataStatus: 'available',
    metadataSource: 'Get-Process',
    metadataError: null,
  });
  assert.equal(calls.length, 1);
});

test('discovery: listener PIDs must be canonical positive Windows integers', () => {
  const { parseListenerPid } = require('../src/services/portService');
  assert.equal(parseListenerPid('1234'), 1234);
  assert.equal(parseListenerPid('4294967295'), 4294967295);
  for (const value of ['0', '-1', '123abc', '1.5', '', '4294967296']) {
    assert.equal(parseListenerPid(value), null);
  }
});

test('discovery metadata: access denied is preserved after tasklist fallback fails', async () => {
  const calls = [];
  const runner = async (file, args) => {
    calls.push({ file, args });
    throw deniedError();
  };

  const info = await getProcessInfo([2345], runner);
  const result = info.get(2345);

  assert.equal(result.name, 'Unknown');
  assert.equal(result.metadataStatus, 'permission-denied');
  assert.equal(result.metadataSource, 'Get-Process/tasklist');
  assert.match(result.metadataError, /Access is denied/);
  assert.deepEqual(calls.map(({ file }) => file), ['powershell.exe', 'tasklist.exe']);
});

test('discovery metadata: an empty tasklist does not turn denied metadata into process-exited', async () => {
  const runner = async (file) => {
    if (file === 'powershell.exe') throw deniedError();
    return { stdout: '' };
  };

  const info = await getProcessInfo([2468], runner);
  assert.equal(info.get(2468).metadataStatus, 'permission-denied');
});

test('discovery metadata: unavailable tools are distinguished from denied access', async () => {
  const runner = async () => {
    throw missingToolError();
  };

  const info = await getProcessInfo([3456], runner);
  const result = info.get(3456);

  assert.equal(result.metadataStatus, 'command-unavailable');
  assert.equal(result.name, 'Unknown');
});

test('discovery metadata: missing fallback tool remains command-unavailable', async () => {
  const calls = [];
  const runner = async (file) => {
    calls.push(file);
    throw missingToolError();
  };

  const info = await getProcessInfo([3567], runner);
  assert.equal(info.get(3567).metadataStatus, 'command-unavailable');
  assert.deepEqual(calls, ['powershell.exe', 'tasklist.exe']);
});

test('discovery metadata: a missing process is marked exited without a tasklist retry', async () => {
  const calls = [];
  const runner = async (file, args) => {
    calls.push({ file, args });
    throw exitedError(4567);
  };

  const info = await getProcessInfo([4567], runner);
  const result = info.get(4567);

  assert.equal(result.metadataStatus, 'process-exited');
  assert.equal(result.metadataSource, 'Get-Process');
  assert.equal(calls.length, 1);
});

test('discovery metadata: tasklist remains a name-only fallback when Get-Process is unavailable', async () => {
  const runner = async (file) => {
    if (file === 'powershell.exe') throw missingToolError();
    return { stdout: '"node.exe","5678","Console","1","25,440 K"\r\n' };
  };

  const info = await getProcessInfo([5678], runner);
  assert.deepEqual(info.get(5678), {
    name: 'node.exe',
    path: '',
    creationTime: null,
    metadataStatus: 'partial',
    metadataSource: 'tasklist',
    metadataError: 'Executable path unavailable',
  });
});

test('discovery: netstat listener data is preserved when metadata is denied and port labels stay contextual', async () => {
  const runner = async (file) => {
    if (file === 'netstat.exe') {
      return {
        stdout: '  TCP    127.0.0.1:3000     0.0.0.0:0     LISTENING       6789\r\n',
      };
    }
    throw deniedError();
  };

  const rows = await getPorts({ commandRunner: runner });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].port, 3000);
  assert.equal(rows[0].localAddress, '127.0.0.1:3000');
  assert.equal(rows[0].pid, 6789);
  assert.equal(rows[0].processMetadataStatus, 'permission-denied');
  assert.equal(rows[0].applicationName, 'Unknown process');
  assert.equal(rows[0].portService, 'Dev server');
});

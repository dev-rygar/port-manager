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

  const rows = (await getPorts({ commandRunner: runner })).ports;

  assert.equal(rows.length, 1);
  assert.equal(rows[0].port, 3000);
  assert.equal(rows[0].localAddress, '127.0.0.1:3000');
  assert.equal(rows[0].pid, 6789);
  assert.equal(rows[0].processMetadataStatus, 'permission-denied');
  assert.equal(rows[0].applicationName, 'Unknown process');
  assert.equal(rows[0].portService, 'Dev server');
});

test('discovery: metadata concurrency is capped and deadline returns timeout statuses', async () => {
  let active = 0;
  let maxActive = 0;
  const runner = async (file) => {
    if (file === 'powershell.exe') {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 100));
      active -= 1;
      return { stdout: JSON.stringify({ id: 1, name: 'node', path: 'C:\\node.exe' }) };
    }
    return { stdout: '' };
  };

  const info = await getProcessInfo([1, 2, 3, 4, 5, 6, 7, 8], runner, { deadlineAt: Date.now() + 40 });

  assert.ok(maxActive <= 4);
  assert.equal(info.size, 8);
  assert.ok([...info.values()].some((value) => value.metadataStatus === 'timeout'));
});

test('discovery: listener rows survive a metadata deadline', async () => {
  const runner = async (file) => {
    if (file === 'netstat.exe') return { stdout: 'TCP 127.0.0.1:5173 0.0.0.0:0 LISTENING 4321\r\n' };
    await new Promise((resolve) => setTimeout(resolve, 150));
    return { stdout: JSON.stringify({ id: 4321, name: 'node', path: 'C:\\node.exe' }) };
  };

  const rows = (await getPorts({ commandRunner: runner, deadlineMs: 40 })).ports;

  assert.equal(rows.length, 1);
  assert.equal(rows[0].port, 5173);
  assert.equal(rows[0].processMetadataStatus, 'timeout');
});

test('discovery: failed netstat returns an explicit cannot-determine snapshot', async () => {
  const runner = async () => { throw Object.assign(new Error('netstat timed out'), { code: 'ETIMEDOUT' }); };
  const result = await getPorts({ commandRunner: runner, deadlineMs: 20 });
  assert.equal(result.status, 'cannot-determine');
  assert.deepEqual(result.ports, []);
  assert.equal(result.errorCode, 'ETIMEDOUT');
  assert.match(result.error, /netstat timed out|Discovery deadline exceeded/);
});

test('discovery: the Windows System process name is not rewritten as System.exe', async () => {
  const runner = async (file) => {
    if (file === 'powershell.exe') return { stdout: JSON.stringify({ id: 4, name: 'System', path: 'C:\\Windows\\System32\\ntoskrnl.exe', creationTime: '2026-11-04T00:00:00.000Z' }) };
    throw new Error(`Unexpected command ${file}`);
  };
  const info = await getProcessInfo([4], runner);
  assert.equal(info.get(4).name, 'System');
});

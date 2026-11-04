'use strict';

const crypto = require('crypto');
const net = require('net');
const path = require('path');
const { getTcpSnapshot, getProcessInfo } = require('./portService');
const { validateRequest, sameAddressScope } = require('./portDiagnosticService');
const { assertProcessCanBeStopped, isValidCreationTime } = require('./terminationPolicy');

const PREVIEW_TTL_MS = 30_000;

function isOwnExecutable(info) {
  if (!info || typeof info.path !== 'string' || !info.path.trim() || !process.execPath) return false;
  try {
    return path.resolve(info.path).toLowerCase() === path.resolve(process.execPath).toLowerCase();
  } catch {
    return false;
  }
}

function createWindowsProcessAdapter({
  getSnapshot = getTcpSnapshot,
  lookupProcessInfo = getProcessInfo,
  getProcessRelationships = async (pid, info) => ({
    status: 'unavailable',
    reason: 'Parent and child relationship data is not available from the read-only adapter',
    parent: null,
    descendants: [],
    isSelfOrDescendant: pid === process.pid || isOwnExecutable(info),
  }),
} = {}) {
  return {
    async getSnapshot() {
      return getSnapshot();
    },
    async getProcessInfo(pids) {
      return lookupProcessInfo(pids);
    },
    async getProcessRelationships(pid, info) {
      return getProcessRelationships(pid, info);
    },
  };
}

function endpointFromRow(row) {
  return {
    protocol: row.protocol,
    localAddress: row.localAddress,
    localHost: row.localHost,
    addressFamily: row.addressFamily,
    port: row.port,
    state: row.state,
    pid: row.pid,
  };
}

function bindingKey(binding = {}) {
  return JSON.stringify({
    webContentsId: binding.webContentsId ?? null,
    frameUrl: binding.frameUrl ?? null,
    frameId: binding.frameId ?? null,
    sessionId: binding.sessionId ?? null,
  });
}

function nowIso(clock) {
  return new Date(clock()).toISOString();
}

function tokenFactory() {
  return crypto.randomBytes(32).toString('hex');
}

function makeResult(request, status, reason, clock, details = {}) {
  return {
    ...request,
    status,
    actionable: false,
    checkedAt: nowIso(clock),
    reason,
    ...details,
  };
}

function validateAuthorizationRequest(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Invalid preview authorization request');
  }
  const keys = Object.keys(payload);
  if (keys.length !== 1 || keys[0] !== 'token' || typeof payload.token !== 'string' || payload.token.length < 32) {
    throw new Error('Invalid preview authorization request');
  }
  return { token: payload.token };
}

function compareCandidates(request, row) {
  const requestedFamily = net.isIP(request.localAddress);
  return row.protocol === request.protocol &&
    row.port === request.port &&
    sameAddressScope({ host: request.localAddress, family: requestedFamily }, row);
}

function sortCandidates(request, rows) {
  return [...rows].sort((left, right) => {
    const leftExact = left.localHost === request.localAddress ? 0 : 1;
    const rightExact = right.localHost === request.localAddress ? 0 : 1;
    return leftExact - rightExact || String(left.localAddress).localeCompare(String(right.localAddress));
  });
}

function normalizeRelationships(value) {
  if (!value || typeof value !== 'object') {
    return { status: 'unavailable', parent: null, descendants: [], reason: 'Relationship data unavailable' };
  }
  return {
    status: value.status || 'available',
    parent: value.parent || null,
    descendants: Array.isArray(value.descendants) ? value.descendants : [],
    reason: value.reason || null,
    isSelfOrDescendant: value.isSelfOrDescendant === true,
    informationalOnly: true,
  };
}

function createProcessPreviewService({
  adapter = createWindowsProcessAdapter(),
  clock = () => Date.now(),
  tokenGenerator = tokenFactory,
  ttlMs = PREVIEW_TTL_MS,
} = {}) {
  const previews = new Map();

  function removeExpired() {
    const current = clock();
    for (const [token, preview] of previews) {
      if (preview.expiresAt <= current) previews.delete(token);
    }
  }

  async function previewStop(input, binding) {
    const request = validateRequest(input);
    let snapshot;
    try {
      snapshot = await adapter.getSnapshot();
    } catch (error) {
      return makeResult(request, 'uncertain', 'Cannot determine current TCP listeners; no preview was authorized.', clock, {
        evidenceSource: 'netstat.exe -ano',
        errorCode: error?.code || 'DISCOVERY_FAILED',
        error: error?.message || 'TCP listener discovery failed',
      });
    }

    if (!snapshot || (snapshot.status && snapshot.status !== 'available')) {
      return makeResult(request, 'uncertain', 'Current TCP listener ownership is unknown; no preview was authorized.', clock, {
        evidenceSource: snapshot?.evidenceSource || 'netstat.exe -ano',
        errorCode: snapshot?.errorCode || 'DISCOVERY_UNKNOWN',
        error: snapshot?.error || 'TCP listener discovery returned an unknown state',
      });
    }

    const entries = Array.isArray(snapshot.entries) ? snapshot.entries : [];
    const scoped = sortCandidates(request, entries.filter((row) => compareCandidates(request, row)));
    const listening = scoped.filter((row) => row.state === 'LISTENING');
    const unknownOwner = listening.find((row) => !Number.isInteger(row.pid) || row.pid <= 0);
    if (unknownOwner) {
      return makeResult(request, 'refused', 'The selected listener has no valid stoppable owner (PID 0 or unknown); preview is non-actionable.', clock, {
        evidenceSource: snapshot.evidenceSource || 'netstat.exe -ano',
        selectedEndpoint: endpointFromRow(unknownOwner),
        affectedEndpoints: [],
      });
    }
    if (!listening.length) {
      return makeResult(request, 'uncertain', 'No matching LISTENING socket was observed; a process-instance preview cannot be authorized.', clock, {
        evidenceSource: snapshot.evidenceSource || 'netstat.exe -ano',
        affectedEndpoints: [],
      });
    }

    const ownerPids = new Set(listening.map((row) => row.pid));
    if (ownerPids.size !== 1) {
      return makeResult(request, 'refused', 'More than one process could own the requested address scope; preview is ambiguous and non-actionable.', clock, {
        evidenceSource: snapshot.evidenceSource || 'netstat.exe -ano',
        affectedEndpoints: listening.map(endpointFromRow),
      });
    }

    const selected = listening[0];
    let info;
    try {
      const processMap = await adapter.getProcessInfo([selected.pid]);
      info = processMap?.get ? processMap.get(selected.pid) : processMap?.[selected.pid];
    } catch (error) {
      return makeResult(request, 'refused', 'Process metadata could not be read; process-instance identity is unverifiable.', clock, {
        evidenceSource: snapshot.evidenceSource || 'netstat.exe -ano',
        selectedEndpoint: endpointFromRow(selected),
        metadataStatus: 'unavailable',
        metadataError: error?.message || 'Process metadata lookup failed',
        affectedEndpoints: [],
      });
    }

    if (!info || info.metadataStatus !== 'available' || !isValidCreationTime(info.creationTime) ||
        typeof info.name !== 'string' || !info.name.trim() || typeof info.path !== 'string' || !info.path.trim()) {
      return makeResult(request, 'refused', 'Complete process metadata and creation time are required; process-instance identity is unverifiable.', clock, {
        evidenceSource: snapshot.evidenceSource || 'netstat.exe -ano',
        selectedEndpoint: endpointFromRow(selected),
        metadataStatus: info?.metadataStatus || 'unavailable',
        metadataError: info?.metadataError || 'Process name, executable path or valid creation time unavailable',
        affectedEndpoints: [],
      });
    }

    let relationships;
    try {
      relationships = normalizeRelationships(await adapter.getProcessRelationships(selected.pid, info));
    } catch (error) {
      relationships = normalizeRelationships({ status: 'unavailable', reason: error?.message || 'Relationship lookup failed' });
    }
    if (relationships.isSelfOrDescendant) {
      return makeResult(request, 'refused', 'The selected process is the Electron application or one of its descendants; preview is non-actionable.', clock, {
        evidenceSource: snapshot.evidenceSource || 'netstat.exe -ano',
        selectedEndpoint: endpointFromRow(selected),
        metadataStatus: info.metadataStatus,
        relationships,
        affectedEndpoints: [],
      });
    }

    try {
      assertProcessCanBeStopped({
        pid: selected.pid,
        processName: info.name,
        ownsListeningPort: true,
        metadataStatus: info.metadataStatus,
        creationTime: info.creationTime,
      });
    } catch (error) {
      return makeResult(request, 'refused', error.message, clock, {
        evidenceSource: snapshot.evidenceSource || 'netstat.exe -ano',
        selectedEndpoint: endpointFromRow(selected),
        metadataStatus: info.metadataStatus,
        affectedEndpoints: [],
      });
    }

    const affectedEndpoints = entries
      .filter((row) => row.state === 'LISTENING' && row.protocol === 'TCP' && row.pid === selected.pid)
      .map(endpointFromRow);
    removeExpired();
    const token = tokenGenerator();
    if (typeof token !== 'string' || token.length < 32) throw new Error('Preview token generator returned an invalid token');
    const expiresAt = clock() + Math.max(1, ttlMs);
    const target = {
      pid: selected.pid,
      processName: info.name,
      processPath: info.path || '',
      creationTime: info.creationTime,
      metadataStatus: info.metadataStatus,
      identity: { pid: selected.pid, creationTime: info.creationTime },
    };
    previews.set(token, { binding: bindingKey(binding), expiresAt, target, affectedEndpoints, relationships });

    return makeResult(request, 'preview-ready', 'Read-only impact preview created. Process stopping remains disabled until M1.2 authorization.', clock, {
      evidenceSource: snapshot.evidenceSource || 'netstat.exe -ano',
      preview: { token, expiresAt: new Date(expiresAt).toISOString(), oneTime: true },
      target,
      selectedEndpoint: endpointFromRow(selected),
      affectedEndpoints,
      relationships,
    });
  }

  function authorizePreview(input, binding) {
    const { token } = validateAuthorizationRequest(input);
    removeExpired();
    const preview = previews.get(token);
    if (!preview) {
      return { status: 'stalePreview', actionable: false, reason: 'Preview is unknown, expired, or already used; create a new preview.' };
    }
    if (preview.binding !== bindingKey(binding)) {
      return { status: 'stalePreview', actionable: false, reason: 'Preview belongs to another trusted window or session.' };
    }
    previews.delete(token);
    return {
      status: 'authorized-preview',
      actionable: false,
      reason: 'Preview authorization was consumed for review only. No process termination is implemented or attempted.',
      expiresAt: new Date(preview.expiresAt).toISOString(),
      target: preview.target,
      affectedEndpoints: preview.affectedEndpoints,
      relationships: preview.relationships,
    };
  }

  return { previewStop, authorizePreview };
}

module.exports = {
  PREVIEW_TTL_MS,
  createWindowsProcessAdapter,
  createProcessPreviewService,
  validateAuthorizationRequest,
  endpointFromRow,
};

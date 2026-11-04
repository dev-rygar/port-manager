const { escapeHtml, getProcessActionLabel } = window.PortManagerSafeMarkup;
const tableBody = document.getElementById('table-body');
const searchInput = document.getElementById('search');
const refreshBtn = document.getElementById('refresh');
const loadingEl = document.getElementById('loading');
const errorEl = document.getElementById('error');
const tableWrap = document.getElementById('table-wrap');
const detailsPanel = document.getElementById('details');
const detailsClose = document.getElementById('details-close');
const tabAll = document.getElementById('tab-all');
const tabDev = document.getElementById('tab-dev');
const tabAllContent = document.getElementById('tab-all-content');
const tabDevContent = document.getElementById('tab-dev-content');
const devEmpty = document.getElementById('dev-empty');
const devGroups = document.getElementById('dev-groups');
const checkPortForm = document.getElementById('check-port-form');
const checkPortInput = document.getElementById('check-port');
const checkAddressInput = document.getElementById('check-address');
const diagnosticPanel = document.getElementById('port-diagnostic');
const diagnosticOutcome = document.getElementById('diagnostic-outcome');
const diagnosticTime = document.getElementById('diagnostic-time');
const diagnosticReason = document.getElementById('diagnostic-reason');
const diagnosticEvidence = document.getElementById('diagnostic-evidence');
const diagnosticOwner = document.getElementById('diagnostic-owner');
const probePortBtn = document.getElementById('probe-port');
const alternativePortBtn = document.getElementById('alternative-port');
const copyPortBtn = document.getElementById('copy-port');

const STORAGE_KEY = 'port-manager-tags';
const DEV_TAGS = ['backend', 'frontend', 'database'];
const DESTRUCTIVE_ACTIONS_ENABLED = false;

const TYPE_TOOLTIPS = {
  system: 'Windows or OS core service. Usually safe to leave running.',
  user: 'Your apps or services. Safe to manage.',
  development: 'Dev server (Vite, Next, Node, etc.). Process stopping is disabled until M1.2 instance authorization.',
  common: 'Well-known service (DB, HTTP, Redis, etc.). Check before killing.',
  unknown:
    "Port not in our reference database. Could be: user apps, dynamic Windows ports (49152–65535), or less common services. Check the Application column and click the row for details.",
};

let portsData = [];
let sortColumn = 'port';
let sortAsc = true;
let activeTab = 'all';
let lastDiagnostic = null;

// Tag storage
function getTags() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function setTag(port, tag) {
  const tags = getTags();
  if (tag) {
    if (!DEV_TAGS.includes(tag)) return; // validate against allowed list
    tags[String(port)] = tag;
  } else {
    delete tags[String(port)];
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tags));
}

function getTag(port) {
  return getTags()[String(port)] || null;
}

async function loadPorts() {
  showLoading(true);
  hideError();

  try {
    const snapshot = await window.portManager.getPorts();
    const discovery = Array.isArray(snapshot) ? { status: 'available', ports: snapshot } : snapshot;
    portsData = discovery?.ports || [];
    if (discovery?.status !== 'available') {
      showError(`Cannot determine current listeners: ${discovery?.error || 'TCP discovery failed'}`);
    }
    renderCurrentTab();
  } catch (err) {
    showError(err.message || 'Failed to load ports');
  } finally {
    showLoading(false);
  }
}

function showLoading(show) {
  loadingEl.classList.toggle('hidden', !show);
  if (show) {
    tabAllContent.classList.add('hidden');
    tabDevContent.classList.add('hidden');
  } else {
    tabAllContent.classList.toggle('hidden', activeTab !== 'all');
    tabDevContent.classList.toggle('hidden', activeTab !== 'dev');
    tableWrap.classList.remove('hidden');
  }
}

function showError(msg) {
  errorEl.textContent = msg;
  errorEl.classList.remove('hidden');
}

function hideError() {
  errorEl.classList.add('hidden');
}

function filterPorts(data) {
  const q = searchInput.value.trim().toLowerCase();
  if (!q) return data;
  return data.filter(
    (p) =>
      String(p.port).includes(q) ||
      String(p.pid).includes(q) ||
      (p.portType && p.portType.toLowerCase().includes(q)) ||
      (p.portService && p.portService.toLowerCase().includes(q)) ||
      (p.applicationName && p.applicationName.toLowerCase().includes(q)) ||
      (p.processName && p.processName.toLowerCase().includes(q)) ||
      (p.localAddress && p.localAddress.toLowerCase().includes(q))
  );
}

function sortPorts(data) {
  return [...data].sort((a, b) => {
    let va = a[sortColumn];
    let vb = b[sortColumn];
    if (typeof va === 'number') vb = Number(vb) || 0;
    else {
      va = String(va ?? '');
      vb = String(vb ?? '');
    }
    const cmp = va < vb ? -1 : va > vb ? 1 : 0;
    return sortAsc ? cmp : -cmp;
  });
}

function canRequestStop(process) {
  if (!DESTRUCTIVE_ACTIONS_ENABLED || !process || process.pid === 4 || process.processMetadataStatus !== 'available') return false;
  const name = String(process.processName || '').toLowerCase();
  return !['system', 'system idle process', 'registry', 'smss.exe', 'csrss.exe', 'wininit.exe', 'winlogon.exe', 'lsass.exe', 'lsaiso.exe', 'services.exe', 'svchost.exe', 'dwm.exe', 'sihost.exe', 'fontdrvhost.exe', 'explorer.exe', 'runtimebroker.exe', 'searchhost.exe', 'startmenuexperiencehost.exe', 'spoolsv.exe', 'conhost.exe'].includes(name);
}

function stopButton(process) {
  const disabled = !canRequestStop(process);
  const title = disabled ? 'Stopping is disabled until M1.2 process-instance authorization' : 'Stop this verified process';
  return `<button class="btn btn-danger kill-btn" data-pid="${process.pid}" title="${escapeHtml(title)}" ${disabled ? 'disabled' : ''}>Stop</button>`;
}

function renderTable(data) {
  const filtered = filterPorts(data);
  const sorted = sortPorts(filtered);

  tableBody.innerHTML = sorted
    .map(
      (p) => {
        const tag = getTag(p.port);
        const portType = p.portType || 'unknown';
        const tooltip = p.portType === 'unknown'
          ? TYPE_TOOLTIPS.unknown
          : (p.portDescription || TYPE_TOOLTIPS[portType] || '');
        return `
    <tr class="row-details row-type-${portType}" data-pid="${p.pid}" data-port-type="${portType}">
      <td class="port">${escapeHtml(String(p.port))}</td>
      <td>${escapeHtml(p.protocol)}</td>
      <td><span class="badge badge-${portType}" title="${escapeHtml(tooltip)}">${escapeHtml(portType.charAt(0).toUpperCase() + portType.slice(1))}</span></td>
      <td class="app-name">${escapeHtml(p.applicationName || '—')}</td>
      <td>${escapeHtml(String(p.pid))}</td>
      <td>${escapeHtml(p.localAddress)}</td>
      <td class="tag-cell">
        <div class="tag-dropdown">
          <button class="tag-btn ${tag ? '' : 'untagged'}" data-port="${p.port}" data-pid="${p.pid}">${tag ? tag.charAt(0).toUpperCase() + tag.slice(1) : 'Tag...'}</button>
        </div>
      </td>
      <td>
        ${stopButton(p)}
      </td>
    </tr>
  `;
      }
    )
    .join('');

  document.querySelectorAll('.kill-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (btn.disabled) return;
      const pid = parseInt(btn.dataset.pid, 10);
      const process = portsData.find((item) => item.pid === pid);
      handleKill(pid, getProcessActionLabel(process));
    });
  });

  document.querySelectorAll('.tag-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      showTagMenu(e.currentTarget);
    });
  });

  document.querySelectorAll('.row-details').forEach((row) => {
    row.addEventListener('click', (e) => {
      if (e.target.closest('.kill-btn') || e.target.closest('.tag-dropdown')) return;
      const pid = parseInt(row.dataset.pid, 10);
      const p = data.find((x) => x.pid === pid);
      if (p) showDetails(p);
    });
  });
}

let activeTagMenu = null;

function showTagMenu(btn) {
  if (activeTagMenu) activeTagMenu.remove();
  const port = parseInt(btn.dataset.port, 10);

  const menu = document.createElement('div');
  menu.className = 'tag-menu';
  menu.innerHTML = DEV_TAGS.map(
    (t) => `<button class="tag-menu-item" data-tag="${t}">${t.charAt(0).toUpperCase() + t.slice(1)}</button>`
  ).join('') + '<button class="tag-menu-item remove" data-tag="">Remove tag</button>';

  const rect = btn.getBoundingClientRect();
  menu.style.position = 'fixed';
  menu.style.left = rect.left + 'px';
  menu.style.top = rect.bottom + 4 + 'px';

  const onClick = (e) => {
    const tag = e.target.dataset.tag || null;
    setTag(port, tag || null);
    renderCurrentTab();
    menu.remove();
    activeTagMenu = null;
    document.removeEventListener('click', closeMenu);
  };

  const closeMenu = () => {
    menu.remove();
    activeTagMenu = null;
    document.removeEventListener('click', closeMenu);
  };

  menu.querySelectorAll('.tag-menu-item').forEach((item) => {
    item.addEventListener('click', onClick);
  });

  document.body.appendChild(menu);
  activeTagMenu = menu;
  setTimeout(() => document.addEventListener('click', closeMenu), 0);
}

function renderDevTab() {
  const tags = getTags();
  const taggedPorts = {};
  DEV_TAGS.forEach((t) => (taggedPorts[t] = []));

  for (const p of portsData) {
    const tag = getTag(p.port);
    if (tag && taggedPorts[tag]) {
      taggedPorts[tag].push(p);
    }
  }

  const hasAny = DEV_TAGS.some((t) => taggedPorts[t].length > 0);

  if (!hasAny) {
    devEmpty.classList.remove('hidden');
    devGroups.innerHTML = '';
    return;
  }

  devEmpty.classList.add('hidden');
  devGroups.innerHTML = DEV_TAGS.map((tag) => {
    const items = taggedPorts[tag];
    if (items.length === 0) return '';

    const pids = items.map((i) => i.pid);
    const canStopAll = items.every(canRequestStop);
    return `
      <div class="dev-group" data-tag="${tag}">
        <div class="dev-group-header">
          <h3 class="dev-group-title">${tag.charAt(0).toUpperCase() + tag.slice(1)}</h3>
          <button class="btn btn-danger kill-all-btn" data-pids="${pids.join(',')}" data-tag="${tag}" ${canStopAll ? '' : 'disabled'} title="${canStopAll ? 'Stop verified processes in this group' : 'Stopping is disabled until M1.2 process-instance authorization'}">Stop all ${tag.charAt(0).toUpperCase() + tag.slice(1)}</button>
        </div>
        <div class="dev-group-items">
          ${items
            .map(
              (p) => `
            <div class="dev-group-item" data-pid="${p.pid}">
              <span class="dev-group-item-info">
                <span class="port">${p.port}</span>
                ${escapeHtml(p.applicationName || '—')} · PID ${p.pid}
              </span>
              ${stopButton(p)}
            </div>
          `
            )
            .join('')}
        </div>
      </div>
    `;
  }).join('');

  devGroups.querySelectorAll('.kill-all-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const pids = btn.dataset.pids.split(',').map((x) => parseInt(x, 10)).filter(Boolean);
      handleKillAll(pids, btn.dataset.tag);
    });
  });

  devGroups.querySelectorAll('.kill-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (btn.disabled) return;
      const pid = parseInt(btn.dataset.pid, 10);
      const process = portsData.find((item) => item.pid === pid);
      handleKill(pid, getProcessActionLabel(process));
    });
  });

  devGroups.querySelectorAll('.dev-group-item').forEach((row) => {
    row.addEventListener('click', (e) => {
      if (e.target.closest('.kill-btn')) return;
      const pid = parseInt(row.dataset.pid, 10);
      const p = portsData.find((x) => x.pid === pid);
      if (p) showDetails(p);
    });
  });
}

function renderCurrentTab() {
  if (activeTab === 'all') {
    tabAllContent.classList.remove('hidden');
    tabDevContent.classList.add('hidden');
    renderTable(portsData);
  } else {
    tabAllContent.classList.add('hidden');
    tabDevContent.classList.remove('hidden');
    renderDevTab();
  }
}

function metadataStatusLabel(status) {
  return {
    available: 'Available',
    partial: 'Partial (name only)',
    'permission-denied': 'Unavailable (permission denied)',
    'command-unavailable': 'Unavailable (tool missing)',
    'process-exited': 'Process exited or was not found',
    unavailable: 'Unavailable',
  }[status] || 'Unavailable';
}

function showDetails(p) {
  document.getElementById('detail-app').textContent = p.applicationName || '—';
  document.getElementById('detail-name').textContent = p.processName || '—';
  document.getElementById('detail-pid').textContent = p.pid;
  document.getElementById('detail-port').textContent = p.port;
  document.getElementById('detail-desc').textContent = p.portDescription || '—';
  document.getElementById('detail-path').textContent = p.processPath || '(not available)';
  document.getElementById('detail-meta').textContent = metadataStatusLabel(p.processMetadataStatus);
  const detailLocal = document.getElementById('detail-local');
  if (detailLocal) detailLocal.textContent = p.localAddress || '(not available)';
  const detailIdentity = document.getElementById('detail-identity');
  if (detailIdentity) detailIdentity.textContent = p.processMetadataStatus === 'available' ? 'Metadata available; stopping disabled until M1.2 instance authorization' : 'Not verified; stopping disabled';
  detailsPanel.classList.remove('hidden');
}

function hideDetails() {
  detailsPanel.classList.add('hidden');
}

function diagnosticRequest() {
  const port = Number(checkPortInput.value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Enter a port number from 1 to 65535.');
  return { port, protocol: 'TCP', localAddress: checkAddressInput.value || '127.0.0.1' };
}

function renderDiagnostic(result) {
  lastDiagnostic = result;
  diagnosticPanel.classList.remove('hidden');
  diagnosticOutcome.textContent = result.outcome || 'Cannot determine';
  diagnosticTime.textContent = result.checkedAt ? new Date(result.checkedAt).toLocaleTimeString() : '';
  diagnosticReason.textContent = result.reason || 'No additional explanation was provided.';
  const endpoint = document.getElementById('diagnostic-endpoint');
  if (endpoint) endpoint.textContent = result.listener
    ? `TCP ${result.listener.localAddress || `${result.localAddress}:${result.listener.port || result.port}`}${result.listener.pid ? ` (PID ${result.listener.pid})` : ''}`
    : '';
  diagnosticEvidence.textContent = result.evidenceSource || 'No evidence source available';
  const context = document.getElementById('diagnostic-context');
  if (context) {
    const nonListening = result.context?.nonListening?.map((entry) => `${entry.state} at ${entry.localAddress}`).join(', ');
    const excluded = result.context?.excludedRanges;
    const excludedText = excluded?.status === 'available' && excluded.ranges?.length
      ? `Excluded-range context: ${excluded.ranges.map((range) => `${range.start}-${range.end}`).join(', ')}`
      : excluded?.status === 'unavailable' ? 'Excluded-range context unavailable.' : '';
    context.textContent = [nonListening ? `Non-listening context: ${nonListening}` : '', excludedText].filter(Boolean).join(' ');
  }
  diagnosticOwner.classList.add('hidden');
  diagnosticOwner.textContent = '';
  if (result.process && result.process.metadataStatus === 'available') {
    diagnosticOwner.textContent = `Owner metadata available for this snapshot: ${result.process.name || 'Unknown'}${result.listener?.pid ? ` (PID ${result.listener.pid})` : ''}. Stopping is disabled until M1.2 instance authorization.`;
    diagnosticOwner.classList.remove('hidden');
  } else if (result.outcome === 'Listening') {
    diagnosticOwner.textContent = 'A listener was observed, but its process identity could not be verified.';
    diagnosticOwner.classList.remove('hidden');
  }
  probePortBtn.classList.toggle('hidden', result.outcome === 'Available at check time');
  copyPortBtn.classList.add('hidden');
}

async function handleCheckPort(event) {
  event.preventDefault();
  try {
    const result = await window.portManager.checkPort(diagnosticRequest());
    renderDiagnostic(result);
  } catch (err) {
    showError(err.message || 'Unable to check the port');
  }
}

async function handleProbePort() {
  try {
    const result = await window.portManager.probePort(diagnosticRequest());
    renderDiagnostic(result);
    if (result.outcome === 'Available at check time') {
      copyPortBtn.classList.remove('hidden');
      copyPortBtn.dataset.port = String(result.port);
    }
  } catch (err) {
    showError(err.message || 'Unable to run the temporary bind probe');
  }
}

async function handleAlternativePort() {
  alternativePortBtn.disabled = true;
  try {
    const result = await window.portManager.findAlternativePort(diagnosticRequest());
    if (result.candidate) {
      renderDiagnostic(result.candidate);
      diagnosticReason.textContent = `${result.candidate.guidance} Available at check time only.`;
      copyPortBtn.classList.remove('hidden');
      copyPortBtn.dataset.port = String(result.candidate.port);
    } else {
      renderDiagnostic({ ...result, reason: 'No candidate could be established during the bounded search.' });
    }
  } catch (err) {
    showError(err.message || 'Unable to find an alternative port');
  } finally {
    alternativePortBtn.disabled = false;
  }
}

async function copyDiagnosticPort() {
  const port = copyPortBtn.dataset.port;
  if (!port || !navigator.clipboard) return;
  await navigator.clipboard.writeText(port);
  copyPortBtn.textContent = 'Copied';
  setTimeout(() => { copyPortBtn.textContent = 'Copy port'; }, 1200);
}

async function handleKill(pid, processName) {
  const p = portsData.find((x) => x.pid === pid);
  const isSystem = p?.portType === 'system';
  const warn = isSystem ? '\n\n⚠️ This appears to be a SYSTEM process. Killing it may cause instability.' : '';
  const confirmed = confirm(
    `Kill process "${processName}" (PID ${pid})?\n\nThis will force-terminate the application.${warn}`
  );
  if (!confirmed) return;

  try {
    await window.portManager.killProcess(pid);
    await loadPorts();
    hideDetails();
  } catch (err) {
    alert('Failed to kill process: ' + (err.message || 'Unknown error'));
  }
}

async function handleKillAll(pids, tag) {
  const label = tag.charAt(0).toUpperCase() + tag.slice(1);
  const confirmed = confirm(
    `Kill all ${label} ports (${pids.length} process${pids.length > 1 ? 'es' : ''})?\n\nThis will force-terminate the applications.`
  );
  if (!confirmed) return;

  try {
    for (const pid of pids) {
      try {
        await window.portManager.killProcess(pid);
      } catch (e) {
        console.warn('Failed to kill PID', pid, e);
      }
    }
    await loadPorts();
    hideDetails();
  } catch (err) {
    alert('Failed to kill processes: ' + (err.message || 'Unknown error'));
  }
}

// Tab switching
tabAll.addEventListener('click', () => {
  activeTab = 'all';
  tabAll.classList.add('active');
  tabDev.classList.remove('active');
  renderCurrentTab();
});

tabDev.addEventListener('click', () => {
  activeTab = 'dev';
  tabDev.classList.add('active');
  tabAll.classList.remove('active');
  renderCurrentTab();
});

// Sort handlers
document.querySelectorAll('.port-table th[data-sort]').forEach((th) => {
  th.addEventListener('click', () => {
    const col = th.dataset.sort;
    if (sortColumn === col) sortAsc = !sortAsc;
    else {
      sortColumn = col;
      sortAsc = true;
    }
    renderTable(portsData);
  });
});

searchInput.addEventListener('input', () => renderCurrentTab());
refreshBtn.addEventListener('click', loadPorts);
detailsClose.addEventListener('click', hideDetails);
checkPortForm.addEventListener('submit', handleCheckPort);
probePortBtn.addEventListener('click', handleProbePort);
alternativePortBtn.addEventListener('click', handleAlternativePort);
copyPortBtn.addEventListener('click', copyDiagnosticPort);

loadPorts();

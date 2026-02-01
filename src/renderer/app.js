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

const STORAGE_KEY = 'port-manager-tags';
const DEV_TAGS = ['backend', 'frontend', 'database'];

const TYPE_TOOLTIPS = {
  system: 'Windows or OS core service. Usually safe to leave running.',
  user: 'Your apps or services. Safe to manage.',
  development: 'Dev server (Vite, Next, Node, etc.). Safe to kill when not coding.',
  common: 'Well-known service (DB, HTTP, Redis, etc.). Check before killing.',
  unknown:
    "Port not in our reference database. Could be: user apps, dynamic Windows ports (49152–65535), or less common services. Check the Application column and click the row for details.",
};

let portsData = [];
let sortColumn = 'port';
let sortAsc = true;
let activeTab = 'all';

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
    portsData = await window.portManager.getPorts();
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
        <button class="btn btn-danger kill-btn" data-pid="${p.pid}" data-name="${escapeHtml(p.applicationName || p.processName)}">Kill</button>
      </td>
    </tr>
  `;
      }
    )
    .join('');

  document.querySelectorAll('.kill-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      handleKill(parseInt(btn.dataset.pid, 10), btn.dataset.name);
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
    return `
      <div class="dev-group" data-tag="${tag}">
        <div class="dev-group-header">
          <h3 class="dev-group-title">${tag.charAt(0).toUpperCase() + tag.slice(1)}</h3>
          <button class="btn btn-danger kill-all-btn" data-pids="${pids.join(',')}" data-tag="${tag}">Kill all ${tag.charAt(0).toUpperCase() + tag.slice(1)}</button>
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
              <button class="btn btn-danger kill-btn" data-pid="${p.pid}" data-name="${escapeHtml(p.applicationName || p.processName)}">Kill</button>
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
      handleKill(parseInt(btn.dataset.pid, 10), btn.dataset.name);
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

function escapeHtml(s) {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

function showDetails(p) {
  document.getElementById('detail-app').textContent = p.applicationName || '—';
  document.getElementById('detail-name').textContent = p.processName || '—';
  document.getElementById('detail-pid').textContent = p.pid;
  document.getElementById('detail-port').textContent = p.port;
  document.getElementById('detail-desc').textContent = p.portDescription || '—';
  document.getElementById('detail-path').textContent = p.processPath || '(not available)';
  detailsPanel.classList.remove('hidden');
}

function hideDetails() {
  detailsPanel.classList.add('hidden');
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

loadPorts();

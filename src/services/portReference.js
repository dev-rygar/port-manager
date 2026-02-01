/**
 * Well-known port reference: port number → type, service name, and description.
 * Color coding: system=slate, user=blue, development=violet, common=amber, unknown=zinc
 */
const WELL_KNOWN_PORTS = {
  // === SYSTEM (OS/Windows/Kernel) - Slate ===
  135: { type: 'system', service: 'RPC Endpoint Mapper', description: 'Windows remote procedure call – core system service' },
  139: { type: 'system', service: 'NetBIOS', description: 'NetBIOS session service – file/print sharing' },
  445: { type: 'system', service: 'SMB', description: 'SMB / File sharing – Windows file sharing' },
  5000: { type: 'system', service: 'UPnP', description: 'SSDP / UPnP discovery – network device discovery' },
  5040: { type: 'system', service: 'Diagnostic', description: 'Windows diagnostic service' },
  5357: { type: 'system', service: 'WSDAPI', description: 'Web Services Dynamic Discovery' },
  5426: { type: 'system', service: 'Sync Host', description: 'Windows Sync Host – OneDrive, Settings sync' },
  7680: { type: 'system', service: 'Delivery Opt.', description: 'Windows Delivery Optimization' },
  49664: { type: 'system', service: 'RPC', description: 'Windows RPC dynamic port' },
  49665: { type: 'system', service: 'RPC', description: 'Windows RPC dynamic port' },
  49666: { type: 'system', service: 'RPC', description: 'Windows RPC dynamic port' },
  49667: { type: 'system', service: 'RPC', description: 'Windows RPC dynamic port' },
  49668: { type: 'system', service: 'RPC', description: 'Windows RPC dynamic port' },
  49669: { type: 'system', service: 'RPC', description: 'Windows RPC dynamic port' },
  49670: { type: 'system', service: 'RPC', description: 'Windows RPC dynamic port' },

  // === DEVELOPMENT (Hot reload, Vite, Next, Node dev) - Violet ===
  3000: { type: 'development', service: 'Dev server', description: 'React, Node, Next.js dev server' },
  3001: { type: 'development', service: 'Dev server', description: 'Dev server (alt)' },
  4200: { type: 'development', service: 'Angular', description: 'Angular dev server' },
  5173: { type: 'development', service: 'Vite', description: 'Vite dev server' },
  5174: { type: 'development', service: 'Vite', description: 'Vite dev server (alt)' },
  8080: { type: 'development', service: 'HTTP Alt', description: 'Alternate HTTP / dev server' },
  8000: { type: 'development', service: 'Python', description: 'Python / Django dev server' },
  9229: { type: 'development', service: 'Node debug', description: 'Node.js inspector/debug' },

  // === COMMON (Postgres, Redis, MySQL, Docker, etc.) - Amber ===
  80: { type: 'common', service: 'HTTP', description: 'Web server (HTTP)' },
  443: { type: 'common', service: 'HTTPS', description: 'Web server (HTTPS)' },
  27017: { type: 'common', service: 'MongoDB', description: 'MongoDB database' },
  3306: { type: 'common', service: 'MySQL', description: 'MySQL database' },
  5432: { type: 'common', service: 'PostgreSQL', description: 'PostgreSQL database' },
  1433: { type: 'common', service: 'SQL Server', description: 'SQL Server database' },
  6379: { type: 'common', service: 'Redis', description: 'Redis cache' },
};

/** System PIDs that are critical (e.g. PID 4 = System) */
const SYSTEM_PIDS = new Set([4]);

/** Process names that indicate system services */
const SYSTEM_PROCESS_NAMES = {
  'System': 'Windows System',
  'svchost.exe': 'Windows Service Host',
  'services.exe': 'Windows Services',
  'lsass.exe': 'Local Security Authority',
  'wininit.exe': 'Windows Initialization',
  'csrss.exe': 'Client/Server Runtime',
  'winlogon.exe': 'Windows Logon',
  'dwm.exe': 'Desktop Window Manager',
  'RuntimeBroker.exe': 'Windows Runtime Broker',
  'SearchHost.exe': 'Windows Search',
  'StartMenuExperienceHost.exe': 'Start Menu',
  'SystemSettings.exe': 'Windows Settings',
  'RpcEptMapper': 'RPC Endpoint Mapper',
  'RpcEptMapper.exe': 'RPC Endpoint Mapper',
  'DcomLaunch': 'DCOM Server Process Launcher',
  'DcomLaunch.exe': 'DCOM Server Process Launcher',
  'spoolsv.exe': 'Print Spooler',
  'wuauclt.exe': 'Windows Update',
  'WmiPrvSE.exe': 'WMI Provider Host',
};

function getPortInfo(port) {
  return WELL_KNOWN_PORTS[port] || { type: 'unknown', service: null, description: null };
}

function getFriendlyProcessName(processName) {
  return SYSTEM_PROCESS_NAMES[processName] || null;
}

function isSystemPid(pid) {
  return SYSTEM_PIDS.has(pid);
}

/** Fallback app name when process name is empty (e.g. PID 4) */
function getFallbackAppName(pid, processName) {
  const hasName = processName && processName.trim() && processName !== 'Unknown';
  if (hasName) return null;
  if (pid === 4) return 'Windows System';
  return null;
}

module.exports = { getPortInfo, getFriendlyProcessName, isSystemPid, getFallbackAppName };

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');
const { assertTrustedIpcSender } = require('./src/services/ipcSecurity');
const { parseProcessId, assertDestructiveActionsEnabled } = require('./src/services/terminationPolicy');
const { getPorts, killProcess } = require('./src/services/portService');
const { validateRequest, checkPort, probePort, findAlternativePort } = require('./src/services/portDiagnosticService');
const { createProcessPreviewService } = require('./src/services/processPreviewService');

let mainWindow;
let documentEpoch = 0;
const rendererPath = path.join(__dirname, 'src', 'renderer', 'index.html');
const rendererUrl = pathToFileURL(rendererPath).href;
const processPreviewService = createProcessPreviewService();

function invalidatePreviewDocument() {
  documentEpoch += 1;
  processPreviewService.invalidateAllPreviews();
}

function createDiagnosticRequest(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Invalid diagnostic request');
  }
  const validated = validateRequest({
    port: payload.port,
    protocol: payload.protocol,
    localAddress: payload.localAddress,
  });
  return { port: validated.port, protocol: validated.protocol, localAddress: validated.localAddress };
}

function createPreviewAuthorizationRequest(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Invalid preview authorization request');
  const keys = Object.keys(payload);
  if (keys.length !== 1 || keys[0] !== 'token' || typeof payload.token !== 'string' || payload.token.length < 32) {
    throw new Error('Invalid preview authorization request');
  }
  return { token: payload.token };
}

function trustedPreviewBinding() {
  return {
    webContentsId: mainWindow?.webContents?.id ?? 'main-window',
    sessionId: mainWindow?.webContents?.session?.id ?? 'main-session',
    frameId: mainWindow?.webContents?.mainFrame?.routingId ?? null,
    frameUrl: rendererUrl,
    documentEpoch,
  };
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 600,
    minWidth: 700,
    minHeight: 400,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
    show: false,
  });

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.on('closed', () => {
    invalidatePreviewDocument();
    mainWindow = null;
  });
  // A main-frame navigation includes same-URL reloads. New documents cannot reuse preview tokens.
  mainWindow.webContents.on('did-start-navigation', (_event, _url, _isInPlace, isMainFrame) => {
    if (isMainFrame !== false) invalidatePreviewDocument();
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url !== rendererUrl) event.preventDefault();
  });
  mainWindow.loadFile(rendererPath);
  mainWindow.once('ready-to-show', () => mainWindow.show());
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// IPC handlers
ipcMain.handle('ports:get', async (event) => {
  assertTrustedIpcSender(event, mainWindow, rendererUrl);
  try {
    return await getPorts();
  } catch (err) {
    console.error('Failed to get ports:', err);
    throw err;
  }
});

ipcMain.handle('ports:kill', async (event, pid) => {
  assertTrustedIpcSender(event, mainWindow, rendererUrl);
  const validatedPid = parseProcessId(pid);
  assertDestructiveActionsEnabled();
  try {
    return await killProcess(validatedPid);
  } catch (err) {
    console.error('Failed to kill process:', err);
    throw err;
  }
});

ipcMain.handle('ports:check', async (event, request) => {
  assertTrustedIpcSender(event, mainWindow, rendererUrl);
  return checkPort(createDiagnosticRequest(request));
});

ipcMain.handle('ports:probe', async (event, request) => {
  assertTrustedIpcSender(event, mainWindow, rendererUrl);
  return probePort(createDiagnosticRequest(request));
});

ipcMain.handle('ports:alternative', async (event, request) => {
  assertTrustedIpcSender(event, mainWindow, rendererUrl);
  return findAlternativePort(createDiagnosticRequest(request));
});

ipcMain.handle('ports:preview', async (event, request) => {
  assertTrustedIpcSender(event, mainWindow, rendererUrl);
  return processPreviewService.previewStop(createDiagnosticRequest(request), trustedPreviewBinding());
});

ipcMain.handle('ports:authorize-preview', async (event, payload) => {
  assertTrustedIpcSender(event, mainWindow, rendererUrl);
  return processPreviewService.authorizePreview(createPreviewAuthorizationRequest(payload), trustedPreviewBinding());
});

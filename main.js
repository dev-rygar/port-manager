const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');
const { assertTrustedIpcSender } = require('./src/services/ipcSecurity');
const { parseProcessId } = require('./src/services/terminationPolicy');
const { getPorts, killProcess } = require('./src/services/portService');

let mainWindow;
const rendererPath = path.join(__dirname, 'src', 'renderer', 'index.html');
const rendererUrl = pathToFileURL(rendererPath).href;

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
  try {
    return await killProcess(validatedPid);
  } catch (err) {
    console.error('Failed to kill process:', err);
    throw err;
  }
});

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { getPorts, killProcess } = require('./src/services/portService');

let mainWindow;

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
    },
    show: false,
  });

  mainWindow.loadFile(path.join(__dirname, 'src', 'renderer', 'index.html'));
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
ipcMain.handle('ports:get', async () => {
  try {
    return await getPorts();
  } catch (err) {
    console.error('Failed to get ports:', err);
    throw err;
  }
});

ipcMain.handle('ports:kill', async (_, pid) => {
  try {
    return await killProcess(pid);
  } catch (err) {
    console.error('Failed to kill process:', err);
    throw err;
  }
});

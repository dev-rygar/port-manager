const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('portManager', {
  getPorts: () => ipcRenderer.invoke('ports:get'),
  killProcess: (pid) => ipcRenderer.invoke('ports:kill', pid),
  checkPort: (request) => ipcRenderer.invoke('ports:check', request),
  probePort: (request) => ipcRenderer.invoke('ports:probe', request),
  findAlternativePort: (request) => ipcRenderer.invoke('ports:alternative', request),
});

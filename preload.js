const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('portManager', {
  getPorts: () => ipcRenderer.invoke('ports:get'),
  killProcess: (pid) => ipcRenderer.invoke('ports:kill', pid),
});

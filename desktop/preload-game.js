'use strict';
// What the game page can ask of the desktop app. The game reads window.ROBOBLOCKS before it starts.
const { contextBridge, ipcRenderer } = require('electron');
const info = ipcRenderer.sendSync('host-info') || {};
contextBridge.exposeInMainWorld('ROBOBLOCKS', {
  desktop: true,
  server: info.server || '',
  version: info.version || '',
  launcher: info.launcher || '',
  platform: info.platform || '',
  setServer: url => ipcRenderer.invoke('set-server', String(url || '')),
  restart: () => ipcRenderer.invoke('restart-game'),
  quit: () => ipcRenderer.invoke('quit-app'),
  openExternal: url => ipcRenderer.invoke('open-external', String(url || '')),
  onUpdate: cb => { if (typeof cb === 'function') ipcRenderer.on('update-ready', (_e, v) => cb(String(v))); },
});

'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('launcher', {
  state: () => ipcRenderer.invoke('get-state'),
  check: () => ipcRenderer.invoke('check'),
  play: () => ipcRenderer.invoke('play'),
  setConfig: patch => ipcRenderer.invoke('set-config', patch),
  installLauncherUpdate: () => ipcRenderer.invoke('install-launcher-update'),
  open: url => ipcRenderer.invoke('open-external', String(url || '')),
  on: (ch, cb) => { if (['status', 'news', 'self-update'].includes(ch) && typeof cb === 'function') ipcRenderer.on(ch, (_e, d) => cb(d)); },
});

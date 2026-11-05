const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('pywebview', { api: {
  export_sheet: (rows, filename) => ipcRenderer.invoke('domex:export-sheet', rows, filename),
  get_version: () => ipcRenderer.invoke('domex:version'),
} });
window.addEventListener('DOMContentLoaded', () => window.dispatchEvent(new Event('pywebviewready')));

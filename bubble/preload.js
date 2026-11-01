// Minimal bridge for the bubble window. The bubble only sends commands;
// it has no access to Messenger or to Node.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('bubble', {
  click: () => ipcRenderer.send('bubble:click'),
  move: (pos) => ipcRenderer.send('bubble:move', pos),
  dragEnd: () => ipcRenderer.send('bubble:drag-end'),
  contextMenu: () => ipcRenderer.send('bubble:context-menu'),
  onBadge: (callback) => ipcRenderer.on('bubble:badge', (_e, text) => callback(text)),
  onHideZone: (callback) => ipcRenderer.on('bubble:hide-zone', (_e, inZone) => callback(inZone))
});

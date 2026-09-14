const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('liveshareDesktop', {
  navigate: url => ipcRenderer.invoke('browser:navigate', url),
  back: () => ipcRenderer.invoke('browser:go-back'),
  forward: () => ipcRenderer.invoke('browser:go-forward'),
  reload: () => ipcRenderer.invoke('browser:reload'),
  getUrl: () => ipcRenderer.invoke('browser:get-url'),
  scrollTo: (x, y) => ipcRenderer.invoke('browser:scroll-to', { x, y }),
  openExternal: url => ipcRenderer.invoke('browser:open-external', url),
  onNavigation: callback => { const h = (_e,p) => callback(p); ipcRenderer.on('browser:navigation',h); return () => ipcRenderer.removeListener('browser:navigation',h); },
  onLocalNavigation: callback => { const h = (_e,p) => callback(p); ipcRenderer.on('browser:local-navigation',h); return () => ipcRenderer.removeListener('browser:local-navigation',h); },
  onReady: callback => { const h = (_e,p) => callback(p); ipcRenderer.on('desktop:ready',h); return () => ipcRenderer.removeListener('desktop:ready',h); }
});

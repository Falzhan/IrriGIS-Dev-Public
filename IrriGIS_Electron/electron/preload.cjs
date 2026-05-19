const { contextBridge, ipcRenderer } = require('electron')

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // App info
  getAppVersion: () => ipcRenderer.invoke('app:get-version'),
  getPlatform: () => ipcRenderer.invoke('app:get-platform'),
  isDev: () => ipcRenderer.invoke('app:is-dev'),
  
  // Environment variables
  getEnvVar: (key, defaultValue) => ipcRenderer.invoke('env:get-var', key, defaultValue),
  
  // Shell operations
  openExternal: (url) => ipcRenderer.invoke('shell:open-external', url),
  
  // Window state listeners
  onWindowStateChange: (callback) => {
    ipcRenderer.on('window-state-changed', (event, state) => callback(state))
  },
  
  // Remove listeners
  removeAllListeners: (channel) => {
    ipcRenderer.removeAllListeners(channel)
  }
})

// Expose a flag to detect if running in Electron
contextBridge.exposeInMainWorld('isElectron', true)

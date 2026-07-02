import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type { PmgApi } from './index.d'

// Typed PMG file API backed by src/main/ipc.ts handlers.
const api: PmgApi = {
  openPmg: () => ipcRenderer.invoke('pmg:openDialog'),
  savePmg: (path, data) => ipcRenderer.invoke('pmg:save', path, data),
  savePmgAs: (defaultName, data) => ipcRenderer.invoke('pmg:saveDialog', defaultName, data)
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}

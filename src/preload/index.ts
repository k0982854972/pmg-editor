import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type { ExportApi, FxApi, FxTextureApi, PmgApi } from './index.d'

// Typed PMG + FX file API backed by src/main/ipc.ts, src/main/fxIpc.ts and
// src/main/textureIpc.ts handlers.
const api: PmgApi & FxApi & ExportApi & FxTextureApi = {
  openPmg: () => ipcRenderer.invoke('pmg:openDialog'),
  openPmgPath: (path) => ipcRenderer.invoke('pmg:openPath', path),
  savePmg: (path, data) => ipcRenderer.invoke('pmg:save', path, data),
  savePmgAs: (defaultName, data) => ipcRenderer.invoke('pmg:saveDialog', defaultName, data),
  openFx: () => ipcRenderer.invoke('fx:openDialog'),
  openFxPath: (path) => ipcRenderer.invoke('fx:openPath', path),
  saveFx: (path, data) => ipcRenderer.invoke('fx:save', path, data),
  saveFxAs: (defaultName, data) => ipcRenderer.invoke('fx:saveDialog', defaultName, data),
  exportObj: (defaultName, obj, mtl) =>
    ipcRenderer.invoke('export:objDialog', defaultName, obj, mtl),
  exportGlb: (defaultName, data) => ipcRenderer.invoke('export:glbDialog', defaultName, data),
  readFxTexture: (dataRoot, textureName) =>
    ipcRenderer.invoke('fx:readTexture', dataRoot, textureName)
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

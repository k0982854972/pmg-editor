import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type {
  AniApi,
  DdsApi,
  EffectIndexApi,
  ExportApi,
  FrmApi,
  FxApi,
  FxTextureApi,
  PmgApi
} from './index.d'

// Typed PMG + FX + DDS + ANI + FRM file API backed by src/main/ipc.ts,
// src/main/fxIpc.ts, src/main/textureIpc.ts, src/main/ddsIpc.ts,
// src/main/aniIpc.ts, src/main/frmIpc.ts and src/main/effectIndexIpc.ts
// handlers.
const api: PmgApi & FxApi & ExportApi & FxTextureApi & DdsApi & AniApi & FrmApi & EffectIndexApi = {
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
    ipcRenderer.invoke('fx:readTexture', dataRoot, textureName),
  pickFxDataRoot: () => ipcRenderer.invoke('fx:pickDataRoot'),
  openDds: () => ipcRenderer.invoke('dds:openDialog'),
  openDdsPath: (path) => ipcRenderer.invoke('dds:openPath', path),
  saveDds: (path, data) => ipcRenderer.invoke('dds:save', path, data),
  saveDdsAs: (defaultName, data) => ipcRenderer.invoke('dds:saveDialog', defaultName, data),
  importPng: () => ipcRenderer.invoke('dds:importPngDialog'),
  exportPng: (defaultName, data) => ipcRenderer.invoke('dds:exportPngDialog', defaultName, data),
  openAni: () => ipcRenderer.invoke('ani:openDialog'),
  openAniPath: (path) => ipcRenderer.invoke('ani:openPath', path),
  openFrm: () => ipcRenderer.invoke('frm:openDialog'),
  openFrmPath: (path) => ipcRenderer.invoke('frm:openPath', path),
  buildEffectIndex: (dataRoot) => ipcRenderer.invoke('fx:buildEffectIndex', dataRoot)
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

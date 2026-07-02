/**
 * PMG file IPC: open dialog + read, save, save-as.
 * Consumed by src/preload/index.ts (window.api) and registered from src/main/index.ts.
 */
import { dialog, ipcMain } from 'electron'
import { readFile, writeFile } from 'fs/promises'

const PMG_FILE_FILTERS = [{ name: 'PMG 模型檔', extensions: ['pmg'] }]

export interface OpenPmgResult {
  readonly path: string
  readonly data: Uint8Array
}

function validateSaveArgs(path: unknown, data: unknown): { path: string; data: Uint8Array } {
  if (typeof path !== 'string' || path.length === 0) {
    throw new TypeError('pmg:save expects a non-empty file path')
  }
  if (!(data instanceof Uint8Array)) {
    throw new TypeError('pmg:save expects file data as Uint8Array')
  }
  return { path, data }
}

export function registerPmgIpc(): void {
  ipcMain.handle('pmg:openDialog', async (): Promise<OpenPmgResult | null> => {
    const result = await dialog.showOpenDialog({
      title: '開啟 PMG 檔案',
      filters: PMG_FILE_FILTERS,
      properties: ['openFile']
    })
    if (result.canceled || result.filePaths.length === 0) return null
    const path = result.filePaths[0]
    const data = await readFile(path)
    return { path, data: new Uint8Array(data.buffer, data.byteOffset, data.byteLength) }
  })

  ipcMain.handle(
    'pmg:openPath',
    async (_event, rawPath: unknown): Promise<OpenPmgResult | null> => {
      if (typeof rawPath !== 'string' || rawPath.length === 0) {
        throw new TypeError('pmg:openPath expects a non-empty file path')
      }
      const data = await readFile(rawPath)
      return { path: rawPath, data: new Uint8Array(data.buffer, data.byteOffset, data.byteLength) }
    }
  )

  ipcMain.handle(
    'export:objDialog',
    async (_event, rawName: unknown, rawObj: unknown, rawMtl: unknown): Promise<string | null> => {
      if (typeof rawObj !== 'string' || typeof rawMtl !== 'string') {
        throw new TypeError('export:objDialog expects obj and mtl text')
      }
      const defaultName = typeof rawName === 'string' && rawName.length > 0 ? rawName : 'model.obj'
      const result = await dialog.showSaveDialog({
        title: '匯出 OBJ',
        defaultPath: defaultName,
        filters: [{ name: 'Wavefront OBJ', extensions: ['obj'] }]
      })
      if (result.canceled || !result.filePath) return null
      await writeFile(result.filePath, rawObj, 'utf8')
      await writeFile(result.filePath.replace(/\.obj$/i, '.mtl'), rawMtl, 'utf8')
      return result.filePath
    }
  )

  ipcMain.handle(
    'export:glbDialog',
    async (_event, rawName: unknown, rawData: unknown): Promise<string | null> => {
      if (!(rawData instanceof Uint8Array)) {
        throw new TypeError('export:glbDialog expects file data as Uint8Array')
      }
      const defaultName = typeof rawName === 'string' && rawName.length > 0 ? rawName : 'model.glb'
      const result = await dialog.showSaveDialog({
        title: '匯出 glTF (GLB)',
        defaultPath: defaultName,
        filters: [{ name: 'glTF Binary', extensions: ['glb'] }]
      })
      if (result.canceled || !result.filePath) return null
      await writeFile(result.filePath, rawData)
      return result.filePath
    }
  )

  ipcMain.handle('pmg:save', async (_event, rawPath: unknown, rawData: unknown): Promise<void> => {
    const { path, data } = validateSaveArgs(rawPath, rawData)
    await writeFile(path, data)
  })

  ipcMain.handle(
    'pmg:saveDialog',
    async (_event, rawName: unknown, rawData: unknown): Promise<string | null> => {
      if (!(rawData instanceof Uint8Array)) {
        throw new TypeError('pmg:saveDialog expects file data as Uint8Array')
      }
      const defaultName = typeof rawName === 'string' && rawName.length > 0 ? rawName : 'model.pmg'
      const result = await dialog.showSaveDialog({
        title: '另存新檔',
        defaultPath: defaultName,
        filters: PMG_FILE_FILTERS
      })
      if (result.canceled || !result.filePath) return null
      await writeFile(result.filePath, rawData)
      return result.filePath
    }
  )
}

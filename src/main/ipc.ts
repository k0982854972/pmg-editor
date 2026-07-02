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

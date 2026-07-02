/**
 * FX XML file IPC (effect definitions + meshdesc tool XML): open dialog,
 * open by path, save, save-as. Consumed by src/preload/index.ts
 * (window.api openFx/openFxPath/saveFx/saveFxAs) and registered from
 * src/main/index.ts via registerFxIpc().
 */
import { dialog, ipcMain } from 'electron'
import { readFile, writeFile } from 'fs/promises'

const FX_FILE_FILTERS = [{ name: '特效 XML 檔', extensions: ['xml'] }]

export interface OpenFxResult {
  readonly path: string
  readonly data: Uint8Array
}

const toUint8 = (data: Buffer): Uint8Array =>
  new Uint8Array(data.buffer, data.byteOffset, data.byteLength)

export function registerFxIpc(): void {
  ipcMain.handle('fx:openDialog', async (): Promise<OpenFxResult | null> => {
    const result = await dialog.showOpenDialog({
      title: '開啟特效 XML 檔案',
      filters: FX_FILE_FILTERS,
      properties: ['openFile']
    })
    if (result.canceled || result.filePaths.length === 0) return null
    const path = result.filePaths[0]
    return { path, data: toUint8(await readFile(path)) }
  })

  ipcMain.handle('fx:openPath', async (_event, rawPath: unknown): Promise<OpenFxResult | null> => {
    if (typeof rawPath !== 'string' || rawPath.length === 0) {
      throw new TypeError('fx:openPath expects a non-empty file path')
    }
    return { path: rawPath, data: toUint8(await readFile(rawPath)) }
  })

  ipcMain.handle('fx:save', async (_event, rawPath: unknown, rawData: unknown): Promise<void> => {
    if (typeof rawPath !== 'string' || rawPath.length === 0) {
      throw new TypeError('fx:save expects a non-empty file path')
    }
    if (!(rawData instanceof Uint8Array)) {
      throw new TypeError('fx:save expects file data as Uint8Array')
    }
    await writeFile(rawPath, rawData)
  })

  ipcMain.handle(
    'fx:saveDialog',
    async (_event, rawName: unknown, rawData: unknown): Promise<string | null> => {
      if (!(rawData instanceof Uint8Array)) {
        throw new TypeError('fx:saveDialog expects file data as Uint8Array')
      }
      const defaultName = typeof rawName === 'string' && rawName.length > 0 ? rawName : 'effect.xml'
      const result = await dialog.showSaveDialog({
        title: '另存新檔',
        defaultPath: defaultName,
        filters: FX_FILE_FILTERS
      })
      if (result.canceled || !result.filePath) return null
      await writeFile(result.filePath, rawData)
      return result.filePath
    }
  )
}

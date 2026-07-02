/**
 * DDS texture file IPC: open dialog, open by path, save, save-as, plus PNG
 * import/export dialogs for the pixel replacement flow. Consumed by
 * src/preload/index.ts (window.api openDds/openDdsPath/saveDds/saveDdsAs/
 * importPng/exportPng) and registered from src/main/index.ts via
 * registerDdsIpc().
 */
import { dialog, ipcMain } from 'electron'
import { readFile, writeFile } from 'fs/promises'

const DDS_FILE_FILTERS = [{ name: 'DDS 貼圖檔', extensions: ['dds'] }]
const PNG_FILE_FILTERS = [{ name: 'PNG 圖片', extensions: ['png'] }]

export interface OpenDdsResult {
  readonly path: string
  readonly data: Uint8Array
}

const toUint8 = (data: Buffer): Uint8Array =>
  new Uint8Array(data.buffer, data.byteOffset, data.byteLength)

export function registerDdsIpc(): void {
  ipcMain.handle('dds:openDialog', async (): Promise<OpenDdsResult | null> => {
    const result = await dialog.showOpenDialog({
      title: '開啟 DDS 貼圖檔案',
      filters: DDS_FILE_FILTERS,
      properties: ['openFile']
    })
    if (result.canceled || result.filePaths.length === 0) return null
    const path = result.filePaths[0]
    return { path, data: toUint8(await readFile(path)) }
  })

  ipcMain.handle(
    'dds:openPath',
    async (_event, rawPath: unknown): Promise<OpenDdsResult | null> => {
      if (typeof rawPath !== 'string' || rawPath.length === 0) {
        throw new TypeError('dds:openPath expects a non-empty file path')
      }
      return { path: rawPath, data: toUint8(await readFile(rawPath)) }
    }
  )

  ipcMain.handle('dds:save', async (_event, rawPath: unknown, rawData: unknown): Promise<void> => {
    if (typeof rawPath !== 'string' || rawPath.length === 0) {
      throw new TypeError('dds:save expects a non-empty file path')
    }
    if (!(rawData instanceof Uint8Array)) {
      throw new TypeError('dds:save expects file data as Uint8Array')
    }
    await writeFile(rawPath, rawData)
  })

  ipcMain.handle(
    'dds:saveDialog',
    async (_event, rawName: unknown, rawData: unknown): Promise<string | null> => {
      if (!(rawData instanceof Uint8Array)) {
        throw new TypeError('dds:saveDialog expects file data as Uint8Array')
      }
      const defaultName =
        typeof rawName === 'string' && rawName.length > 0 ? rawName : 'texture.dds'
      const result = await dialog.showSaveDialog({
        title: '另存新檔',
        defaultPath: defaultName,
        filters: DDS_FILE_FILTERS
      })
      if (result.canceled || !result.filePath) return null
      await writeFile(result.filePath, rawData)
      return result.filePath
    }
  )

  ipcMain.handle('dds:importPngDialog', async (): Promise<OpenDdsResult | null> => {
    const result = await dialog.showOpenDialog({
      title: '選擇要取代像素的 PNG 圖片',
      filters: PNG_FILE_FILTERS,
      properties: ['openFile']
    })
    if (result.canceled || result.filePaths.length === 0) return null
    const path = result.filePaths[0]
    return { path, data: toUint8(await readFile(path)) }
  })

  ipcMain.handle(
    'dds:exportPngDialog',
    async (_event, rawName: unknown, rawData: unknown): Promise<string | null> => {
      if (!(rawData instanceof Uint8Array)) {
        throw new TypeError('dds:exportPngDialog expects PNG data as Uint8Array')
      }
      const defaultName =
        typeof rawName === 'string' && rawName.length > 0 ? rawName : 'texture.png'
      const result = await dialog.showSaveDialog({
        title: '匯出 PNG',
        defaultPath: defaultName,
        filters: PNG_FILE_FILTERS
      })
      if (result.canceled || !result.filePath) return null
      await writeFile(result.filePath, rawData)
      return result.filePath
    }
  )
}

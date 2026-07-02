/**
 * FRM skeleton file IPC: open dialog + open by path (read-only, no save).
 * Consumed by src/preload/index.ts (window.api openFrm/openFrmPath) and
 * registered from src/main/index.ts via registerFrmIpc(). Mirrors
 * src/main/aniIpc.ts.
 */
import { dialog, ipcMain } from 'electron'
import { readFile } from 'fs/promises'

const FRM_FILE_FILTERS = [{ name: 'FRM 骨架檔', extensions: ['frm'] }]

export interface OpenFrmResult {
  readonly path: string
  readonly data: Uint8Array
}

const toUint8 = (data: Buffer): Uint8Array =>
  new Uint8Array(data.buffer, data.byteOffset, data.byteLength)

export function registerFrmIpc(): void {
  ipcMain.handle('frm:openDialog', async (): Promise<OpenFrmResult | null> => {
    const result = await dialog.showOpenDialog({
      title: '開啟 FRM 骨架檔案',
      filters: FRM_FILE_FILTERS,
      properties: ['openFile']
    })
    if (result.canceled || result.filePaths.length === 0) return null
    const path = result.filePaths[0]
    return { path, data: toUint8(await readFile(path)) }
  })

  ipcMain.handle(
    'frm:openPath',
    async (_event, rawPath: unknown): Promise<OpenFrmResult | null> => {
      if (typeof rawPath !== 'string' || rawPath.length === 0) {
        throw new TypeError('frm:openPath expects a non-empty file path')
      }
      return { path: rawPath, data: toUint8(await readFile(rawPath)) }
    }
  )
}

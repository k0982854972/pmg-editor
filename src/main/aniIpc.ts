/**
 * ANI animation file IPC: open dialog + open by path (read-only inspector,
 * no save). Consumed by src/preload/index.ts (window.api openAni/openAniPath)
 * and registered from src/main/index.ts via registerAniIpc(). Mirrors the
 * open-side pattern of src/main/ddsIpc.ts.
 */
import { dialog, ipcMain } from 'electron'
import { readFile } from 'fs/promises'

const ANI_FILE_FILTERS = [{ name: 'ANI 動畫檔', extensions: ['ani'] }]

export interface OpenAniResult {
  readonly path: string
  readonly data: Uint8Array
}

const toUint8 = (data: Buffer): Uint8Array =>
  new Uint8Array(data.buffer, data.byteOffset, data.byteLength)

export function registerAniIpc(): void {
  ipcMain.handle('ani:openDialog', async (): Promise<OpenAniResult | null> => {
    const result = await dialog.showOpenDialog({
      title: '開啟 ANI 動畫檔案',
      filters: ANI_FILE_FILTERS,
      properties: ['openFile']
    })
    if (result.canceled || result.filePaths.length === 0) return null
    const path = result.filePaths[0]
    return { path, data: toUint8(await readFile(path)) }
  })

  ipcMain.handle(
    'ani:openPath',
    async (_event, rawPath: unknown): Promise<OpenAniResult | null> => {
      if (typeof rawPath !== 'string' || rawPath.length === 0) {
        throw new TypeError('ani:openPath expects a non-empty file path')
      }
      return { path: rawPath, data: toUint8(await readFile(rawPath)) }
    }
  )
}

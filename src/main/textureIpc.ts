/**
 * FX texture IPC for the particle preview. `fx:readTexture` resolves a
 * texture name to a .dds file under the user-provided data root, searching
 * the tolerant directory order from textureSearch.ts (material/fx ->
 * material -> fx -> root -> one-level subdirs of material and of the root)
 * with case-insensitive filename matching. `fx:pickDataRoot` opens a
 * directory picker for the data root. Consumed by src/preload/index.ts
 * (window.api.readFxTexture / pickFxDataRoot) and registered from
 * src/main/index.ts via registerTextureIpc().
 */
import { dialog, ipcMain } from 'electron'
import { readdir, readFile, stat } from 'fs/promises'
import { join } from 'path'
import { matchFileNameCaseInsensitive, orderedTextureDirs } from './textureSearch'

export interface FxTextureResult {
  readonly path: string
  readonly data: Uint8Array
}

// Texture names come from XML attributes; forbid anything path-like.
const SAFE_TEXTURE_NAME = /^[\w\-. ()]+$/

const toUint8 = (data: Buffer): Uint8Array =>
  new Uint8Array(data.buffer, data.byteOffset, data.byteLength)

async function readIfFile(path: string): Promise<FxTextureResult | null> {
  try {
    const info = await stat(path)
    if (!info.isFile()) return null
    return { path, data: toUint8(await readFile(path)) }
  } catch {
    return null
  }
}

/** One-level directory names under `dir` ([] when unreadable). */
async function listSubdirNames(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true })
    return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name)
  } catch {
    return []
  }
}

/** File names directly inside `dir` ([] when unreadable). */
async function listFileNames(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true })
    return entries.filter((entry) => entry.isFile()).map((entry) => entry.name)
  } catch {
    return []
  }
}

async function findTexture(dataRoot: string, fileName: string): Promise<FxTextureResult | null> {
  const materialSubdirs = await listSubdirNames(join(dataRoot, 'material'))
  const rootSubdirs = await listSubdirNames(dataRoot)
  const materialFxSubdirs = await listSubdirNames(join(dataRoot, 'material', 'fx'))
  const rootFxSubdirs = await listSubdirNames(join(dataRoot, 'fx'))
  const dirs = orderedTextureDirs(
    dataRoot,
    materialSubdirs,
    rootSubdirs,
    materialFxSubdirs,
    rootFxSubdirs
  )
  for (const dir of dirs) {
    const matched = matchFileNameCaseInsensitive(await listFileNames(dir), fileName)
    if (!matched) continue
    const found = await readIfFile(join(dir, matched))
    if (found) return found
  }
  return null
}

export function registerTextureIpc(): void {
  ipcMain.handle(
    'fx:readTexture',
    async (_event, rawRoot: unknown, rawName: unknown): Promise<FxTextureResult | null> => {
      if (typeof rawRoot !== 'string' || rawRoot.trim().length === 0) {
        throw new TypeError('fx:readTexture expects a non-empty data root path')
      }
      if (typeof rawName !== 'string' || !SAFE_TEXTURE_NAME.test(rawName)) {
        throw new TypeError('fx:readTexture expects a plain texture name (no path segments)')
      }
      return findTexture(rawRoot.trim(), `${rawName}.dds`)
    }
  )

  ipcMain.handle('fx:pickDataRoot', async (): Promise<string | null> => {
    const result = await dialog.showOpenDialog({
      title: '選擇資料根目錄',
      properties: ['openDirectory']
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })
}

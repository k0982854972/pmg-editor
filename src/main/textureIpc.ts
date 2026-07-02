/**
 * FX texture lookup IPC for the particle preview. Resolves a texture name
 * to a .dds file under the user-provided data root, trying
 * `<dataRoot>/material/fx/<name>.dds`, then `<dataRoot>/material/<name>.dds`,
 * then one level of `<dataRoot>/material/<subdir>/<name>.dds` — no deeper
 * scan. Consumed by src/preload/index.ts (window.api.readFxTexture) and
 * registered from src/main/index.ts via registerTextureIpc().
 */
import { ipcMain } from 'electron'
import type { Dirent } from 'fs'
import { readdir, readFile, stat } from 'fs/promises'
import { join } from 'path'

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

async function findTexture(dataRoot: string, fileName: string): Promise<FxTextureResult | null> {
  const materialDir = join(dataRoot, 'material')
  const direct =
    (await readIfFile(join(materialDir, 'fx', fileName))) ??
    (await readIfFile(join(materialDir, fileName)))
  if (direct) return direct

  let entries: Dirent[]
  try {
    entries = await readdir(materialDir, { withFileTypes: true })
  } catch {
    return null
  }
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === 'fx') continue
    const found = await readIfFile(join(materialDir, entry.name, fileName))
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
}

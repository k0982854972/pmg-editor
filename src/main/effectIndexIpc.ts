/**
 * Persistent emitter-name index IPC for meshdesc auto-loading.
 * `fx:buildEffectIndex(dataRoot)` locates the effect XML directory
 * (<root>/gfx/fx/effect, or the material sibling — see effectIndexSearch),
 * parses every *.xml once to map lowercased emitter display names to
 * absolute file paths, and caches the result as
 * <userData>/effect-index.json. The cache is rebuilt only when missing,
 * the directory differs, or the xml file count / directory mtime changed.
 * Consumed by src/preload/index.ts (window.api.buildEffectIndex) and
 * registered from src/main/index.ts via registerEffectIndexIpc().
 */
import { app, ipcMain } from 'electron'
import { readdir, readFile, stat, writeFile } from 'fs/promises'
import { join } from 'path'
import { emitterDisplayName, parseEffectXml } from '../core/fx/effectXml'
import type { EffectIndexCache, EffectIndexProbe } from './effectIndexSearch'
import {
  candidateEffectDirs,
  isEffectIndexCacheFresh,
  parseEffectIndexCache
} from './effectIndexSearch'

export interface EffectIndexResult {
  readonly dirPath: string
  /** Lowercased emitter name -> absolute effect XML path. */
  readonly entries: Readonly<Record<string, string>>
  readonly fileCount: number
}

const CACHE_FILE_NAME = 'effect-index.json'

const cachePath = (): string => join(app.getPath('userData'), CACHE_FILE_NAME)

async function locateEffectDir(dataRoot: string): Promise<string | null> {
  for (const dir of candidateEffectDirs(dataRoot)) {
    try {
      if ((await stat(dir)).isDirectory()) return dir
    } catch {
      // Candidate does not exist; try the next one.
    }
  }
  return null
}

async function listXmlFileNames(dir: string): Promise<readonly string[]> {
  const entries = await readdir(dir, { withFileTypes: true })
  return entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.xml'))
    .map((entry) => entry.name)
}

async function readCache(): Promise<EffectIndexCache | null> {
  try {
    const raw = await readFile(cachePath(), 'utf-8')
    return parseEffectIndexCache(JSON.parse(raw))
  } catch {
    return null
  }
}

async function writeCache(cache: EffectIndexCache): Promise<void> {
  try {
    await writeFile(cachePath(), JSON.stringify(cache))
  } catch {
    // Best-effort persistence; the in-memory result is still returned.
  }
}

/** First-file-wins map of lowercased emitter names to absolute paths. */
async function buildEntries(
  dir: string,
  fileNames: readonly string[]
): Promise<Record<string, string>> {
  const entries: Record<string, string> = {}
  for (const fileName of fileNames) {
    const filePath = join(dir, fileName)
    try {
      const doc = parseEffectXml(new Uint8Array(await readFile(filePath)))
      for (const emitter of doc.emitters) {
        const key = emitterDisplayName(emitter.node).trim().toLowerCase()
        if (key !== '' && entries[key] === undefined) entries[key] = filePath
      }
    } catch {
      // Corrupt or non-effect XML files are skipped, not fatal.
    }
  }
  return entries
}

async function buildEffectIndex(dataRoot: string): Promise<EffectIndexResult | null> {
  const dirPath = await locateEffectDir(dataRoot)
  if (!dirPath) return null
  const fileNames = await listXmlFileNames(dirPath)
  const probe: EffectIndexProbe = {
    dirPath,
    fileCount: fileNames.length,
    dirMtimeMs: (await stat(dirPath)).mtimeMs
  }
  const cached = await readCache()
  if (cached && isEffectIndexCacheFresh(cached, probe)) {
    return { dirPath: cached.dirPath, entries: cached.entries, fileCount: cached.fileCount }
  }
  const entries = await buildEntries(dirPath, fileNames)
  await writeCache({ builtAt: Date.now(), ...probe, entries })
  return { dirPath, entries, fileCount: probe.fileCount }
}

export function registerEffectIndexIpc(): void {
  ipcMain.handle(
    'fx:buildEffectIndex',
    async (_event, rawRoot: unknown): Promise<EffectIndexResult | null> => {
      if (typeof rawRoot !== 'string' || rawRoot.trim().length === 0) {
        throw new TypeError('fx:buildEffectIndex expects a non-empty data root path')
      }
      return buildEffectIndex(rawRoot.trim())
    }
  )
}

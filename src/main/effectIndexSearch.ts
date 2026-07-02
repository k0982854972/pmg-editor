/**
 * Pure helpers for the persistent emitter-name index (no fs/electron
 * imports so they stay unit-testable): candidate effect directories under
 * a user-provided data root, cache-freshness checking and validation of
 * the untrusted cache JSON read from disk. Consumed by
 * src/main/effectIndexIpc.ts; specified in tests/main/effectIndexSearch.test.ts.
 */
import { basename, dirname, join } from 'path'

/** Emitter-name index cache persisted to <userData>/effect-index.json. */
export interface EffectIndexCache {
  readonly builtAt: number
  readonly dirPath: string
  readonly fileCount: number
  readonly dirMtimeMs: number
  /** Lowercased emitter name -> absolute effect XML path. */
  readonly entries: Readonly<Record<string, string>>
}

export interface EffectIndexProbe {
  readonly dirPath: string
  readonly fileCount: number
  readonly dirMtimeMs: number
}

/**
 * Ordered candidate directories for effect XMLs: `<root>/gfx/fx/effect`,
 * plus `<root-parent>/gfx/fx/effect` when the root basename is "material"
 * (the gfx tree is a sibling of material, not inside it).
 */
export function candidateEffectDirs(dataRoot: string): string[] {
  const candidates = [join(dataRoot, 'gfx', 'fx', 'effect')]
  if (basename(dataRoot).toLowerCase() === 'material') {
    candidates.push(join(dirname(dataRoot), 'gfx', 'fx', 'effect'))
  }
  return candidates
}

/**
 * Cheap staleness check: the cache is reusable only when it indexes the
 * same directory and neither the xml file count nor the directory mtime
 * changed since it was built.
 */
export function isEffectIndexCacheFresh(cache: EffectIndexCache, probe: EffectIndexProbe): boolean {
  return (
    cache.dirPath === probe.dirPath &&
    cache.fileCount === probe.fileCount &&
    cache.dirMtimeMs === probe.dirMtimeMs
  )
}

const isStringRecord = (value: unknown): value is Record<string, string> =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value) &&
  Object.values(value).every((entry) => typeof entry === 'string')

/** Validates untrusted cache JSON from disk; null when malformed. */
export function parseEffectIndexCache(raw: unknown): EffectIndexCache | null {
  if (typeof raw !== 'object' || raw === null) return null
  const record = raw as Record<string, unknown>
  if (
    typeof record.builtAt !== 'number' ||
    typeof record.dirPath !== 'string' ||
    typeof record.fileCount !== 'number' ||
    typeof record.dirMtimeMs !== 'number' ||
    !isStringRecord(record.entries)
  ) {
    return null
  }
  return {
    builtAt: record.builtAt,
    dirPath: record.dirPath,
    fileCount: record.fileCount,
    dirMtimeMs: record.dirMtimeMs,
    entries: record.entries
  }
}

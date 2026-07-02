/**
 * effectIndexSearch spec: pure helpers behind the main-process emitter index.
 * - candidateEffectDirs: <root>/gfx/fx/effect, plus the material-sibling
 *   <root-parent>/gfx/fx/effect when the root basename is "material".
 * - isEffectIndexCacheFresh: cache reusable only when dirPath, xml file
 *   count and directory mtime all match the current probe.
 * - parseEffectIndexCache: validates untrusted JSON from disk.
 */
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import {
  candidateEffectDirs,
  isEffectIndexCacheFresh,
  parseEffectIndexCache,
  type EffectIndexCache
} from '../../src/main/effectIndexSearch'

describe('candidateEffectDirs', () => {
  it('returns <root>/gfx/fx/effect for a data root', () => {
    expect(candidateEffectDirs(join('/mabi', 'data'))).toEqual([
      join('/mabi', 'data', 'gfx', 'fx', 'effect')
    ])
  })

  it('adds the parent gfx tree when the root basename is material', () => {
    expect(candidateEffectDirs(join('/mabi', 'data', 'material'))).toEqual([
      join('/mabi', 'data', 'material', 'gfx', 'fx', 'effect'),
      join('/mabi', 'data', 'gfx', 'fx', 'effect')
    ])
  })

  it('matches the material basename case-insensitively', () => {
    const dirs = candidateEffectDirs(join('/mabi', 'data', 'Material'))
    expect(dirs).toHaveLength(2)
    expect(dirs[1]).toBe(join('/mabi', 'data', 'gfx', 'fx', 'effect'))
  })
})

describe('isEffectIndexCacheFresh', () => {
  const cache: EffectIndexCache = {
    builtAt: 1000,
    dirPath: '/mabi/data/gfx/fx/effect',
    fileCount: 489,
    dirMtimeMs: 42,
    entries: { dark_wind01: '/mabi/data/gfx/fx/effect/dark.xml' }
  }
  const probe = { dirPath: '/mabi/data/gfx/fx/effect', fileCount: 489, dirMtimeMs: 42 }

  it('is fresh when dirPath, file count and dir mtime all match', () => {
    expect(isEffectIndexCacheFresh(cache, probe)).toBe(true)
  })

  it('is stale when any probe field differs', () => {
    expect(isEffectIndexCacheFresh(cache, { ...probe, dirPath: '/other' })).toBe(false)
    expect(isEffectIndexCacheFresh(cache, { ...probe, fileCount: 488 })).toBe(false)
    expect(isEffectIndexCacheFresh(cache, { ...probe, dirMtimeMs: 43 })).toBe(false)
  })
})

describe('parseEffectIndexCache', () => {
  const valid = {
    builtAt: 1,
    dirPath: '/x',
    fileCount: 2,
    dirMtimeMs: 3,
    entries: { a: '/x/a.xml', b: '/x/b.xml' }
  }

  it('accepts a well-formed cache object', () => {
    expect(parseEffectIndexCache(valid)).toEqual(valid)
  })

  it('rejects null, non-objects and missing fields', () => {
    expect(parseEffectIndexCache(null)).toBeNull()
    expect(parseEffectIndexCache('nope')).toBeNull()
    expect(parseEffectIndexCache({ ...valid, dirPath: undefined })).toBeNull()
    expect(parseEffectIndexCache({ ...valid, fileCount: 'many' })).toBeNull()
  })

  it('rejects entries with non-string values', () => {
    expect(parseEffectIndexCache({ ...valid, entries: { a: 1 } })).toBeNull()
    expect(parseEffectIndexCache({ ...valid, entries: null })).toBeNull()
  })
})

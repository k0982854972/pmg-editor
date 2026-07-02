/**
 * Spec for the pure FX texture search-order helpers used by
 * src/main/textureIpc.ts: the ordered directory candidate list
 * (material/fx -> material -> fx -> root -> material subdirs -> root
 * subdirs, case-insensitively deduped) and case-insensitive filename
 * matching against a directory listing.
 */
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { matchFileNameCaseInsensitive, orderedTextureDirs } from '../../src/main/textureSearch'

const ROOT = join('/data', 'root')

describe('orderedTextureDirs', () => {
  it('tries material/fx, material, fx, then the root itself', () => {
    expect(orderedTextureDirs(ROOT, [], [])).toEqual([
      join(ROOT, 'material', 'fx'),
      join(ROOT, 'material'),
      join(ROOT, 'fx'),
      ROOT
    ])
  })

  it('appends one-level subdirs of material before one-level subdirs of the root', () => {
    expect(orderedTextureDirs(ROOT, ['a'], ['b'])).toEqual([
      join(ROOT, 'material', 'fx'),
      join(ROOT, 'material'),
      join(ROOT, 'fx'),
      ROOT,
      join(ROOT, 'material', 'a'),
      join(ROOT, 'b')
    ])
  })

  it('dedupes directories case-insensitively, keeping first occurrence', () => {
    expect(orderedTextureDirs(ROOT, ['FX', 'a'], ['Material', 'fx', 'b'])).toEqual([
      join(ROOT, 'material', 'fx'),
      join(ROOT, 'material'),
      join(ROOT, 'fx'),
      ROOT,
      join(ROOT, 'material', 'a'),
      join(ROOT, 'b')
    ])
  })

  it('searches material/fx subdirs right after material/fx (real fx textures are nested)', () => {
    // e.g. data/material/fx/effect/common_effect.dds
    expect(orderedTextureDirs(ROOT, [], [], ['effect', 'weapon'], [])).toEqual([
      join(ROOT, 'material', 'fx'),
      join(ROOT, 'material', 'fx', 'effect'),
      join(ROOT, 'material', 'fx', 'weapon'),
      join(ROOT, 'material'),
      join(ROOT, 'fx'),
      ROOT
    ])
  })

  it('searches root fx subdirs so a root pointing at data/material still finds nested textures', () => {
    // root = data/material -> root/fx/effect
    expect(orderedTextureDirs(ROOT, [], [], [], ['effect'])).toEqual([
      join(ROOT, 'material', 'fx'),
      join(ROOT, 'material'),
      join(ROOT, 'fx'),
      join(ROOT, 'fx', 'effect'),
      ROOT
    ])
  })
})

describe('matchFileNameCaseInsensitive', () => {
  it('returns the entry whose lowercased name matches', () => {
    expect(matchFileNameCaseInsensitive(['Foo.DDS', 'bar.dds'], 'foo.dds')).toBe('Foo.DDS')
    expect(matchFileNameCaseInsensitive(['Foo.DDS', 'bar.dds'], 'BAR.DDS')).toBe('bar.dds')
  })

  it('returns null when nothing matches', () => {
    expect(matchFileNameCaseInsensitive(['Foo.DDS', 'bar.dds'], 'baz.dds')).toBeNull()
  })

  it('returns null for an empty listing', () => {
    expect(matchFileNameCaseInsensitive([], 'foo.dds')).toBeNull()
  })
})

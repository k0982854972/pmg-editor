/**
 * meshdescPreviewModel spec: pure helpers behind the meshdesc live preview.
 * - buildBoneCandidates: PMG bone/joint names + common tool bones, deduped
 *   case-insensitively with PMG casing winning.
 * - resolveParentAnchor: first mesh whose boneName/jointName equals the
 *   meshdesc parent case-insensitively; translation read from a row-major
 *   matrix (indices 3/7/11). Unresolved -> origin.
 * - effectAnchorWorld: anchor + row offset scaled from effect units (~cm)
 *   into world units (x0.01, same factor as the particle preview).
 * - resolveEmitterIndex: effect_name -> emitter index in an EffectDocument
 *   via emitterDisplayName, exact match preferred, case-insensitive fallback.
 */
import { describe, expect, it } from 'vitest'
import { parseEffectXml } from '../../src/core/fx/effectXml'
import {
  buildBoneCandidates,
  COMMON_TOOL_BONES,
  EFFECT_UNITS_TO_WORLD,
  effectAnchorWorld,
  resolveEmitterIndex,
  resolveParentAnchor,
  type MeshAnchorSource
} from '../../src/renderer/src/fx/meshdescPreviewModel'

const matrixWithTranslation = (x: number, y: number, z: number): readonly number[] => [
  1,
  0,
  0,
  x,
  0,
  1,
  0,
  y,
  0,
  0,
  1,
  z,
  0,
  0,
  0,
  1
]

const MESHES: readonly MeshAnchorSource[] = [
  { boneName: 'handtoolr', jointName: '', matrix: matrixWithTranslation(5, 6, 7) },
  { boneName: '', jointName: 'handtooll', matrix: matrixWithTranslation(-5, 6, 7) },
  { boneName: 'backtool', jointName: 'backtool', matrix: matrixWithTranslation(0, 1, -2) }
]

describe('buildBoneCandidates', () => {
  it('returns only common tool bones when the PMG has no names', () => {
    expect(buildBoneCandidates([])).toEqual(COMMON_TOOL_BONES)
  })

  it('puts PMG names first and dedups common bones case-insensitively', () => {
    const candidates = buildBoneCandidates(['handtoolr', 'blade01'])
    expect(candidates[0]).toBe('handtoolr')
    expect(candidates[1]).toBe('blade01')
    // 'HandtoolR' from the common list is dropped: PMG casing wins.
    expect(candidates.filter((name) => name.toLowerCase() === 'handtoolr')).toEqual(['handtoolr'])
    expect(candidates).toContain('HandtoolL')
    expect(candidates).toContain('Bip01')
  })

  it('drops blank and duplicate PMG names', () => {
    const candidates = buildBoneCandidates(['', 'Blade01', 'blade01', '  '])
    expect(candidates.filter((name) => name.toLowerCase() === 'blade01')).toEqual(['Blade01'])
    expect(candidates).not.toContain('')
  })
})

describe('resolveParentAnchor', () => {
  it('matches boneName case-insensitively and reads row-major translation', () => {
    const anchor = resolveParentAnchor(MESHES, 'HandtoolR')
    expect(anchor.isResolved).toBe(true)
    expect(anchor.position).toEqual({ x: 5, y: 6, z: 7 })
  })

  it('falls back to jointName matching', () => {
    const anchor = resolveParentAnchor(MESHES, 'HandtoolL')
    expect(anchor.isResolved).toBe(true)
    expect(anchor.position).toEqual({ x: -5, y: 6, z: 7 })
  })

  it('returns the first matching mesh', () => {
    const doubled = [
      ...MESHES,
      { boneName: 'HANDTOOLR', jointName: '', matrix: matrixWithTranslation(99, 99, 99) }
    ]
    expect(resolveParentAnchor(doubled, 'handtoolr').position).toEqual({ x: 5, y: 6, z: 7 })
  })

  it('anchors unresolved or blank parents at the origin', () => {
    for (const parent of ['NoSuchBone', '', '   ']) {
      const anchor = resolveParentAnchor(MESHES, parent)
      expect(anchor.isResolved).toBe(false)
      expect(anchor.position).toEqual({ x: 0, y: 0, z: 0 })
    }
  })
})

describe('effectAnchorWorld', () => {
  it('adds the row offset scaled from effect units to world units', () => {
    const anchor = effectAnchorWorld(MESHES, {
      parent: 'HandtoolR',
      offset: { x: -1.1, y: 1.5, z: 10 }
    })
    expect(anchor.isResolved).toBe(true)
    expect(anchor.position.x).toBeCloseTo(5 + -1.1 * EFFECT_UNITS_TO_WORLD)
    expect(anchor.position.y).toBeCloseTo(6 + 1.5 * EFFECT_UNITS_TO_WORLD)
    expect(anchor.position.z).toBeCloseTo(7 + 10 * EFFECT_UNITS_TO_WORLD)
  })

  it('keeps the scaled offset even when the parent is unresolved', () => {
    const anchor = effectAnchorWorld(MESHES, { parent: 'ghost', offset: { x: 100, y: 0, z: 0 } })
    expect(anchor.isResolved).toBe(false)
    expect(anchor.position).toEqual({ x: 1, y: 0, z: 0 })
  })
})

describe('resolveEmitterIndex', () => {
  const doc = parseEffectXml(
    new TextEncoder().encode(
      `<?xml version="1.0" encoding="utf-8"?>
<effect_ver7 version="7">
  <emitter classname="CEmitterType" name="dark_wind01" />
  <emitter classname="CEmitterType" name="dark_grow01" />
  <M_ego_sword classname="CEmitterType" />
  <emitter classname="CEmitterType" name="DARK_WIND01_upper" />
</effect_ver7>`
    )
  )

  it('resolves by the name attribute (emitterDisplayName)', () => {
    expect(resolveEmitterIndex(doc, 'dark_grow01')).toBe(1)
  })

  it('resolves by element tag when there is no name attribute', () => {
    expect(resolveEmitterIndex(doc, 'M_ego_sword')).toBe(2)
  })

  it('prefers an exact match, then falls back case-insensitively', () => {
    expect(resolveEmitterIndex(doc, 'dark_wind01')).toBe(0)
    expect(resolveEmitterIndex(doc, 'DARK_WIND01')).toBe(0)
    expect(resolveEmitterIndex(doc, 'm_ego_SWORD')).toBe(2)
  })

  it('returns null for unknown or blank names', () => {
    expect(resolveEmitterIndex(doc, 'missing_fx')).toBeNull()
    expect(resolveEmitterIndex(doc, '')).toBeNull()
    expect(resolveEmitterIndex(doc, '  ')).toBeNull()
  })
})

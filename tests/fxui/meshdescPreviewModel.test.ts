/**
 * meshdescPreviewModel spec: pure helpers behind the meshdesc live preview.
 * - buildBoneCandidates: PMG bone/joint names + common tool bones, deduped
 *   case-insensitively with PMG casing winning.
 * - resolveParentAnchor: first mesh whose boneName/jointName equals the
 *   meshdesc parent case-insensitively; translation read from a row-major
 *   matrix (indices 3/7/11). Unresolved -> origin.
 *   slot > 0 prefers the sibling mesh on the same bone whose meshName
 *   carries the "+<slot>" suffix (corpus pattern
 *   "<basename>_<bone>+<N>_<suffix>_", e.g.
 *   "e_twohandweapon01_handtoolr+2_r_"); its anchor is the mesh's local
 *   vertex centroid transformed by the row-major matrix (p' = M*p). A
 *   missing slot mesh falls back to the base translation anchor with
 *   isSlotResolved = false.
 * - effectAnchorWorld: anchor + row offset in native units (effect offsets
 *   share the PMG unit scale; no conversion factor).
 * - effectRotationQuaternion: rot_axis/rot_angle (degrees) -> unit
 *   quaternion; zero/invalid axis or zero angle -> identity.
 * - resolveEmitterIndex: effect_name -> emitter index in an EffectDocument
 *   via emitterDisplayName, exact match preferred, case-insensitive fallback.
 */
import { describe, expect, it } from 'vitest'
import { parseEffectXml } from '../../src/core/fx/effectXml'
import {
  buildBoneCandidates,
  COMMON_TOOL_BONES,
  effectAnchorWorld,
  effectRotationQuaternion,
  mergedEmitterNames,
  resolveEmitterAcross,
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
  {
    boneName: 'handtoolr',
    jointName: '',
    meshName: 'e_weapon_handtoolr_r_',
    matrix: matrixWithTranslation(5, 6, 7),
    centroid: { x: 0.5, y: 0.5, z: 0.5 }
  },
  {
    boneName: '',
    jointName: 'handtooll',
    meshName: 'e_weapon_handtooll_l_',
    matrix: matrixWithTranslation(-5, 6, 7),
    centroid: { x: 0, y: 0, z: 0 }
  },
  {
    boneName: 'backtool',
    jointName: 'backtool',
    meshName: 'e_weapon_backtool_e_',
    matrix: matrixWithTranslation(0, 1, -2),
    centroid: null
  }
]

/** Slot-case shape: base mesh plus 3-vertex "+N" placeholder meshes. */
const SLOT_MESHES: readonly MeshAnchorSource[] = [
  ...MESHES,
  {
    boneName: 'handtoolr',
    jointName: 'handtoolr',
    meshName: 'e_weapon_handtoolr+2_r_',
    matrix: matrixWithTranslation(1, 2, 3),
    centroid: { x: 0.25, y: -0.25, z: 0.5 }
  },
  {
    boneName: 'handtoolr',
    jointName: 'handtoolr',
    meshName: 'e_weapon_handtoolr+17_r_',
    matrix: matrixWithTranslation(10, 20, 30),
    centroid: { x: 0, y: 0, z: 0 }
  },
  {
    boneName: 'handtoolr',
    jointName: 'handtoolr',
    meshName: 'e_weapon_handtoolr+3__',
    matrix: matrixWithTranslation(-1, -2, -3),
    centroid: null
  }
]

describe('buildBoneCandidates', () => {
  it('returns only common tool bones when the PMG has no names', () => {
    expect(buildBoneCandidates([])).toEqual(COMMON_TOOL_BONES)
  })

  it('uses the community-correct tool bone casing', () => {
    expect(COMMON_TOOL_BONES).toEqual([
      'HandToolR',
      'HandToolL',
      'BodyToolR',
      'BodyToolL',
      'BackTool',
      'Bip01'
    ])
  })

  it('puts PMG names first and dedups common bones case-insensitively', () => {
    const candidates = buildBoneCandidates(['handtoolr', 'blade01'])
    expect(candidates[0]).toBe('handtoolr')
    expect(candidates[1]).toBe('blade01')
    // 'HandToolR' from the common list is dropped: PMG casing wins.
    expect(candidates.filter((name) => name.toLowerCase() === 'handtoolr')).toEqual(['handtoolr'])
    expect(candidates).toContain('HandToolL')
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
    const doubled: readonly MeshAnchorSource[] = [
      ...MESHES,
      {
        boneName: 'HANDTOOLR',
        jointName: '',
        meshName: 'e_weapon2_handtoolr_r_',
        matrix: matrixWithTranslation(99, 99, 99),
        centroid: null
      }
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

describe('resolveParentAnchor with slot', () => {
  it('treats slot 0 (or omitted) as the base translation anchor', () => {
    const withSlot = resolveParentAnchor(SLOT_MESHES, 'HandtoolR', 0)
    expect(withSlot.position).toEqual({ x: 5, y: 6, z: 7 })
    expect(withSlot.isSlotResolved).toBe(true)
    expect(resolveParentAnchor(SLOT_MESHES, 'HandtoolR')).toEqual(withSlot)
  })

  it('anchors slot N at the +N mesh vertex centroid transformed by its matrix', () => {
    const anchor = resolveParentAnchor(SLOT_MESHES, 'HandtoolR', 2)
    expect(anchor.isResolved).toBe(true)
    expect(anchor.isSlotResolved).toBe(true)
    // centroid (0.25,-0.25,0.5) through identity rotation + translation (1,2,3)
    expect(anchor.position.x).toBeCloseTo(1.25)
    expect(anchor.position.y).toBeCloseTo(1.75)
    expect(anchor.position.z).toBeCloseTo(3.5)
  })

  it('applies the full row-major matrix (rotation included) to the centroid', () => {
    const rotated: MeshAnchorSource = {
      boneName: 'handtoolr',
      jointName: 'handtoolr',
      meshName: 'e_weapon_handtoolr+9_r_',
      // 90° around Z (row-major): p' = (-y + 4, x + 5, z + 6)
      matrix: [0, -1, 0, 4, 1, 0, 0, 5, 0, 0, 1, 6, 0, 0, 0, 1],
      centroid: { x: 1, y: 2, z: 3 }
    }
    const anchor = resolveParentAnchor([...SLOT_MESHES, rotated], 'HandtoolR', 9)
    expect(anchor.position.x).toBeCloseTo(2)
    expect(anchor.position.y).toBeCloseTo(6)
    expect(anchor.position.z).toBeCloseTo(9)
  })

  it('does not let +17 satisfy a +1 lookup (exact number match)', () => {
    const anchor = resolveParentAnchor(SLOT_MESHES, 'HandtoolR', 1)
    expect(anchor.isResolved).toBe(true)
    expect(anchor.isSlotResolved).toBe(false)
    expect(anchor.position).toEqual({ x: 5, y: 6, z: 7 })
  })

  it('resolves multi-digit slots', () => {
    const anchor = resolveParentAnchor(SLOT_MESHES, 'HandtoolR', 17)
    expect(anchor.isSlotResolved).toBe(true)
    expect(anchor.position).toEqual({ x: 10, y: 20, z: 30 })
  })

  it('falls back to the slot mesh translation when it has no vertices', () => {
    const anchor = resolveParentAnchor(SLOT_MESHES, 'HandtoolR', 3)
    expect(anchor.isSlotResolved).toBe(true)
    expect(anchor.position).toEqual({ x: -1, y: -2, z: -3 })
  })

  it('requires the slot mesh to sit on the matching bone', () => {
    const anchor = resolveParentAnchor(SLOT_MESHES, 'backtool', 2)
    expect(anchor.isResolved).toBe(true)
    expect(anchor.isSlotResolved).toBe(false)
    expect(anchor.position).toEqual({ x: 0, y: 1, z: -2 })
  })

  it('keeps unresolved parents at the origin even with a slot', () => {
    const anchor = resolveParentAnchor(SLOT_MESHES, 'ghost', 2)
    expect(anchor.isResolved).toBe(false)
    expect(anchor.isSlotResolved).toBe(false)
    expect(anchor.position).toEqual({ x: 0, y: 0, z: 0 })
  })
})

describe('effectRotationQuaternion', () => {
  const HALF_SQRT2 = Math.SQRT1_2

  it('converts axis-angle (degrees) to a unit quaternion', () => {
    const q = effectRotationQuaternion({ x: 0, y: 1, z: 0 }, 90)
    expect(q.x).toBeCloseTo(0)
    expect(q.y).toBeCloseTo(HALF_SQRT2)
    expect(q.z).toBeCloseTo(0)
    expect(q.w).toBeCloseTo(HALF_SQRT2)
  })

  it('normalizes a non-unit axis', () => {
    const q = effectRotationQuaternion({ x: 0, y: 10, z: 0 }, 90)
    expect(q.y).toBeCloseTo(HALF_SQRT2)
    expect(q.w).toBeCloseTo(HALF_SQRT2)
  })

  it('supports negative angles', () => {
    const q = effectRotationQuaternion({ x: 0, y: 0, z: 1 }, -90)
    expect(q.z).toBeCloseTo(-HALF_SQRT2)
    expect(q.w).toBeCloseTo(HALF_SQRT2)
  })

  it('returns identity for a zero axis or zero angle', () => {
    const identity = { x: 0, y: 0, z: 0, w: 1 }
    expect(effectRotationQuaternion({ x: 0, y: 0, z: 0 }, 90)).toEqual(identity)
    expect(effectRotationQuaternion({ x: 1, y: 0, z: 0 }, 0)).toEqual(identity)
  })

  it('returns identity for non-finite inputs', () => {
    const identity = { x: 0, y: 0, z: 0, w: 1 }
    expect(effectRotationQuaternion({ x: Number.NaN, y: 0, z: 0 }, 90)).toEqual(identity)
    expect(effectRotationQuaternion({ x: 1, y: 0, z: 0 }, Number.POSITIVE_INFINITY)).toEqual(
      identity
    )
  })
})

describe('effectAnchorWorld', () => {
  it('adds the row offset after slot anchor resolution', () => {
    const anchor = effectAnchorWorld(SLOT_MESHES, {
      parent: 'HandtoolR',
      slot: 17,
      offset: { x: 1, y: -1, z: 2 }
    })
    expect(anchor.isSlotResolved).toBe(true)
    expect(anchor.position).toEqual({ x: 11, y: 19, z: 32 })
  })
})

describe('effectAnchorWorld (base)', () => {
  it('adds the row offset in native units (no scale factor)', () => {
    const anchor = effectAnchorWorld(MESHES, {
      parent: 'HandtoolR',
      offset: { x: -1.1, y: 1.5, z: 10 }
    })
    expect(anchor.isResolved).toBe(true)
    expect(anchor.position.x).toBeCloseTo(5 + -1.1)
    expect(anchor.position.y).toBeCloseTo(6 + 1.5)
    expect(anchor.position.z).toBeCloseTo(7 + 10)
  })

  it('keeps the native offset even when the parent is unresolved', () => {
    const anchor = effectAnchorWorld(MESHES, { parent: 'ghost', offset: { x: 100, y: 0, z: 0 } })
    expect(anchor.isResolved).toBe(false)
    expect(anchor.position).toEqual({ x: 100, y: 0, z: 0 })
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

describe('multi-source emitter resolution', () => {
  const parse = (xml: string): ReturnType<typeof parseEffectXml> =>
    parseEffectXml(new TextEncoder().encode(xml))
  const docA = parse(
    `<effect_ver7 version="7">
  <emitter classname="CEmitterType" name="dark_wind01" />
  <emitter classname="CEmitterType" name="shared_fx" />
</effect_ver7>`
  )
  const docB = parse(
    `<effect_ver7 version="7">
  <emitter classname="CEmitterType" name="aura01" />
  <emitter classname="CEmitterType" name="SHARED_FX" />
</effect_ver7>`
  )

  it('resolveEmitterAcross returns the first source containing the emitter', () => {
    expect(resolveEmitterAcross([docA, docB], 'aura01')).toEqual({
      sourceIndex: 1,
      emitterIndex: 0
    })
    expect(resolveEmitterAcross([docA, docB], 'shared_fx')).toEqual({
      sourceIndex: 0,
      emitterIndex: 1
    })
  })

  it('resolveEmitterAcross returns null for unknown names or no sources', () => {
    expect(resolveEmitterAcross([docA, docB], 'missing_fx')).toBeNull()
    expect(resolveEmitterAcross([], 'dark_wind01')).toBeNull()
  })

  it('mergedEmitterNames merges in source order, deduped case-insensitively', () => {
    expect(mergedEmitterNames([docA, docB])).toEqual(['dark_wind01', 'shared_fx', 'aura01'])
    expect(mergedEmitterNames([])).toEqual([])
  })
})

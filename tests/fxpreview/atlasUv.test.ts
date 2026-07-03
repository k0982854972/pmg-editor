/**
 * Spec for the pure atlas-cell -> UV offset/repeat math shared by the FX
 * preview and the meshdesc preview (src/renderer/src/fx/preview/atlasUv.ts)
 * plus the tas_classname mode derivation in particleCompile.ts.
 *
 * Modes mirror the Mabinogi <Texture> families found in the sample corpus
 * (39,925 nodes across 489 effect XMLs):
 * - tas_grid: column x row GRID, x/y are 0-based CELL INDICES (top-left
 *   origin); no pixel attributes. Static cell.
 * - tas_dynamicgrid: pixel rect tex_width/tex_height/x/y/width/height is
 *   the full animation strip; column x row divides it into frames advanced
 *   by ani_loop_per_sec.
 * - tas_crop: pixel rect x/y/width/height without texture dimensions; the
 *   runtime texture size must be supplied.
 * - tas_default / tas_uvscroll / unknown: whole texture.
 * UV convention: transform is [offsetU, offsetV, repeatU, repeatV] with
 * texUv = offset + quadUv * repeat; flipY=false textures (DDS DataTexture)
 * get a mirrored V axis (negative repeatV) so the image samples top-down.
 */
import { describe, expect, it } from 'vitest'
import { parseEffectXml } from '../../src/core/fx/effectXml'
import { atlasUvTransform } from '../../src/renderer/src/fx/preview/atlasUv'
import { compileEmitter, type AtlasCell } from '../../src/renderer/src/fx/preview/particleCompile'

const cell = (overrides: Partial<AtlasCell>): AtlasCell => ({
  texture: 'tex',
  mode: 'whole',
  x: 0,
  y: 0,
  width: 0,
  height: 0,
  texWidth: 0,
  texHeight: 0,
  column: 1,
  row: 1,
  aniLoopPerSec: 0,
  ...overrides
})

const atlasOf = (textureXml: string): AtlasCell | null => {
  const doc = parseEffectXml(
    new TextEncoder().encode(
      `<?xml version="1.0" encoding="utf-8"?>
<EffectGroup classname="EffectGroup[10]" name="t">
  <emitter classname="CEmitterType[10]">
    <EffectType classname="CParticleType[10]">${textureXml}</EffectType>
  </emitter>
</EffectGroup>`
    )
  )
  const compiled = compileEmitter(doc, 0)
  if (!compiled) throw new Error('expected emitter to compile')
  return compiled.effectTypes[0].atlas
}

describe('parseAtlas mode derivation (tas_classname)', () => {
  it('classifies tas_grid[N], bare tas_grid and tas_dynamicgrid[N]', () => {
    expect(
      atlasOf('<Texture tas_classname="tas_grid[10]" texture="t" column="4" row="4" x="3" y="3" />')
    ).toMatchObject({ mode: 'grid', column: 4, row: 4, x: 3, y: 3 })
    expect(
      atlasOf('<Texture tas_classname="tas_grid" texture="t" column="4" row="32" x="1" y="6" />')
    ).toMatchObject({ mode: 'grid' })
    expect(
      atlasOf(
        '<Texture tas_classname="tas_dynamicgrid[10]" texture="t" tex_width="512" tex_height="512"' +
          ' x="0" y="0" width="512" height="64" column="16" row="1" ani_loop_per_sec="2" />'
      )
    ).toMatchObject({ mode: 'dynamicgrid', texWidth: 512, column: 16, aniLoopPerSec: 2 })
  })

  it('classifies tas_crop, tas_default and tas_uvscroll', () => {
    expect(
      atlasOf(
        '<Texture tas_classname="tas_crop[10]" texture="t" x="0" y="496" width="192" height="16" />'
      )
    ).toMatchObject({ mode: 'crop', x: 0, y: 496, width: 192, height: 16 })
    expect(atlasOf('<Texture tas_classname="tas_default[10]" texture="t" />')).toMatchObject({
      mode: 'whole'
    })
    expect(
      atlasOf('<Texture tas_classname="tas_uvscroll[10]" texture="t" u_speed="8" v_speed="0" />')
    ).toMatchObject({ mode: 'whole' })
  })

  it('infers the mode from attributes when tas_classname is missing', () => {
    expect(
      atlasOf(
        '<Texture texture="t" tex_width="512" tex_height="256" x="0" y="128" width="128"' +
          ' height="128" column="2" row="2" />'
      )
    ).toMatchObject({ mode: 'dynamicgrid' })
    expect(atlasOf('<Texture texture="t" column="4" row="4" x="3" y="3" />')).toMatchObject({
      mode: 'grid'
    })
    expect(atlasOf('<Texture texture="t" x="0" y="496" width="192" height="16" />')).toMatchObject({
      mode: 'crop'
    })
    expect(atlasOf('<Texture texture="t" />')).toMatchObject({ mode: 'whole' })
  })
})

describe('atlasUvTransform: whole texture', () => {
  it('returns identity for a null atlas or whole mode', () => {
    expect(atlasUvTransform(null, true, 0)).toEqual([0, 0, 1, 1])
    expect(atlasUvTransform(null, false, 0)).toEqual([0, 1, 1, -1])
    expect(atlasUvTransform(cell({ mode: 'whole' }), false, 0)).toEqual([0, 1, 1, -1])
  })
})

describe('atlasUvTransform: tas_grid cells', () => {
  it('cuts a 4x4 grid and selects cell (3,3) — user reference case', () => {
    const atlas = cell({ mode: 'grid', column: 4, row: 4, x: 3, y: 3 })
    // flipY=false (DDS): V mirrored, offsetV points at the cell bottom.
    expect(atlasUvTransform(atlas, false, 0)).toEqual([0.75, 1, 0.25, -0.25])
    expect(atlasUvTransform(atlas, true, 0)).toEqual([0.75, 0, 0.25, 0.25])
  })

  it('selects cell (7,3) of an 8x4 grid (corpus C2_EGO_magic case)', () => {
    const atlas = cell({ mode: 'grid', column: 8, row: 4, x: 7, y: 3 })
    expect(atlasUvTransform(atlas, false, 0)).toEqual([0.875, 1, 0.125, -0.25])
  })

  it('selects the top-left cell (0,0) with a top-left origin', () => {
    const atlas = cell({ mode: 'grid', column: 4, row: 4, x: 0, y: 0 })
    expect(atlasUvTransform(atlas, false, 0)).toEqual([0, 0.25, 0.25, -0.25])
    expect(atlasUvTransform(atlas, true, 0)).toEqual([0, 0.75, 0.25, 0.25])
  })

  it('treats a 1x1 grid as the whole texture (dominant corpus case)', () => {
    const atlas = cell({ mode: 'grid', column: 1, row: 1, x: 0, y: 0 })
    expect(atlasUvTransform(atlas, false, 0)).toEqual([0, 1, 1, -1])
    expect(atlasUvTransform(atlas, true, 0)).toEqual([0, 0, 1, 1])
  })

  it('wraps out-of-range cell indices instead of sampling outside', () => {
    const atlas = cell({ mode: 'grid', column: 4, row: 4, x: 5, y: 7 })
    expect(atlasUvTransform(atlas, false, 0)).toEqual([0.25, 1, 0.25, -0.25])
  })

  it('ignores emitter time (tas_grid has no animation attributes)', () => {
    const atlas = cell({ mode: 'grid', column: 4, row: 4, x: 2, y: 1 })
    expect(atlasUvTransform(atlas, false, 12345)).toEqual(atlasUvTransform(atlas, false, 0))
  })
})

describe('atlasUvTransform: tas_dynamicgrid pixel rects', () => {
  const base = cell({
    mode: 'dynamicgrid',
    texWidth: 512,
    texHeight: 256,
    x: 0,
    y: 128,
    width: 128,
    height: 128,
    column: 2,
    row: 2
  })

  it('uses frame 0 of the pixel rect when not animating', () => {
    // 128x128 rect at (0,128) split 2x2 -> 64x64 frames; frame 0 top-left.
    expect(atlasUvTransform(base, false, 0)).toEqual([0, 192 / 256, 64 / 512, -(64 / 256)])
    expect(atlasUvTransform(base, true, 0)).toEqual([0, 1 - 192 / 256, 64 / 512, 64 / 256])
  })

  it('advances animation frames with ani_loop_per_sec', () => {
    const animated = cell({ ...base, aniLoopPerSec: 1 })
    // 4 frames, 1 loop/s: at 250ms -> frame 1 = column 1 of the top row.
    expect(atlasUvTransform(animated, false, 250)).toEqual([
      64 / 512,
      192 / 256,
      64 / 512,
      -(64 / 256)
    ])
    // At 500ms -> frame 2 = first column of the second row.
    expect(atlasUvTransform(animated, false, 500)).toEqual([0, 1, 64 / 512, -(64 / 256)])
  })

  it('falls back to the whole texture when the pixel rect is missing', () => {
    const broken = cell({ mode: 'dynamicgrid', texWidth: 0, texHeight: 0 })
    expect(atlasUvTransform(broken, false, 0)).toEqual([0, 1, 1, -1])
  })
})

describe('atlasUvTransform: tas_crop pixel rects', () => {
  const crop = cell({ mode: 'crop', x: 0, y: 496, width: 192, height: 16 })

  it('crops using the supplied runtime texture size', () => {
    expect(atlasUvTransform(crop, false, 0, { width: 512, height: 512 })).toEqual([
      0,
      1,
      192 / 512,
      -(16 / 512)
    ])
  })

  it('falls back to the whole texture without a texture size', () => {
    expect(atlasUvTransform(crop, false, 0)).toEqual([0, 1, 1, -1])
  })
})

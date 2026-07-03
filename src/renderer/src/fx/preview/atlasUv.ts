/**
 * Pure atlas-cell -> UV offset/repeat math shared by previewScene.ts and
 * meshdescScene.ts (no three.js). The returned transform is
 * [offsetU, offsetV, repeatU, repeatV] with texUv = offset + quadUv * repeat.
 *
 * Cell semantics per AtlasMode (derived from the sample corpus — see
 * particleCompile.ts):
 * - grid: x/y are 0-based cell indices into a column x row grid (top-left
 *   origin); indices wrap. Static (tas_grid has no animation attributes).
 * - dynamicgrid: the pixel rect is the full animation strip, divided into
 *   column x row frames advanced globally by ani_loop_per_sec.
 * - crop: pixel rect without texture dimensions; needs the runtime texture
 *   size (falls back to the whole texture without one).
 * - whole: the entire texture.
 * flipY=false textures (DDS DataTextures) get a mirrored V axis (negative
 * repeatV, offset at the cell bottom) so the image samples top-down.
 * Tested in tests/fxpreview/atlasUv.test.ts.
 */
import type { AtlasCell } from './particleCompile'

export interface TextureSize {
  readonly width: number
  readonly height: number
}

export type UvTransform = readonly [number, number, number, number]

const MS_PER_SECOND = 1000

const wholeTexture = (flipY: boolean): UvTransform => (flipY ? [0, 0, 1, 1] : [0, 1, 1, -1])

/** Pixel rect (top-left origin) on a texWidth x texHeight texture. */
function rectUv(
  pixelX: number,
  pixelY: number,
  width: number,
  height: number,
  texWidth: number,
  texHeight: number,
  flipY: boolean
): UvTransform {
  const repeatX = width / texWidth
  const repeatY = height / texHeight
  if (flipY) {
    return [pixelX / texWidth, 1 - (pixelY + height) / texHeight, repeatX, repeatY]
  }
  return [pixelX / texWidth, (pixelY + height) / texHeight, repeatX, -repeatY]
}

const wrapIndex = (value: number, count: number): number => {
  const wrapped = Math.floor(value) % count
  return wrapped < 0 ? wrapped + count : wrapped
}

function gridUv(atlas: AtlasCell, flipY: boolean): UvTransform {
  const column = Math.max(1, Math.floor(atlas.column))
  const row = Math.max(1, Math.floor(atlas.row))
  const cellX = wrapIndex(atlas.x, column)
  const cellY = wrapIndex(atlas.y, row)
  return rectUv(cellX, cellY, 1, 1, column, row, flipY)
}

function dynamicGridUv(atlas: AtlasCell, flipY: boolean, timeMs: number): UvTransform | null {
  if (atlas.texWidth <= 0 || atlas.texHeight <= 0 || atlas.width <= 0 || atlas.height <= 0) {
    return null
  }
  const column = Math.max(1, Math.floor(atlas.column))
  const row = Math.max(1, Math.floor(atlas.row))
  const frames = column * row
  let frame = 0
  if (frames > 1 && atlas.aniLoopPerSec > 0) {
    frame = Math.floor((timeMs / MS_PER_SECOND) * atlas.aniLoopPerSec * frames) % frames
  }
  const frameWidth = atlas.width / column
  const frameHeight = atlas.height / row
  const pixelX = atlas.x + (frame % column) * frameWidth
  const pixelY = atlas.y + Math.floor(frame / column) * frameHeight
  return rectUv(pixelX, pixelY, frameWidth, frameHeight, atlas.texWidth, atlas.texHeight, flipY)
}

function cropUv(
  atlas: AtlasCell,
  flipY: boolean,
  textureSize: TextureSize | null
): UvTransform | null {
  const texWidth = atlas.texWidth > 0 ? atlas.texWidth : (textureSize?.width ?? 0)
  const texHeight = atlas.texHeight > 0 ? atlas.texHeight : (textureSize?.height ?? 0)
  if (texWidth <= 0 || texHeight <= 0 || atlas.width <= 0 || atlas.height <= 0) return null
  return rectUv(atlas.x, atlas.y, atlas.width, atlas.height, texWidth, texHeight, flipY)
}

/**
 * UV transform for the atlas cell at emitter time `timeMs` (per-particle
 * frame phase is not modelled). `textureSize` enables tas_crop rects,
 * which do not carry texture dimensions in the XML.
 */
export function atlasUvTransform(
  atlas: AtlasCell | null,
  flipY: boolean,
  timeMs: number,
  textureSize?: TextureSize | null
): UvTransform {
  if (!atlas) return wholeTexture(flipY)
  switch (atlas.mode) {
    case 'grid':
      return gridUv(atlas, flipY)
    case 'dynamicgrid':
      return dynamicGridUv(atlas, flipY, timeMs) ?? wholeTexture(flipY)
    case 'crop':
      return cropUv(atlas, flipY, textureSize ?? null) ?? wholeTexture(flipY)
    default:
      return wholeTexture(flipY)
  }
}

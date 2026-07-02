/**
 * Re-encode RGBA8 pixels into an existing DDS file's own format.
 * The original header (and any trailing bytes) are kept verbatim; only the
 * mip chain bytes are replaced, so no metadata or format detail is lost.
 * DXT endpoints are picked as the min/max-luminance texels (stb_dxt-style
 * simple fit); palette interpolation is shared with ddsDecode.ts so the
 * round trip is self-consistent. Consumed by the 貼圖 workspace UI.
 */
import type { BcCodec, DdsInfo, DdsRgbFormat } from './ddsFormat'
import {
  DDSCAPS2_CUBEMAP,
  DDSCAPS2_VOLUME,
  mipChainByteLength,
  mipLevelByteLength,
  parseDdsHeader
} from './ddsFormat'
import { buildColorPalette, buildDxt5AlphaPalette } from './ddsDecode'
import type { RgbaLevel } from './mipmap'
import { downsampleBox } from './mipmap'

const OPAQUE_THRESHOLD = 128

/**
 * Why (if at all) this file cannot be re-encoded. User-facing (貼圖 tab
 * tooltip), hence Traditional Chinese.
 */
export function encodeUnsupportedReason(info: DdsInfo): string | null {
  if (info.format.kind === 'unsupported') {
    return `不支援的像素格式：${info.format.label}，無法重新編碼`
  }
  if ((info.caps2 & DDSCAPS2_CUBEMAP) !== 0) return '不支援 cubemap 貼圖的重新編碼'
  if ((info.caps2 & DDSCAPS2_VOLUME) !== 0 || info.depth > 1) {
    return '不支援 3D (volume) 貼圖的重新編碼'
  }
  return null
}

function pack565(r: number, g: number, b: number): number {
  return ((r >> 3) << 11) | ((g >> 2) << 5) | (b >> 3)
}

const luminanceOf = (texels: Uint8Array, texel: number): number =>
  299 * texels[texel * 4] + 587 * texels[texel * 4 + 1] + 114 * texels[texel * 4 + 2]

/** Copy the 4x4 block at (bx, by) into a 16-texel RGBA buffer, clamping edges. */
function gatherBlock(level: RgbaLevel, bx: number, by: number): Uint8Array {
  const texels = new Uint8Array(64)
  for (let ty = 0; ty < 4; ty += 1) {
    const y = Math.min(by * 4 + ty, level.height - 1)
    for (let tx = 0; tx < 4; tx += 1) {
      const x = Math.min(bx * 4 + tx, level.width - 1)
      texels.set(
        level.rgba.subarray((y * level.width + x) * 4, (y * level.width + x) * 4 + 4),
        (ty * 4 + tx) * 4
      )
    }
  }
  return texels
}

interface ColorEndpoints {
  readonly c0: number
  readonly c1: number
}

/** Min/max-luminance endpoints over the texels that pass the predicate. */
function pickEndpoints(texels: Uint8Array, isUsable: (texel: number) => boolean): ColorEndpoints {
  let minTexel = -1
  let maxTexel = -1
  let minLum = Number.POSITIVE_INFINITY
  let maxLum = Number.NEGATIVE_INFINITY
  for (let texel = 0; texel < 16; texel += 1) {
    if (!isUsable(texel)) continue
    const lum = luminanceOf(texels, texel)
    if (lum < minLum) {
      minLum = lum
      minTexel = texel
    }
    if (lum > maxLum) {
      maxLum = lum
      maxTexel = texel
    }
  }
  if (maxTexel < 0) return { c0: 0, c1: 0 }
  const packOf = (texel: number): number =>
    pack565(texels[texel * 4], texels[texel * 4 + 1], texels[texel * 4 + 2])
  return { c0: packOf(maxTexel), c1: packOf(minTexel) }
}

/** Encode one 8-byte BC color block into out at offset. */
function encodeColorBlock(
  texels: Uint8Array,
  isDxt1: boolean,
  out: Uint8Array,
  offset: number
): void {
  const hasTransparent =
    isDxt1 &&
    Array.from({ length: 16 }, (_, i) => i).some((t) => texels[t * 4 + 3] < OPAQUE_THRESHOLD)
  const isOpaque = (texel: number): boolean =>
    !hasTransparent || texels[texel * 4 + 3] >= OPAQUE_THRESHOLD
  let { c0, c1 } = pickEndpoints(texels, isOpaque)

  if (hasTransparent) {
    // 3-color + transparent mode requires c0 <= c1.
    if (c0 > c1) [c0, c1] = [c1, c0]
  } else if (c0 < c1) {
    // 4-color mode requires c0 >= c1 (equal endpoints degrade gracefully).
    ;[c0, c1] = [c1, c0]
  }

  const palette = buildColorPalette(c0, c1, isDxt1)
  const usableIndices = palette.transparent3 ? 3 : 4
  let indices = 0
  for (let texel = 0; texel < 16; texel += 1) {
    let best = 0
    if (palette.transparent3 && texels[texel * 4 + 3] < OPAQUE_THRESHOLD) {
      best = 3
    } else {
      let bestDistance = Number.POSITIVE_INFINITY
      for (let i = 0; i < usableIndices; i += 1) {
        const [r, g, b] = palette.colors[i]
        const dr = r - texels[texel * 4]
        const dg = g - texels[texel * 4 + 1]
        const db = b - texels[texel * 4 + 2]
        const distance = dr * dr + dg * dg + db * db
        if (distance < bestDistance) {
          bestDistance = distance
          best = i
        }
      }
    }
    indices |= best << (2 * texel)
  }

  out[offset] = c0 & 0xff
  out[offset + 1] = c0 >> 8
  out[offset + 2] = c1 & 0xff
  out[offset + 3] = c1 >> 8
  out[offset + 4] = indices & 0xff
  out[offset + 5] = (indices >>> 8) & 0xff
  out[offset + 6] = (indices >>> 16) & 0xff
  out[offset + 7] = (indices >>> 24) & 0xff
}

/** Encode one 8-byte DXT3 explicit alpha block. */
function encodeDxt3Alpha(texels: Uint8Array, out: Uint8Array, offset: number): void {
  for (let i = 0; i < 8; i += 1) {
    const low = Math.round(texels[i * 8 + 3] / 17)
    const high = Math.round(texels[i * 8 + 7] / 17)
    out[offset + i] = (high << 4) | low
  }
}

/** Encode one 8-byte DXT5 interpolated alpha block (8-point mode). */
function encodeDxt5Alpha(texels: Uint8Array, out: Uint8Array, offset: number): void {
  let a0 = 0
  let a1 = 255
  for (let texel = 0; texel < 16; texel += 1) {
    const alpha = texels[texel * 4 + 3]
    a0 = Math.max(a0, alpha)
    a1 = Math.min(a1, alpha)
  }
  const palette = buildDxt5AlphaPalette(a0, a1)
  out[offset] = a0
  out[offset + 1] = a1
  let bits = 0n
  for (let texel = 0; texel < 16; texel += 1) {
    const alpha = texels[texel * 4 + 3]
    let best = 0
    let bestDistance = Number.POSITIVE_INFINITY
    for (let i = 0; i < 8; i += 1) {
      const distance = Math.abs(palette[i] - alpha)
      if (distance < bestDistance) {
        bestDistance = distance
        best = i
      }
    }
    bits |= BigInt(best) << BigInt(3 * texel)
  }
  for (let i = 0; i < 6; i += 1) {
    out[offset + 2 + i] = Number((bits >> BigInt(8 * i)) & 0xffn)
  }
}

function encodeBcLevel(codec: BcCodec, level: RgbaLevel): Uint8Array {
  const blocksX = Math.max(1, Math.ceil(level.width / 4))
  const blocksY = Math.max(1, Math.ceil(level.height / 4))
  const blockSize = codec === 'dxt1' ? 8 : 16
  const out = new Uint8Array(blocksX * blocksY * blockSize)
  for (let by = 0; by < blocksY; by += 1) {
    for (let bx = 0; bx < blocksX; bx += 1) {
      const offset = (by * blocksX + bx) * blockSize
      const texels = gatherBlock(level, bx, by)
      if (codec === 'dxt3') encodeDxt3Alpha(texels, out, offset)
      if (codec === 'dxt5') encodeDxt5Alpha(texels, out, offset)
      encodeColorBlock(texels, codec === 'dxt1', out, codec === 'dxt1' ? offset : offset + 8)
    }
  }
  return out
}

function encodeRgbLevel(format: DdsRgbFormat, level: RgbaLevel): Uint8Array {
  const bytesPerPixel = format.bitCount / 8
  const out = new Uint8Array(level.width * level.height * bytesPerPixel)
  const specs = [format.rMask, format.gMask, format.bMask, format.aMask].map((mask) => {
    if (mask === 0) return null
    let shift = 0
    let value = mask >>> 0
    while ((value & 1) === 0) {
      value >>>= 1
      shift += 1
    }
    return { shift, max: value }
  })

  for (let i = 0; i < level.width * level.height; i += 1) {
    let pixel = 0
    for (let c = 0; c < 4; c += 1) {
      const spec = specs[c]
      if (!spec) continue
      const quantized = Math.round((level.rgba[i * 4 + c] * spec.max) / 255)
      pixel |= quantized << spec.shift
    }
    const base = i * bytesPerPixel
    out[base] = pixel & 0xff
    out[base + 1] = (pixel >>> 8) & 0xff
    if (bytesPerPixel >= 3) out[base + 2] = (pixel >>> 16) & 0xff
    if (bytesPerPixel === 4) out[base + 3] = (pixel >>> 24) & 0xff
  }
  return out
}

/**
 * Replace the pixel contents of `original` with `rgba` (mip 0), regenerating
 * the full declared mip chain in the original storage format.
 */
export function replaceDdsPixels(
  original: Uint8Array,
  rgba: Uint8Array,
  width: number,
  height: number
): Uint8Array {
  const info = parseDdsHeader(original)
  const reason = encodeUnsupportedReason(info)
  if (reason) throw new Error(reason)
  if (width !== info.width || height !== info.height) {
    throw new Error(
      `Dimension mismatch: DDS is ${info.width}×${info.height}, replacement is ${width}×${height}`
    )
  }
  if (rgba.length !== width * height * 4) {
    throw new Error(
      `RGBA buffer length ${rgba.length} does not match ${width}×${height} (need ${width * height * 4})`
    )
  }
  const chainLength = mipChainByteLength(info)
  if (original.length < info.headerLength + chainLength) {
    throw new Error(
      `DDS file truncated: declared mip chain needs ${info.headerLength + chainLength} bytes, file has ${original.length}`
    )
  }

  // Full copy keeps header and any trailing bytes verbatim.
  const out = new Uint8Array(original)
  let offset = info.headerLength
  let level: RgbaLevel = { rgba, width, height }
  for (let mip = 0; mip < info.mipMapCount; mip += 1) {
    const encoded =
      info.format.kind === 'bc'
        ? encodeBcLevel(info.format.codec, level)
        : encodeRgbLevel(info.format as DdsRgbFormat, level)
    if (encoded.length !== mipLevelByteLength(info.format, level.width, level.height)) {
      throw new Error('Internal error: encoded mip size mismatch')
    }
    out.set(encoded, offset)
    offset += encoded.length
    if (mip + 1 < info.mipMapCount) level = downsampleBox(level.rgba, level.width, level.height)
  }
  return out
}

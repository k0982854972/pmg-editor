/**
 * DDS mip-0 decode to RGBA8: DXT1 (incl. 1-bit alpha), DXT3, DXT5 and
 * uncompressed 16/24/32-bit bitmask formats. Pure module, no DOM.
 * Palette builders are exported so ddsEncode.ts encodes against the exact
 * same interpolation the decoder uses. Consumed by the 貼圖 workspace UI.
 */
import type { DdsRgbFormat } from './ddsFormat'
import { mipLevelByteLength, parseDdsHeader } from './ddsFormat'

export interface DecodedDds {
  readonly width: number
  readonly height: number
  readonly rgba: Uint8Array
}

export type Rgb = readonly [number, number, number]

/** Expand a packed RGB565 value to 8-bit channels (bit-replication). */
export function expand565(value: number): Rgb {
  const r5 = (value >> 11) & 0x1f
  const g6 = (value >> 5) & 0x3f
  const b5 = value & 0x1f
  return [(r5 << 3) | (r5 >> 2), (g6 << 2) | (g6 >> 4), (b5 << 3) | (b5 >> 2)]
}

export interface ColorPalette {
  readonly colors: readonly [Rgb, Rgb, Rgb, Rgb]
  /** True when index 3 means transparent black (DXT1 3-color mode). */
  readonly transparent3: boolean
}

/** Build the 4-entry color palette for a BC color block. */
export function buildColorPalette(c0: number, c1: number, isDxt1: boolean): ColorPalette {
  const p0 = expand565(c0)
  const p1 = expand565(c1)
  const mix = (a: Rgb, b: Rgb, wa: number, wb: number, div: number): Rgb => [
    Math.floor((a[0] * wa + b[0] * wb) / div),
    Math.floor((a[1] * wa + b[1] * wb) / div),
    Math.floor((a[2] * wa + b[2] * wb) / div)
  ]
  if (isDxt1 && c0 <= c1) {
    return { colors: [p0, p1, mix(p0, p1, 1, 1, 2), [0, 0, 0]], transparent3: true }
  }
  return {
    colors: [p0, p1, mix(p0, p1, 2, 1, 3), mix(p0, p1, 1, 2, 3)],
    transparent3: false
  }
}

/** Build the 8-entry DXT5 alpha palette. */
export function buildDxt5AlphaPalette(a0: number, a1: number): readonly number[] {
  const palette = [a0, a1]
  if (a0 > a1) {
    for (let i = 1; i <= 6; i += 1) palette.push(Math.floor(((7 - i) * a0 + i * a1) / 7))
  } else {
    for (let i = 1; i <= 4; i += 1) palette.push(Math.floor(((5 - i) * a0 + i * a1) / 5))
    palette.push(0, 255)
  }
  return palette
}

type AlphaReader = (data: Uint8Array, blockOffset: number) => readonly number[]

const readDxt3Alpha: AlphaReader = (data, offset) => {
  const alphas: number[] = []
  for (let i = 0; i < 8; i += 1) {
    const byte = data[offset + i]
    alphas.push((byte & 0x0f) * 17, (byte >> 4) * 17)
  }
  return alphas
}

const readDxt5Alpha: AlphaReader = (data, offset) => {
  const palette = buildDxt5AlphaPalette(data[offset], data[offset + 1])
  const alphas: number[] = []
  for (let half = 0; half < 2; half += 1) {
    const base = offset + 2 + half * 3
    const bits = data[base] | (data[base + 1] << 8) | (data[base + 2] << 16)
    for (let i = 0; i < 8; i += 1) alphas.push(palette[(bits >> (3 * i)) & 0x7])
  }
  return alphas
}

function decodeBc(
  codec: 'dxt1' | 'dxt3' | 'dxt5',
  data: Uint8Array,
  width: number,
  height: number
): Uint8Array {
  const out = new Uint8Array(width * height * 4)
  const blocksX = Math.max(1, Math.ceil(width / 4))
  const blocksY = Math.max(1, Math.ceil(height / 4))
  const blockSize = codec === 'dxt1' ? 8 : 16
  const alphaReader = codec === 'dxt3' ? readDxt3Alpha : codec === 'dxt5' ? readDxt5Alpha : null

  for (let by = 0; by < blocksY; by += 1) {
    for (let bx = 0; bx < blocksX; bx += 1) {
      const offset = (by * blocksX + bx) * blockSize
      const alphas = alphaReader ? alphaReader(data, offset) : null
      const colorOffset = alphaReader ? offset + 8 : offset
      const c0 = data[colorOffset] | (data[colorOffset + 1] << 8)
      const c1 = data[colorOffset + 2] | (data[colorOffset + 3] << 8)
      const palette = buildColorPalette(c0, c1, codec === 'dxt1')
      const indices =
        data[colorOffset + 4] |
        (data[colorOffset + 5] << 8) |
        (data[colorOffset + 6] << 16) |
        (data[colorOffset + 7] << 24)

      for (let ty = 0; ty < 4; ty += 1) {
        const y = by * 4 + ty
        if (y >= height) break
        for (let tx = 0; tx < 4; tx += 1) {
          const x = bx * 4 + tx
          if (x >= width) continue
          const texel = ty * 4 + tx
          const index = (indices >>> (2 * texel)) & 0x3
          const transparent = palette.transparent3 && index === 3
          const [r, g, b] = palette.colors[index]
          const o = (y * width + x) * 4
          out[o] = r
          out[o + 1] = g
          out[o + 2] = b
          out[o + 3] = transparent ? 0 : (alphas?.[texel] ?? 255)
        }
      }
    }
  }
  return out
}

interface MaskSpec {
  readonly shift: number
  readonly max: number
}

function maskSpec(mask: number): MaskSpec | null {
  if (mask === 0) return null
  let shift = 0
  let value = mask >>> 0
  while ((value & 1) === 0) {
    value >>>= 1
    shift += 1
  }
  return { shift, max: value }
}

function extractChannel(pixel: number, spec: MaskSpec | null, fallback: number): number {
  if (!spec) return fallback
  const raw = (pixel >>> spec.shift) & spec.max
  return Math.round((raw * 255) / spec.max)
}

function decodeRgb(
  format: DdsRgbFormat,
  data: Uint8Array,
  width: number,
  height: number
): Uint8Array {
  const out = new Uint8Array(width * height * 4)
  const bytesPerPixel = format.bitCount / 8
  const rSpec = maskSpec(format.rMask)
  const gSpec = maskSpec(format.gMask)
  const bSpec = maskSpec(format.bMask)
  const aSpec = maskSpec(format.aMask)

  for (let i = 0; i < width * height; i += 1) {
    const base = i * bytesPerPixel
    let pixel = data[base] | (data[base + 1] << 8)
    if (bytesPerPixel >= 3) pixel |= data[base + 2] << 16
    if (bytesPerPixel === 4) pixel |= data[base + 3] << 24
    const o = i * 4
    out[o] = extractChannel(pixel, rSpec, 0)
    out[o + 1] = extractChannel(pixel, gSpec, 0)
    out[o + 2] = extractChannel(pixel, bSpec, 0)
    out[o + 3] = extractChannel(pixel, aSpec, 255)
  }
  return out
}

/** Decode mip level 0 of a DDS file to tightly packed RGBA8. */
export function decodeDds(bytes: Uint8Array): DecodedDds {
  const info = parseDdsHeader(bytes)
  const { format, width, height } = info
  if (format.kind === 'unsupported') {
    throw new Error(`Unsupported DDS pixel format: ${format.label}`)
  }
  const mip0Length = mipLevelByteLength(format, width, height)
  const data = bytes.subarray(info.headerLength)
  if (data.byteLength < mip0Length) {
    throw new Error(
      `DDS pixel data truncated (${data.byteLength} bytes, mip 0 needs ${mip0Length})`
    )
  }
  const rgba =
    format.kind === 'bc'
      ? decodeBc(format.codec, data, width, height)
      : decodeRgb(format, data, width, height)
  return { width, height, rgba }
}

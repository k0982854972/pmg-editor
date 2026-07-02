import { describe, expect, it } from 'vitest'
import { decodeDds } from '../../src/core/dds/ddsDecode'
import { encodeUnsupportedReason, replaceDdsPixels } from '../../src/core/dds/ddsEncode'
import { mipChainByteLength, parseDdsHeader } from '../../src/core/dds/ddsFormat'
import { buildDdsFixture } from './ddsFixture'

const flatRgba = (width: number, height: number, pixel: readonly number[]): Uint8Array => {
  const rgba = new Uint8Array(width * height * 4)
  for (let i = 0; i < width * height; i += 1) rgba.set(pixel, i * 4)
  return rgba
}

describe('replaceDdsPixels format preservation', () => {
  it('keeps the original header bytes verbatim, including reserved fields', () => {
    const original = buildDdsFixture({ width: 4, height: 4, fourCC: 'DXT5' })
    original[32] = 0xab // poke dwReserved1 to prove verbatim copy
    const out = replaceDdsPixels(original, flatRgba(4, 4, [255, 0, 0, 255]), 4, 4)
    expect(Array.from(out.subarray(0, 128))).toEqual(Array.from(original.subarray(0, 128)))
  })

  it('produces output of exactly the original byte length', () => {
    const original = buildDdsFixture({ width: 8, height: 8, mipMapCount: 4, fourCC: 'DXT1' })
    const out = replaceDdsPixels(original, flatRgba(8, 8, [0, 255, 0, 255]), 8, 8)
    expect(out.length).toBe(original.length)
  })

  it('re-encodes every mip level of the declared chain', () => {
    const original = buildDdsFixture({ width: 8, height: 8, mipMapCount: 4, fourCC: 'DXT1' })
    original.fill(0xab, 128) // sentinel pixel data
    const out = replaceDdsPixels(original, flatRgba(8, 8, [255, 0, 0, 255]), 8, 8)
    const info = parseDdsHeader(out)
    const chainEnd = 128 + mipChainByteLength(info)
    expect(out.subarray(128, chainEnd).some((b) => b === 0xab)).toBe(false)
    // Last mip (1x1) must decode back to red: flat blocks encode c0 = c1 = 0xF800.
    const lastBlock = Array.from(out.subarray(chainEnd - 8, chainEnd - 4))
    expect(lastBlock).toEqual([0x00, 0xf8, 0x00, 0xf8])
  })
})

describe('replaceDdsPixels round-trips', () => {
  it('round-trips a flat 565-representable color exactly through DXT1', () => {
    const original = buildDdsFixture({ width: 4, height: 4, fourCC: 'DXT1' })
    const out = replaceDdsPixels(original, flatRgba(4, 4, [255, 0, 0, 255]), 4, 4)
    const { rgba } = decodeDds(out)
    for (let i = 0; i < 16; i += 1) {
      expect(Array.from(rgba.subarray(i * 4, i * 4 + 4))).toEqual([255, 0, 0, 255])
    }
  })

  it('round-trips a two-color, two-alpha block through DXT5 within tolerance', () => {
    const original = buildDdsFixture({ width: 4, height: 4, fourCC: 'DXT5' })
    const source = new Uint8Array(4 * 4 * 4)
    for (let i = 0; i < 16; i += 1) {
      source.set(i < 8 ? [255, 0, 0, 255] : [0, 0, 255, 64], i * 4)
    }
    const out = replaceDdsPixels(original, source, 4, 4)
    const { rgba } = decodeDds(out)
    for (let i = 0; i < source.length; i += 1) {
      expect(Math.abs(rgba[i] - source[i])).toBeLessThanOrEqual(8)
    }
  })

  it('encodes DXT1 one-bit alpha for transparent pixels', () => {
    const original = buildDdsFixture({ width: 4, height: 4, fourCC: 'DXT1' })
    const source = flatRgba(4, 4, [255, 0, 0, 255])
    source.set([0, 0, 0, 0], 0) // texel 0 transparent
    const out = replaceDdsPixels(original, source, 4, 4)
    const { rgba } = decodeDds(out)
    expect(rgba[3]).toBe(0)
    expect(Array.from(rgba.subarray(4, 7))).toEqual([255, 0, 0])
    expect(rgba[7]).toBe(255)
  })

  it('round-trips 32-bit A8R8G8B8 pixels exactly', () => {
    const original = buildDdsFixture({
      width: 2,
      height: 2,
      bitCount: 32,
      rMask: 0x00ff0000,
      gMask: 0x0000ff00,
      bMask: 0x000000ff,
      aMask: 0xff000000
    })
    const source = new Uint8Array([1, 2, 3, 4, 250, 128, 64, 255, 0, 0, 0, 0, 13, 37, 200, 90])
    const out = replaceDdsPixels(original, source, 2, 2)
    expect(Array.from(decodeDds(out).rgba)).toEqual(Array.from(source))
  })

  it('round-trips 24-bit R8G8B8 pixels exactly with alpha dropped', () => {
    const original = buildDdsFixture({
      width: 1,
      height: 1,
      bitCount: 24,
      rMask: 0xff0000,
      gMask: 0x00ff00,
      bMask: 0x0000ff
    })
    const out = replaceDdsPixels(original, new Uint8Array([9, 8, 7, 6]), 1, 1)
    expect(Array.from(decodeDds(out).rgba)).toEqual([9, 8, 7, 255])
  })
})

describe('replaceDdsPixels validation', () => {
  it('throws on dimension mismatch with the original file', () => {
    const original = buildDdsFixture({ width: 8, height: 8, fourCC: 'DXT1' })
    expect(() => replaceDdsPixels(original, flatRgba(4, 4, [0, 0, 0, 255]), 4, 4)).toThrow(/8×8/)
  })

  it('throws when the RGBA buffer length does not match the dimensions', () => {
    const original = buildDdsFixture({ width: 4, height: 4, fourCC: 'DXT1' })
    expect(() => replaceDdsPixels(original, new Uint8Array(3), 4, 4)).toThrow(/RGBA/i)
  })

  it('throws for unsupported pixel formats', () => {
    const original = buildDdsFixture({ width: 4, height: 4, fourCC: 'ATI2' })
    expect(() => replaceDdsPixels(original, flatRgba(4, 4, [0, 0, 0, 255]), 4, 4)).toThrow(/ATI2/)
  })

  it('throws when the file is shorter than its declared mip chain', () => {
    const original = buildDdsFixture({ width: 8, height: 8, mipMapCount: 4, fourCC: 'DXT1' })
    const truncated = original.subarray(0, original.length - 8)
    expect(() => replaceDdsPixels(truncated, flatRgba(8, 8, [0, 0, 0, 255]), 8, 8)).toThrow(
      /truncat|short/i
    )
  })
})

describe('encodeUnsupportedReason', () => {
  it('returns null for editable formats', () => {
    const info = parseDdsHeader(buildDdsFixture({ width: 4, height: 4, fourCC: 'DXT1' }))
    expect(encodeUnsupportedReason(info)).toBeNull()
  })

  it('returns a reason for unsupported pixel formats', () => {
    const info = parseDdsHeader(buildDdsFixture({ width: 4, height: 4, fourCC: 'ATI2' }))
    expect(encodeUnsupportedReason(info)).toContain('ATI2')
  })

  it('returns a reason for cubemap textures', () => {
    const info = parseDdsHeader(
      buildDdsFixture({ width: 4, height: 4, fourCC: 'DXT1', caps2: 0x200 })
    )
    expect(encodeUnsupportedReason(info)).not.toBeNull()
  })
})

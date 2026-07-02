import { describe, expect, it } from 'vitest'
import { decodeDds } from '../../src/core/dds/ddsDecode'
import { buildDdsFixture } from './ddsFixture'

const pixelAt = (rgba: Uint8Array, index: number): number[] =>
  Array.from(rgba.subarray(index * 4, index * 4 + 4))

describe('decodeDds DXT1', () => {
  it('decodes a hand-computed four-color block', () => {
    // c0 = 0xF800 (pure red), c1 = 0x001F (pure blue), c0 > c1 -> 4-color mode.
    // Texel indices 0..3 = 0,1,2,3 (byte 0xE4), remaining texels index 0.
    const block = new Uint8Array([0x00, 0xf8, 0x1f, 0x00, 0xe4, 0x00, 0x00, 0x00])
    const dds = buildDdsFixture({ width: 4, height: 4, fourCC: 'DXT1', data: block })
    const { width, height, rgba } = decodeDds(dds)
    expect(width).toBe(4)
    expect(height).toBe(4)
    expect(pixelAt(rgba, 0)).toEqual([255, 0, 0, 255])
    expect(pixelAt(rgba, 1)).toEqual([0, 0, 255, 255])
    // (2*c0 + c1) / 3 and (c0 + 2*c1) / 3 with integer floor division.
    expect(pixelAt(rgba, 2)).toEqual([170, 0, 85, 255])
    expect(pixelAt(rgba, 3)).toEqual([85, 0, 170, 255])
    expect(pixelAt(rgba, 4)).toEqual([255, 0, 0, 255])
  })

  it('decodes three-color mode with one-bit alpha', () => {
    // c0 = 0x001F (blue) <= c1 = 0xF800 (red) -> 3-color mode.
    // Index byte 0x23: texel 0 index 3 = transparent, texel 1 index 0, texel 2 index 2 = midpoint.
    const block = new Uint8Array([0x1f, 0x00, 0x00, 0xf8, 0x23, 0x00, 0x00, 0x00])
    const dds = buildDdsFixture({ width: 4, height: 4, fourCC: 'DXT1', data: block })
    const { rgba } = decodeDds(dds)
    expect(pixelAt(rgba, 0)).toEqual([0, 0, 0, 0])
    expect(pixelAt(rgba, 1)).toEqual([0, 0, 255, 255])
    // Midpoint (c0 + c1) / 2.
    const mid = pixelAt(rgba, 2)
    expect(mid[3]).toBe(255)
    expect(mid[0]).toBe(127)
    expect(mid[2]).toBe(127)
  })

  it('decodes a partial 2x2 block image', () => {
    // Flat red block; only the 2x2 top-left texels are emitted.
    const block = new Uint8Array([0x00, 0xf8, 0x00, 0xf8, 0x00, 0x00, 0x00, 0x00])
    const dds = buildDdsFixture({ width: 2, height: 2, fourCC: 'DXT1', data: block })
    const { width, height, rgba } = decodeDds(dds)
    expect(width).toBe(2)
    expect(height).toBe(2)
    expect(rgba.length).toBe(16)
    expect(pixelAt(rgba, 0)).toEqual([255, 0, 0, 255])
    expect(pixelAt(rgba, 3)).toEqual([255, 0, 0, 255])
  })
})

describe('decodeDds DXT3', () => {
  it('decodes explicit 4-bit alpha with a flat color block', () => {
    // Alpha nibbles: texel0 = 0xF (255), texel1 = 0x8 (136); color block flat red.
    const block = new Uint8Array([
      0x8f, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xf8, 0x00, 0xf8, 0x00, 0x00, 0x00, 0x00
    ])
    const dds = buildDdsFixture({ width: 4, height: 4, fourCC: 'DXT3', data: block })
    const { rgba } = decodeDds(dds)
    expect(pixelAt(rgba, 0)).toEqual([255, 0, 0, 255])
    expect(pixelAt(rgba, 1)).toEqual([255, 0, 0, 136])
    expect(pixelAt(rgba, 2)).toEqual([255, 0, 0, 0])
  })
})

describe('decodeDds DXT5', () => {
  it('decodes interpolated alpha with a hand-computed block', () => {
    // a0 = 255 > a1 = 0 -> 8-point mode. Texel indices: t0=0(255), t1=1(0), t2=2(interp).
    // Packed 3-bit indices for texels 0-7: 0 | 1<<3 | 2<<6 = 136 -> bytes [0x88, 0x00, 0x00].
    const block = new Uint8Array([
      0xff, 0x00, 0x88, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xf8, 0x1f, 0x00, 0x00, 0x00, 0x00, 0x00
    ])
    const dds = buildDdsFixture({ width: 4, height: 4, fourCC: 'DXT5', data: block })
    const { rgba } = decodeDds(dds)
    expect(pixelAt(rgba, 0)[3]).toBe(255)
    expect(pixelAt(rgba, 1)[3]).toBe(0)
    // floor((6*255 + 1*0) / 7) = 218
    expect(pixelAt(rgba, 2)[3]).toBe(218)
    // Color block: c0 red, all color indices 0 -> red everywhere.
    expect(pixelAt(rgba, 0).slice(0, 3)).toEqual([255, 0, 0])
  })
})

describe('decodeDds uncompressed', () => {
  it('decodes 32-bit A8R8G8B8 pixels', () => {
    const dds = buildDdsFixture({
      width: 1,
      height: 1,
      bitCount: 32,
      rMask: 0x00ff0000,
      gMask: 0x0000ff00,
      bMask: 0x000000ff,
      aMask: 0xff000000,
      data: new Uint8Array([0x10, 0x20, 0x30, 0x40])
    })
    const { rgba } = decodeDds(dds)
    expect(pixelAt(rgba, 0)).toEqual([0x30, 0x20, 0x10, 0x40])
  })

  it('decodes 16-bit R5G6B5 pixels with full alpha', () => {
    const dds = buildDdsFixture({
      width: 1,
      height: 1,
      bitCount: 16,
      rMask: 0xf800,
      gMask: 0x07e0,
      bMask: 0x001f,
      data: new Uint8Array([0x00, 0xf8])
    })
    expect(pixelAt(decodeDds(dds).rgba, 0)).toEqual([255, 0, 0, 255])
  })

  it('decodes 24-bit R8G8B8 pixels', () => {
    const dds = buildDdsFixture({
      width: 1,
      height: 1,
      bitCount: 24,
      rMask: 0xff0000,
      gMask: 0x00ff00,
      bMask: 0x0000ff,
      data: new Uint8Array([0x01, 0x02, 0x03])
    })
    expect(pixelAt(decodeDds(dds).rgba, 0)).toEqual([0x03, 0x02, 0x01, 255])
  })
})

describe('decodeDds failures', () => {
  it('throws on unsupported pixel formats', () => {
    const dds = buildDdsFixture({ width: 4, height: 4, fourCC: 'ATI2' })
    expect(() => decodeDds(dds)).toThrow(/ATI2/)
  })

  it('throws when the pixel data is shorter than mip 0', () => {
    const full = buildDdsFixture({ width: 8, height: 8, fourCC: 'DXT1' })
    expect(() => decodeDds(full.subarray(0, 130))).toThrow(/truncat/i)
  })
})

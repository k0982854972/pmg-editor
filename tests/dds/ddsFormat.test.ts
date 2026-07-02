import { describe, expect, it } from 'vitest'
import { describeDds, mipChainByteLength, parseDdsHeader } from '../../src/core/dds/ddsFormat'
import { buildDdsFixture } from './ddsFixture'

describe('parseDdsHeader compressed formats', () => {
  it('parses a DXT1 header', () => {
    const bytes = buildDdsFixture({ width: 64, height: 32, mipMapCount: 3, fourCC: 'DXT1' })
    const info = parseDdsHeader(bytes)
    expect(info.width).toBe(64)
    expect(info.height).toBe(32)
    expect(info.mipMapCount).toBe(3)
    expect(info.headerLength).toBe(128)
    expect(info.format).toMatchObject({ kind: 'bc', codec: 'dxt1', label: 'DXT1' })
  })

  it('parses DXT3 and DXT5 headers', () => {
    const dxt3 = parseDdsHeader(buildDdsFixture({ width: 16, height: 16, fourCC: 'DXT3' }))
    expect(dxt3.format).toMatchObject({ kind: 'bc', codec: 'dxt3' })
    const dxt5 = parseDdsHeader(buildDdsFixture({ width: 16, height: 16, fourCC: 'DXT5' }))
    expect(dxt5.format).toMatchObject({ kind: 'bc', codec: 'dxt5' })
  })

  it('parses a DX10 header with BC3_UNORM as dxt5', () => {
    const bytes = buildDdsFixture({ width: 8, height: 8, fourCC: 'DX10', dxgiFormat: 77 })
    const info = parseDdsHeader(bytes)
    expect(info.headerLength).toBe(148)
    expect(info.format.kind).toBe('bc')
    expect(info.format).toMatchObject({ codec: 'dxt5' })
    expect(info.format.label).toContain('BC3')
  })

  it('reports an unknown fourCC as unsupported with its name in the label', () => {
    const info = parseDdsHeader(buildDdsFixture({ width: 8, height: 8, fourCC: 'ATI2' }))
    expect(info.format.kind).toBe('unsupported')
    expect(info.format.label).toContain('ATI2')
  })

  it('reports an unknown DXGI format as unsupported', () => {
    const bytes = buildDdsFixture({ width: 8, height: 8, fourCC: 'DX10', dxgiFormat: 98 })
    const info = parseDdsHeader(bytes)
    expect(info.format.kind).toBe('unsupported')
    expect(info.format.label).toContain('98')
  })
})

describe('parseDdsHeader uncompressed formats', () => {
  it('parses 32-bit A8R8G8B8 bitmasks', () => {
    const bytes = buildDdsFixture({
      width: 4,
      height: 4,
      bitCount: 32,
      rMask: 0x00ff0000,
      gMask: 0x0000ff00,
      bMask: 0x000000ff,
      aMask: 0xff000000
    })
    const info = parseDdsHeader(bytes)
    expect(info.format).toMatchObject({
      kind: 'rgb',
      bitCount: 32,
      rMask: 0x00ff0000,
      gMask: 0x0000ff00,
      bMask: 0x000000ff,
      aMask: 0xff000000,
      label: 'A8R8G8B8'
    })
  })

  it('parses 16-bit R5G6B5 bitmasks', () => {
    const bytes = buildDdsFixture({
      width: 4,
      height: 4,
      bitCount: 16,
      rMask: 0xf800,
      gMask: 0x07e0,
      bMask: 0x001f
    })
    const info = parseDdsHeader(bytes)
    expect(info.format).toMatchObject({ kind: 'rgb', bitCount: 16, label: 'R5G6B5' })
  })

  it('parses 24-bit R8G8B8 bitmasks', () => {
    const bytes = buildDdsFixture({
      width: 4,
      height: 4,
      bitCount: 24,
      rMask: 0xff0000,
      gMask: 0x00ff00,
      bMask: 0x0000ff
    })
    expect(parseDdsHeader(bytes).format).toMatchObject({ kind: 'rgb', label: 'R8G8B8' })
  })

  it('reports an alpha-only pixel format as unsupported', () => {
    const bytes = buildDdsFixture({ width: 4, height: 4, bitCount: 8, pfFlags: 0x2 })
    expect(parseDdsHeader(bytes).format.kind).toBe('unsupported')
  })
})

describe('parseDdsHeader edge cases', () => {
  it('treats a zero mip map count as one level', () => {
    const info = parseDdsHeader(
      buildDdsFixture({ width: 8, height: 8, mipMapCount: 0, fourCC: 'DXT1' })
    )
    expect(info.mipMapCount).toBe(1)
  })

  it('throws on bad magic', () => {
    const bytes = buildDdsFixture({ width: 8, height: 8, fourCC: 'DXT1' })
    bytes[0] = 0x00
    expect(() => parseDdsHeader(bytes)).toThrow(/magic/i)
  })

  it('throws on truncated header', () => {
    const bytes = buildDdsFixture({ width: 8, height: 8, fourCC: 'DXT1' }).subarray(0, 64)
    expect(() => parseDdsHeader(bytes)).toThrow(/truncat/i)
  })

  it('throws on truncated DX10 extension header', () => {
    const bytes = buildDdsFixture({ width: 8, height: 8, fourCC: 'DX10' }).subarray(0, 130)
    expect(() => parseDdsHeader(bytes)).toThrow(/truncat/i)
  })
})

describe('describeDds', () => {
  it('summarizes format, dimensions and mip count', () => {
    const info = parseDdsHeader(
      buildDdsFixture({ width: 512, height: 512, mipMapCount: 10, fourCC: 'DXT5' })
    )
    expect(describeDds(info)).toBe('DXT5, 512×512, 10 mipmaps')
  })

  it('uses singular wording for a single mip level', () => {
    const info = parseDdsHeader(buildDdsFixture({ width: 4, height: 8, fourCC: 'DXT1' }))
    expect(describeDds(info)).toBe('DXT1, 4×8, 1 mipmap')
  })
})

describe('mipChainByteLength', () => {
  it('sums DXT1 block sizes across the chain', () => {
    const info = parseDdsHeader(
      buildDdsFixture({ width: 8, height: 8, mipMapCount: 4, fourCC: 'DXT1' })
    )
    // 8x8 -> 32, 4x4 -> 8, 2x2 -> 8, 1x1 -> 8
    expect(mipChainByteLength(info)).toBe(56)
  })

  it('sums DXT5 block sizes across the chain', () => {
    const info = parseDdsHeader(
      buildDdsFixture({ width: 8, height: 8, mipMapCount: 2, fourCC: 'DXT5' })
    )
    expect(mipChainByteLength(info)).toBe(80)
  })

  it('sums uncompressed 24-bit sizes across the chain', () => {
    const info = parseDdsHeader(
      buildDdsFixture({
        width: 4,
        height: 4,
        mipMapCount: 3,
        bitCount: 24,
        rMask: 0xff0000,
        gMask: 0x00ff00,
        bMask: 0x0000ff
      })
    )
    // 4x4x3 + 2x2x3 + 1x1x3
    expect(mipChainByteLength(info)).toBe(63)
  })
})

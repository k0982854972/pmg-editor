/**
 * Regression tests for the FX preview texture decode path: Mabinogi ships
 * many uncompressed 16-bit DDS atlas textures (e.g. A1R5G5B5
 * common_effect_add_*.dds) that three's DDSLoader cannot parse; the preview
 * must decode them through src/core/dds/ddsDecode.ts instead. Uses a
 * synthetic A1R5G5B5 fixture plus a real corpus file when present.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { decodeDds } from '../../src/core/dds/ddsDecode'
import { describeDds, parseDdsHeader } from '../../src/core/dds/ddsFormat'
import { buildDdsFixture, fixtureChainBytes } from '../dds/ddsFixture'

const A1R5G5B5 = {
  bitCount: 16,
  rMask: 0x7c00,
  gMask: 0x03e0,
  bMask: 0x001f,
  aMask: 0x8000
} as const

const CORPUS_FILE = join(
  __dirname,
  '..',
  '..',
  'samples',
  'corpus',
  'material',
  'fx',
  'effect',
  'common_effect_add_15.dds'
)

describe('fx preview uncompressed 16-bit DDS decode', () => {
  it('decodes a synthetic A1R5G5B5 fixture with a mip chain', () => {
    // Arrange: 8x8 A1R5G5B5, 4 mips; first pixel opaque pure red (0xfc00).
    const options = { width: 8, height: 8, mipMapCount: 4, ...A1R5G5B5 }
    const data = new Uint8Array(fixtureChainBytes(options))
    data[0] = 0x00
    data[1] = 0xfc
    const bytes = buildDdsFixture({ ...options, data })

    // Act
    const info = parseDdsHeader(bytes)
    const decoded = decodeDds(bytes)

    // Assert
    expect(describeDds(info)).toBe('A1R5G5B5, 8×8, 4 mipmaps')
    expect(decoded.width).toBe(8)
    expect(decoded.height).toBe(8)
    expect(decoded.rgba.length).toBe(8 * 8 * 4)
    expect([...decoded.rgba.subarray(0, 4)]).toEqual([255, 0, 0, 255])
  })

  it.skipIf(!existsSync(CORPUS_FILE))(
    'decodes the real 683KB uncompressed effect atlas that DDSLoader rejects',
    () => {
      // Arrange
      const bytes = new Uint8Array(readFileSync(CORPUS_FILE))

      // Act
      const info = parseDdsHeader(bytes)
      const decoded = decodeDds(bytes)

      // Assert: the exact class from the bug report (512*512*2 + mips).
      expect(describeDds(info)).toBe('A1R5G5B5, 512×512, 10 mipmaps')
      expect(decoded.rgba.length).toBe(512 * 512 * 4)
    }
  )
})

/**
 * Hand-built DDS file fixtures for tests. Layout follows the Microsoft
 * DDS_HEADER spec: 4-byte magic 'DDS ' + 124-byte header (+ 20-byte
 * DDS_HEADER_DXT10 when fourCC is 'DX10'). Consumed by tests/dds/*.test.ts.
 */

const DDSD_CAPS = 0x1
const DDSD_HEIGHT = 0x2
const DDSD_WIDTH = 0x4
const DDSD_PIXELFORMAT = 0x1000
const DDSD_MIPMAPCOUNT = 0x20000
const DDPF_ALPHAPIXELS = 0x1
const DDPF_FOURCC = 0x4
const DDPF_RGB = 0x40
const DDSCAPS_TEXTURE = 0x1000

export interface DdsFixtureOptions {
  readonly width: number
  readonly height: number
  /** Written verbatim to the header; pass 0 to test the "no mip count" case. */
  readonly mipMapCount?: number
  readonly fourCC?: string
  readonly dxgiFormat?: number
  readonly arraySize?: number
  readonly resourceDimension?: number
  readonly bitCount?: number
  readonly rMask?: number
  readonly gMask?: number
  readonly bMask?: number
  readonly aMask?: number
  /** Overrides the derived pixel-format flags when set. */
  readonly pfFlags?: number
  readonly caps2?: number
  /** Pixel data; defaults to a zero-filled full mip chain. */
  readonly data?: Uint8Array
}

function isEightByteBlock(options: DdsFixtureOptions): boolean {
  if (options.fourCC === 'DXT1') return true
  return options.fourCC === 'DX10' && (options.dxgiFormat === 71 || options.dxgiFormat === 72)
}

function levelBytes(options: DdsFixtureOptions, width: number, height: number): number {
  if (options.fourCC) {
    const blockSize = isEightByteBlock(options) ? 8 : 16
    return Math.max(1, Math.ceil(width / 4)) * Math.max(1, Math.ceil(height / 4)) * blockSize
  }
  return width * height * ((options.bitCount ?? 32) / 8)
}

/** Total pixel-data byte length for the fixture's declared mip chain. */
export function fixtureChainBytes(options: DdsFixtureOptions): number {
  const mips = Math.max(1, options.mipMapCount ?? 1)
  let total = 0
  let width = options.width
  let height = options.height
  for (let level = 0; level < mips; level += 1) {
    total += levelBytes(options, width, height)
    width = Math.max(1, width >> 1)
    height = Math.max(1, height >> 1)
  }
  return total
}

export function buildDdsFixture(options: DdsFixtureOptions): Uint8Array {
  const mips = options.mipMapCount ?? 1
  const headerLength = options.fourCC === 'DX10' ? 148 : 128
  const body = options.data ?? new Uint8Array(fixtureChainBytes(options))
  const bytes = new Uint8Array(headerLength + body.length)
  const view = new DataView(bytes.buffer)

  view.setUint32(0, 0x20534444, true)
  view.setUint32(4, 124, true)
  const flags =
    DDSD_CAPS | DDSD_HEIGHT | DDSD_WIDTH | DDSD_PIXELFORMAT | (mips > 1 ? DDSD_MIPMAPCOUNT : 0)
  view.setUint32(8, flags, true)
  view.setUint32(12, options.height, true)
  view.setUint32(16, options.width, true)
  view.setUint32(28, mips, true)
  view.setUint32(76, 32, true)
  if (options.fourCC) {
    view.setUint32(80, options.pfFlags ?? DDPF_FOURCC, true)
    for (let i = 0; i < 4; i += 1) {
      view.setUint8(84 + i, options.fourCC.charCodeAt(i))
    }
  } else {
    const derived = DDPF_RGB | (options.aMask ? DDPF_ALPHAPIXELS : 0)
    view.setUint32(80, options.pfFlags ?? derived, true)
    view.setUint32(88, options.bitCount ?? 32, true)
    view.setUint32(92, options.rMask ?? 0, true)
    view.setUint32(96, options.gMask ?? 0, true)
    view.setUint32(100, options.bMask ?? 0, true)
    view.setUint32(104, options.aMask ?? 0, true)
  }
  view.setUint32(108, DDSCAPS_TEXTURE, true)
  view.setUint32(112, options.caps2 ?? 0, true)
  if (options.fourCC === 'DX10') {
    view.setUint32(128, options.dxgiFormat ?? 77, true)
    view.setUint32(132, options.resourceDimension ?? 3, true)
    view.setUint32(136, 0, true)
    view.setUint32(140, options.arraySize ?? 1, true)
    view.setUint32(144, 0, true)
  }
  bytes.set(body, headerLength)
  return bytes
}

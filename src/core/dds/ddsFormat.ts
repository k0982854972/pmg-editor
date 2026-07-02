/**
 * DDS header parsing (128-byte DDS_HEADER + optional 20-byte DX10 extension).
 * Pure module, no DOM. Structurally invalid files throw; structurally valid
 * files with pixel formats we cannot decode return format.kind 'unsupported'
 * so the UI can still show file info while disabling editing.
 * Consumed by ddsDecode.ts, ddsEncode.ts and the 貼圖 workspace UI.
 */

export const DDS_HEADER_LENGTH = 128
export const DDS_DX10_HEADER_LENGTH = 148

const DDS_MAGIC = 0x20534444 // 'DDS '
const DDPF_ALPHAPIXELS = 0x1
const DDPF_FOURCC = 0x4
const DDPF_RGB = 0x40
export const DDSCAPS2_CUBEMAP = 0x200
export const DDSCAPS2_VOLUME = 0x200000

export type BcCodec = 'dxt1' | 'dxt3' | 'dxt5'

export interface DdsBcFormat {
  readonly kind: 'bc'
  readonly codec: BcCodec
  readonly label: string
}

export interface DdsRgbFormat {
  readonly kind: 'rgb'
  readonly bitCount: number
  readonly rMask: number
  readonly gMask: number
  readonly bMask: number
  readonly aMask: number
  readonly label: string
}

export interface DdsUnsupportedFormat {
  readonly kind: 'unsupported'
  readonly label: string
}

export type DdsFormat = DdsBcFormat | DdsRgbFormat | DdsUnsupportedFormat

export interface DdsInfo {
  readonly width: number
  readonly height: number
  readonly mipMapCount: number
  /** 128, or 148 when a DX10 extension header is present. */
  readonly headerLength: number
  readonly format: DdsFormat
  readonly depth: number
  readonly caps2: number
}

const FOURCC_TO_CODEC: Readonly<Record<string, BcCodec>> = {
  DXT1: 'dxt1',
  DXT2: 'dxt3',
  DXT3: 'dxt3',
  DXT4: 'dxt5',
  DXT5: 'dxt5'
}

const DXGI_TO_CODEC: Readonly<Record<number, { codec: BcCodec; label: string }>> = {
  71: { codec: 'dxt1', label: 'BC1 (DX10)' },
  72: { codec: 'dxt1', label: 'BC1 sRGB (DX10)' },
  74: { codec: 'dxt3', label: 'BC2 (DX10)' },
  75: { codec: 'dxt3', label: 'BC2 sRGB (DX10)' },
  77: { codec: 'dxt5', label: 'BC3 (DX10)' },
  78: { codec: 'dxt5', label: 'BC3 sRGB (DX10)' }
}

const KNOWN_RGB_LABELS: Readonly<Record<string, string>> = {
  '32/16711680/65280/255/4278190080': 'A8R8G8B8',
  '32/16711680/65280/255/0': 'X8R8G8B8',
  '32/255/65280/16711680/4278190080': 'A8B8G8R8',
  '32/255/65280/16711680/0': 'X8B8G8R8',
  '24/16711680/65280/255/0': 'R8G8B8',
  '16/63488/2016/31/0': 'R5G6B5',
  '16/31744/992/31/32768': 'A1R5G5B5',
  '16/3840/240/15/61440': 'A4R4G4B4'
}

function fourCCToString(value: number): string {
  return String.fromCharCode(value & 0xff, (value >> 8) & 0xff, (value >> 16) & 0xff, value >> 24)
}

function rgbLabel(bitCount: number, r: number, g: number, b: number, a: number): string {
  return KNOWN_RGB_LABELS[`${bitCount}/${r}/${g}/${b}/${a}`] ?? `${bitCount}-bit RGB (custom masks)`
}

function parseFourCCFormat(view: DataView, byteLength: number): DdsFormat {
  const fourCC = fourCCToString(view.getUint32(84, true))
  const codec = FOURCC_TO_CODEC[fourCC]
  if (codec) return { kind: 'bc', codec, label: fourCC }
  if (fourCC !== 'DX10') return { kind: 'unsupported', label: `FourCC '${fourCC}'` }

  if (byteLength < DDS_DX10_HEADER_LENGTH) {
    throw new Error('DDS DX10 extension header truncated')
  }
  const dxgiFormat = view.getUint32(128, true)
  const resourceDimension = view.getUint32(132, true)
  const arraySize = view.getUint32(140, true)
  if (resourceDimension !== 3) {
    return { kind: 'unsupported', label: `DX10 resource dimension ${resourceDimension}` }
  }
  if (arraySize > 1) {
    return { kind: 'unsupported', label: `DX10 texture array (${arraySize} entries)` }
  }
  const mapped = DXGI_TO_CODEC[dxgiFormat]
  if (!mapped) return { kind: 'unsupported', label: `DX10 DXGI format ${dxgiFormat}` }
  return { kind: 'bc', codec: mapped.codec, label: mapped.label }
}

function parseRgbFormat(view: DataView, pfFlags: number): DdsFormat {
  const bitCount = view.getUint32(88, true)
  if ((pfFlags & DDPF_RGB) === 0 || ![16, 24, 32].includes(bitCount)) {
    return {
      kind: 'unsupported',
      label: `pixel format flags 0x${pfFlags.toString(16)}, ${bitCount}-bit`
    }
  }
  const rMask = view.getUint32(92, true)
  const gMask = view.getUint32(96, true)
  const bMask = view.getUint32(100, true)
  const aMask = (pfFlags & DDPF_ALPHAPIXELS) !== 0 ? view.getUint32(104, true) : 0
  return {
    kind: 'rgb',
    bitCount,
    rMask,
    gMask,
    bMask,
    aMask,
    label: rgbLabel(bitCount, rMask, gMask, bMask, aMask)
  }
}

export function parseDdsHeader(bytes: Uint8Array): DdsInfo {
  if (bytes.byteLength < DDS_HEADER_LENGTH) {
    throw new Error(`DDS header truncated (${bytes.byteLength} bytes, need 128)`)
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (view.getUint32(0, true) !== DDS_MAGIC) {
    throw new Error("Not a DDS file (bad magic, expected 'DDS ')")
  }
  const headerSize = view.getUint32(4, true)
  if (headerSize !== 124) {
    throw new Error(`Unexpected DDS header size ${headerSize} (expected 124)`)
  }
  const pfSize = view.getUint32(76, true)
  if (pfSize !== 32) {
    throw new Error(`Unexpected DDS pixel format size ${pfSize} (expected 32)`)
  }

  const pfFlags = view.getUint32(80, true)
  const isFourCC = (pfFlags & DDPF_FOURCC) !== 0
  const isDx10 = isFourCC && fourCCToString(view.getUint32(84, true)) === 'DX10'
  const format = isFourCC
    ? parseFourCCFormat(view, bytes.byteLength)
    : parseRgbFormat(view, pfFlags)

  return {
    width: view.getUint32(16, true),
    height: view.getUint32(12, true),
    mipMapCount: Math.max(1, view.getUint32(28, true)),
    headerLength: isDx10 ? DDS_DX10_HEADER_LENGTH : DDS_HEADER_LENGTH,
    format,
    depth: view.getUint32(24, true),
    caps2: view.getUint32(112, true)
  }
}

/** Byte length of one mip level in the file's storage format. */
export function mipLevelByteLength(format: DdsFormat, width: number, height: number): number {
  if (format.kind === 'bc') {
    const blockSize = format.codec === 'dxt1' ? 8 : 16
    return Math.max(1, Math.ceil(width / 4)) * Math.max(1, Math.ceil(height / 4)) * blockSize
  }
  if (format.kind === 'rgb') {
    return width * height * (format.bitCount / 8)
  }
  throw new Error(`Cannot compute mip size for unsupported format: ${format.label}`)
}

/** Total byte length of the declared mip chain (one 2D surface). */
export function mipChainByteLength(info: DdsInfo): number {
  let total = 0
  let width = info.width
  let height = info.height
  for (let level = 0; level < info.mipMapCount; level += 1) {
    total += mipLevelByteLength(info.format, width, height)
    width = Math.max(1, width >> 1)
    height = Math.max(1, height >> 1)
  }
  return total
}

/** Human summary, e.g. "DXT5, 512×512, 10 mipmaps". */
export function describeDds(info: DdsInfo): string {
  const mips = `${info.mipMapCount} mipmap${info.mipMapCount === 1 ? '' : 's'}`
  const cubemap = (info.caps2 & DDSCAPS2_CUBEMAP) !== 0 ? ' (cubemap)' : ''
  return `${info.format.label}, ${info.width}×${info.height}, ${mips}${cubemap}`
}

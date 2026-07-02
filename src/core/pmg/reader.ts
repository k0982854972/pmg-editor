import { BinaryReader } from '../binary/cursor'
import type { FixedString } from '../binary/cursor'
import type { MeshCounts, MeshGroup, MeshHeaderInfo, PmMesh, PmVersion, PmgFile } from './types'
import { PHYSICS_STRIDE } from './types'

export class PmgParseError extends Error {
  constructor(
    message: string,
    readonly offset: number
  ) {
    super(`${message} (offset ${offset})`)
    this.name = 'PmgParseError'
  }
}

const PMG_MAGIC = 'pmg\0'
const PM_MAGIC = 'pm!\0'

function readMagic(r: BinaryReader): string {
  const raw = r.bytes(4)
  return String.fromCharCode(raw[0], raw[1], raw[2], raw[3])
}

function pmVersionOf(major: number, minor: number, offset: number): PmVersion {
  if (major === 1 && minor === 7) return '1.7'
  if (major === 2 && minor === 0) return '2.0'
  if (major === 3 && minor === 0) return '3.0'
  throw new PmgParseError(`unsupported pm! version ${major}.${minor}`, offset)
}

function readCounts(r: BinaryReader): MeshCounts {
  return {
    indexCount: r.i32(),
    faceCount: r.i32(),
    stripIndexCount: r.i32(),
    stripFaceCount: r.i32(),
    vertexCount: r.i32(),
    skinCount: r.i32(),
    physicsCount: r.i32(),
    isAnimated: r.i32(),
    morphFrameSize: r.i32(),
    morphFrameCount: r.i32(),
    unk18: r.i32(),
    unk19: r.i32(),
    unk20: r.i32(),
    unk21: r.i32(),
    unk22: r.i32(),
    indicesSize: r.i32(),
    stripIndicesSize: r.i32(),
    verticesSize: r.i32(),
    skinsSize: r.i32(),
    unk23: r.i32()
  }
}

function readMeshBlock(r: BinaryReader, headerInfo: MeshHeaderInfo): PmMesh {
  const blockStart = r.offset
  const magic = readMagic(r)
  if (magic !== PM_MAGIC) {
    throw new PmgParseError(`bad pm! signature "${magic}"`, blockStart)
  }
  const major = r.u8()
  const minor = r.u8()
  const version = pmVersionOf(major, minor, blockStart + 4)
  const size = r.i32()
  const blockEnd = blockStart + size
  const isV17 = version === '1.7'

  let boneName: FixedString | null = null
  let meshName: FixedString | null = null
  let jointName: FixedString | null = null
  let stateName: FixedString | null = null
  let normalName: FixedString | null = null
  let colorName: FixedString | null = null
  let textureName: FixedString | null = null
  let unk25: FixedString | null = null

  if (isV17) {
    boneName = r.fixedString(32)
    meshName = r.fixedString(128)
    jointName = r.fixedString(32)
    stateName = r.fixedString(32)
    normalName = r.fixedString(32)
    colorName = r.fixedString(32)
  }

  const matrix1 = r.bytes(64)
  const matrix2 = r.bytes(64)
  const index = r.i32()
  const unk8 = r.bytes(8)
  if (isV17) textureName = r.fixedString(32)
  const isTextureMapped = r.i32()
  const unk10 = r.bytes(36)
  const counts = readCounts(r)

  if (!isV17) {
    boneName = r.lpString()
    meshName = r.lpString()
    jointName = r.lpString()
    stateName = r.lpString()
    normalName = r.lpString()
    if (version === '3.0') unk25 = r.lpString()
    colorName = r.lpString()
    textureName = r.lpString()
  }

  // the size field counts itself: 64 on real files = 4 (field) + 60 (5 float3)
  const boundingSize = r.i32()
  if (boundingSize < 4 || boundingSize - 4 > r.remaining) {
    throw new PmgParseError(`invalid bounding block size ${boundingSize}`, r.offset - 4)
  }
  const bounding = r.bytes(boundingSize - 4)

  const indices = r.bytes(counts.indicesSize)
  const stripIndices = r.bytes(counts.stripIndicesSize)
  const vertices = r.bytes(counts.verticesSize)
  const skins = r.bytes(counts.skinsSize)
  const physics = r.bytes(counts.physicsCount * PHYSICS_STRIDE)

  if (r.offset > blockEnd) {
    throw new PmgParseError(`pm! block overran its declared size ${size}`, r.offset)
  }
  const trailer = r.bytes(blockEnd - r.offset)

  return {
    version,
    headerInfo,
    boneName: boneName!,
    meshName: meshName!,
    jointName: jointName!,
    stateName: stateName!,
    normalName: normalName!,
    colorName: colorName!,
    textureName: textureName!,
    unk25,
    matrix1,
    matrix2,
    index,
    unk8,
    isTextureMapped,
    unk10,
    counts,
    bounding,
    indices,
    stripIndices,
    vertices,
    skins,
    physics,
    trailer
  }
}

export function readPmg(data: Uint8Array): PmgFile {
  try {
    const r = new BinaryReader(data)
    const magic = readMagic(r)
    if (magic !== PMG_MAGIC) {
      throw new PmgParseError(`bad pmg signature "${magic}"`, 0)
    }
    const fileVersion = r.bytes(2)
    const headerSize = r.i32()
    const name = r.fixedString(32)
    const unk1 = r.bytes(96)
    const groupCount = r.i32()
    if (groupCount < 0 || groupCount > 0xffff) {
      throw new PmgParseError(`implausible mesh group count ${groupCount}`, r.offset - 4)
    }

    const groupHeaders: Array<{
      name: FixedString
      unk2: FixedString
      headers: MeshHeaderInfo[]
    }> = []
    for (let g = 0; g < groupCount; g++) {
      const groupName = r.fixedString(32)
      const unk2 = r.fixedString(32)
      const meshCount = r.i32()
      if (meshCount < 0 || meshCount > 0xffff) {
        throw new PmgParseError(`implausible mesh count ${meshCount}`, r.offset - 4)
      }
      const headers: MeshHeaderInfo[] = []
      for (let m = 0; m < meshCount; m++) {
        headers.push({
          meshSize: r.i32(),
          boneName: r.fixedString(32),
          meshName: r.fixedString(128),
          jointName: r.fixedString(32),
          index: r.i32(),
          unk9: r.i32()
        })
      }
      groupHeaders.push({ name: groupName, unk2, headers })
    }

    if (headerSize < r.offset || headerSize > data.byteLength) {
      throw new PmgParseError(`headerSize ${headerSize} out of range`, 6)
    }
    const headerPadding = r.bytes(headerSize - r.offset)

    const groups: MeshGroup[] = groupHeaders.map((g) => ({
      name: g.name,
      unk2: g.unk2,
      meshes: g.headers.map((h) => readMeshBlock(r, h))
    }))

    return { fileVersion, name, unk1, headerPadding, groups }
  } catch (err) {
    if (err instanceof PmgParseError) throw err
    if (err instanceof RangeError) throw new PmgParseError(err.message, -1)
    throw err
  }
}

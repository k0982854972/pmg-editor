import { BinaryWriter } from '../binary/cursor'
import type { MeshCounts, PmMesh, PmgFile } from './types'
import { MESH_HEADER_SIZE } from './types'

const PM_PROLOGUE_SIZE = 10 // sig(4) + version(2) + size(4)

const versionBytes = (mesh: PmMesh): [number, number] => {
  if (mesh.version === '1.7') return [1, 7]
  if (mesh.version === '2.0') return [2, 0]
  return [3, 0]
}

/** Sizes are recomputed from the raw blocks; everything else is written as stored. */
const countsFor = (mesh: PmMesh): MeshCounts => ({
  ...mesh.counts,
  indicesSize: mesh.indices.byteLength,
  stripIndicesSize: mesh.stripIndices.byteLength,
  verticesSize: mesh.vertices.byteLength,
  skinsSize: mesh.skins.byteLength
})

function writeCounts(w: BinaryWriter, c: MeshCounts): void {
  w.i32(c.indexCount)
  w.i32(c.faceCount)
  w.i32(c.stripIndexCount)
  w.i32(c.stripFaceCount)
  w.i32(c.vertexCount)
  w.i32(c.skinCount)
  w.i32(c.physicsCount)
  w.i32(c.isAnimated)
  w.i32(c.morphFrameSize)
  w.i32(c.morphFrameCount)
  w.i32(c.unk18)
  w.i32(c.unk19)
  w.i32(c.unk20)
  w.i32(c.unk21)
  w.i32(c.unk22)
  w.i32(c.indicesSize)
  w.i32(c.stripIndicesSize)
  w.i32(c.verticesSize)
  w.i32(c.skinsSize)
  w.i32(c.unk23)
}

function writeMeshBlock(mesh: PmMesh): Uint8Array {
  const isV17 = mesh.version === '1.7'
  const body = new BinaryWriter()

  if (isV17) {
    body.fixedString(mesh.boneName, 32)
    body.fixedString(mesh.meshName, 128)
    body.fixedString(mesh.jointName, 32)
    body.fixedString(mesh.stateName, 32)
    body.fixedString(mesh.normalName, 32)
    body.fixedString(mesh.colorName, 32)
  }

  body.bytes(mesh.matrix1)
  body.bytes(mesh.matrix2)
  body.i32(mesh.index)
  body.bytes(mesh.unk8)
  if (isV17) body.fixedString(mesh.textureName, 32)
  body.i32(mesh.isTextureMapped)
  body.bytes(mesh.unk10)
  writeCounts(body, countsFor(mesh))

  if (!isV17) {
    body.lpString(mesh.boneName)
    body.lpString(mesh.meshName)
    body.lpString(mesh.jointName)
    body.lpString(mesh.stateName)
    body.lpString(mesh.normalName)
    if (mesh.version === '3.0') {
      body.lpString(mesh.unk25 ?? { text: '', raw: new Uint8Array(0) })
    }
    body.lpString(mesh.colorName)
    body.lpString(mesh.textureName)
  }

  body.i32(mesh.bounding.byteLength + 4) // size field counts itself
  body.bytes(mesh.bounding)
  body.bytes(mesh.indices)
  body.bytes(mesh.stripIndices)
  body.bytes(mesh.vertices)
  body.bytes(mesh.skins)
  body.bytes(mesh.physics)
  body.bytes(mesh.trailer)

  const bodyBytes = body.toUint8Array()
  const w = new BinaryWriter()
  w.bytes(Uint8Array.of(0x70, 0x6d, 0x21, 0x00)) // 'pm!\0'
  const [major, minor] = versionBytes(mesh)
  w.u8(major)
  w.u8(minor)
  w.i32(PM_PROLOGUE_SIZE + bodyBytes.byteLength)
  w.bytes(bodyBytes)
  return w.toUint8Array()
}

export function writePmg(file: PmgFile): Uint8Array {
  const blocksByGroup = file.groups.map((g) => g.meshes.map(writeMeshBlock))

  const structuralSize =
    4 + 2 + 4 + 32 + 96 + 4 + file.groups.reduce((sum, g) => sum + 68 + g.meshes.length * MESH_HEADER_SIZE, 0)
  const headerSize = structuralSize + file.headerPadding.byteLength

  const w = new BinaryWriter()
  w.bytes(Uint8Array.of(0x70, 0x6d, 0x67, 0x00)) // 'pmg\0'
  w.bytes(file.fileVersion)
  w.i32(headerSize)
  w.fixedString(file.name, 32)
  w.bytes(file.unk1)
  w.i32(file.groups.length)

  file.groups.forEach((group, gi) => {
    w.fixedString(group.name, 32)
    w.fixedString(group.unk2, 32)
    w.i32(group.meshes.length)
    group.meshes.forEach((mesh, mi) => {
      w.i32(blocksByGroup[gi][mi].byteLength) // meshSize recomputed
      w.fixedString(mesh.headerInfo.boneName, 32)
      w.fixedString(mesh.headerInfo.meshName, 128)
      w.fixedString(mesh.headerInfo.jointName, 32)
      w.i32(mesh.headerInfo.index)
      w.i32(mesh.headerInfo.unk9)
    })
  })

  w.bytes(file.headerPadding)
  for (const blocks of blocksByGroup) for (const block of blocks) w.bytes(block)
  return w.toUint8Array()
}

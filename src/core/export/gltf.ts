/**
 * glTF 2.0 exporter for parsed PMG models.
 *
 * One node/mesh per pm! block. Geometry is passed through unchanged;
 * matrix2 is assigned verbatim to node.matrix (the D3D row-major layout
 * stores translation at elements 12..14, which matches glTF's column-major
 * element order under the transposed row-vector/column-vector convention).
 * TEXCOORD_0 v is flipped, COLOR_0 is normalized u8 RGBA from the stored
 * b,g,r,a bytes.
 */
import { readIndices, readMatrix, readVertex } from '../pmg/access'
import type { PmgFile } from '../pmg/types'

export interface GltfExport {
  readonly json: object
  readonly buffer: Uint8Array
}

const COMPONENT_U16 = 5123
const COMPONENT_F32 = 5126
const COMPONENT_U8 = 5121
const GLB_MAGIC = 0x46546c67
const CHUNK_JSON = 0x4e4f534a
const CHUNK_BIN = 0x004e4942

const align4 = (n: number): number => (n + 3) & ~3

interface BufferViewDef {
  buffer: number
  byteOffset: number
  byteLength: number
  target?: number
}

interface AccessorDef {
  bufferView: number
  componentType: number
  count: number
  type: string
  normalized?: boolean
  min?: number[]
  max?: number[]
}

/** Mutable builder state kept local to buildGltf; the result is frozen data. */
interface Builder {
  chunks: Uint8Array[]
  byteLength: number
  bufferViews: BufferViewDef[]
  accessors: AccessorDef[]
}

function addAccessor(
  b: Builder,
  bytes: Uint8Array,
  accessor: Omit<AccessorDef, 'bufferView'>
): number {
  const byteOffset = b.byteLength
  const padded = new Uint8Array(align4(bytes.byteLength))
  padded.set(bytes)
  b.chunks.push(padded)
  b.byteLength += padded.byteLength
  b.bufferViews.push({ buffer: 0, byteOffset, byteLength: bytes.byteLength })
  b.accessors.push({ ...accessor, bufferView: b.bufferViews.length - 1 })
  return b.accessors.length - 1
}

function buildGltf(file: PmgFile, bufferUri: string | null): GltfExport {
  const b: Builder = { chunks: [], byteLength: 0, bufferViews: [], accessors: [] }
  const nodes: object[] = []
  const meshes: object[] = []

  for (const group of file.groups) {
    for (const mesh of group.meshes) {
      const count = mesh.counts.vertexCount
      const positions = new Float32Array(count * 3)
      const normals = new Float32Array(count * 3)
      const texcoords = new Float32Array(count * 2)
      const colors = new Uint8Array(count * 4)
      const min = [Infinity, Infinity, Infinity]
      const max = [-Infinity, -Infinity, -Infinity]

      for (let i = 0; i < count; i++) {
        const v = readVertex(mesh, i)
        positions.set([v.x, v.y, v.z], i * 3)
        normals.set([v.nx, v.ny, v.nz], i * 3)
        texcoords.set([v.u, 1 - v.v], i * 2)
        colors.set([v.r, v.g, v.b, v.a], i * 4)
        for (const [axis, value] of [v.x, v.y, v.z].entries()) {
          min[axis] = Math.min(min[axis], value)
          max[axis] = Math.max(max[axis], value)
        }
      }

      const indices = readIndices(mesh)
      const indicesAccessor = addAccessor(b, new Uint8Array(indices.buffer.slice(0)), {
        componentType: COMPONENT_U16,
        count: indices.length,
        type: 'SCALAR'
      })
      const positionAccessor = addAccessor(b, new Uint8Array(positions.buffer), {
        componentType: COMPONENT_F32,
        count,
        type: 'VEC3',
        min,
        max
      })
      const normalAccessor = addAccessor(b, new Uint8Array(normals.buffer), {
        componentType: COMPONENT_F32,
        count,
        type: 'VEC3'
      })
      const texcoordAccessor = addAccessor(b, new Uint8Array(texcoords.buffer), {
        componentType: COMPONENT_F32,
        count,
        type: 'VEC2'
      })
      const colorAccessor = addAccessor(b, colors, {
        componentType: COMPONENT_U8,
        count,
        type: 'VEC4',
        normalized: true
      })

      meshes.push({
        name: mesh.meshName.text,
        primitives: [
          {
            attributes: {
              POSITION: positionAccessor,
              NORMAL: normalAccessor,
              TEXCOORD_0: texcoordAccessor,
              COLOR_0: colorAccessor
            },
            indices: indicesAccessor
          }
        ]
      })
      nodes.push({
        name: mesh.meshName.text,
        mesh: meshes.length - 1,
        matrix: readMatrix(mesh.matrix2)
      })
    }
  }

  const buffer = new Uint8Array(b.byteLength)
  let offset = 0
  for (const chunk of b.chunks) {
    buffer.set(chunk, offset)
    offset += chunk.byteLength
  }

  const json = {
    asset: { version: '2.0', generator: 'pmg-editor' },
    scene: 0,
    scenes: [{ nodes: nodes.map((_, i) => i) }],
    nodes,
    meshes,
    buffers: [
      bufferUri === null
        ? { byteLength: buffer.byteLength }
        : { byteLength: buffer.byteLength, uri: bufferUri }
    ],
    bufferViews: b.bufferViews,
    accessors: b.accessors
  }
  return { json, buffer }
}

export function exportGltf(file: PmgFile): GltfExport {
  return buildGltf(file, `${file.name.text}.bin`)
}

/** Pack the model as a binary GLB v2 container (JSON chunk + BIN chunk). */
export function exportGlb(file: PmgFile): Uint8Array {
  const { json, buffer } = buildGltf(file, null)

  const jsonBytes = new TextEncoder().encode(JSON.stringify(json))
  const jsonPadded = new Uint8Array(align4(jsonBytes.byteLength)).fill(0x20)
  jsonPadded.set(jsonBytes)
  const binPadded = new Uint8Array(align4(buffer.byteLength))
  binPadded.set(buffer)

  const total = 12 + 8 + jsonPadded.byteLength + 8 + binPadded.byteLength
  const glb = new Uint8Array(total)
  const view = new DataView(glb.buffer)
  view.setUint32(0, GLB_MAGIC, true)
  view.setUint32(4, 2, true)
  view.setUint32(8, total, true)
  view.setUint32(12, jsonPadded.byteLength, true)
  view.setUint32(16, CHUNK_JSON, true)
  glb.set(jsonPadded, 20)
  const binHeader = 20 + jsonPadded.byteLength
  view.setUint32(binHeader, binPadded.byteLength, true)
  view.setUint32(binHeader + 4, CHUNK_BIN, true)
  glb.set(binPadded, binHeader + 8)
  return glb
}

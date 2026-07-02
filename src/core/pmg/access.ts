/**
 * Typed accessors over the raw geometry blocks of a PmMesh.
 * All reads are explicit little-endian via DataView.
 */
import type { PmMesh, Skin, Vertex } from './types'
import { SKIN_STRIDE, VERTEX_STRIDE } from './types'

const viewOf = (data: Uint8Array): DataView =>
  new DataView(data.buffer, data.byteOffset, data.byteLength)

/** Decode a 64-byte matrix field into 16 numbers (row-major as stored). */
export function readMatrix(raw: Uint8Array): number[] {
  const view = viewOf(raw)
  return Array.from({ length: 16 }, (_, i) => view.getFloat32(i * 4, true))
}

export function readBoundingFloats(mesh: PmMesh): number[] {
  const view = viewOf(mesh.bounding)
  return Array.from({ length: mesh.bounding.byteLength >> 2 }, (_, i) =>
    view.getFloat32(i * 4, true)
  )
}

export function readVertex(mesh: PmMesh, index: number): Vertex {
  const view = viewOf(mesh.vertices)
  const base = index * VERTEX_STRIDE
  return {
    x: view.getFloat32(base, true),
    y: view.getFloat32(base + 4, true),
    z: view.getFloat32(base + 8, true),
    nx: view.getFloat32(base + 12, true),
    ny: view.getFloat32(base + 16, true),
    nz: view.getFloat32(base + 20, true),
    b: view.getUint8(base + 24),
    g: view.getUint8(base + 25),
    r: view.getUint8(base + 26),
    a: view.getUint8(base + 27),
    u: view.getFloat32(base + 28, true),
    v: view.getFloat32(base + 32, true)
  }
}

export function readIndices(mesh: PmMesh): Uint16Array {
  const view = viewOf(mesh.indices)
  return Uint16Array.from({ length: mesh.indices.byteLength >> 1 }, (_, i) =>
    view.getUint16(i * 2, true)
  )
}

export function readStripIndices(mesh: PmMesh): Uint16Array {
  const view = viewOf(mesh.stripIndices)
  return Uint16Array.from({ length: mesh.stripIndices.byteLength >> 1 }, (_, i) =>
    view.getUint16(i * 2, true)
  )
}

export function readSkin(mesh: PmMesh, index: number): Skin {
  const view = viewOf(mesh.skins)
  const base = index * SKIN_STRIDE
  return {
    vertexIndex: view.getInt32(base, true),
    unkA: view.getInt32(base + 4, true),
    weight: view.getFloat32(base + 8, true),
    unkB: view.getInt32(base + 12, true)
  }
}

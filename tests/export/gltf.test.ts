/**
 * glTF 2.0 exporter spec. Structural validity checks against the synthetic
 * fixture (3 vertices, 1 triangle, matrix2[i] = 100 + i).
 */
import { describe, expect, it } from 'vitest'
import { exportGlb, exportGltf } from '../../src/core/export/gltf'
import { readPmg } from '../../src/core/pmg/reader'
import type { PmgFile } from '../../src/core/pmg/types'
import { buildPmgFixture, FIXTURE_VERTICES } from '../fixtures/pmgFixture'

/* eslint-disable @typescript-eslint/no-explicit-any */

const fixtureFile = (): PmgFile => readPmg(buildPmgFixture({ meshes: [{ version: '2.0' }] }))

/** New PmgFile whose first mesh has the given matrix2 floats (immutably rebuilt). */
function withMatrix2(file: PmgFile, floats: number[]): PmgFile {
  const bytes = new Uint8Array(64)
  const view = new DataView(bytes.buffer)
  floats.forEach((f, i) => view.setFloat32(i * 4, f, true))
  const group = file.groups[0]
  const mesh = { ...group.meshes[0], matrix2: bytes }
  return { ...file, groups: [{ ...group, meshes: [mesh] }] }
}

const floatsAt = (buffer: Uint8Array, byteOffset: number, count: number): number[] => {
  const view = new DataView(buffer.buffer, buffer.byteOffset + byteOffset)
  return Array.from({ length: count }, (_, i) => view.getFloat32(i * 4, true))
}

describe('exportGltf', () => {
  const { json, buffer } = exportGltf(fixtureFile()) as { json: any; buffer: Uint8Array }

  it('declares a valid glTF 2.0 asset with one external buffer', () => {
    expect(json.asset.version).toBe('2.0')
    expect(json.buffers).toHaveLength(1)
    expect(json.buffers[0].byteLength).toBe(buffer.byteLength)
    expect(typeof json.buffers[0].uri).toBe('string')
  })

  it('keeps every bufferView 4-aligned and inside the buffer', () => {
    for (const view of json.bufferViews) {
      expect((view.byteOffset ?? 0) % 4).toBe(0)
      expect((view.byteOffset ?? 0) + view.byteLength).toBeLessThanOrEqual(buffer.byteLength)
    }
  })

  it('exposes one mesh primitive with all attributes and u16 indices', () => {
    expect(json.meshes).toHaveLength(1)
    const prim = json.meshes[0].primitives[0]
    for (const key of ['POSITION', 'NORMAL', 'TEXCOORD_0', 'COLOR_0']) {
      expect(prim.attributes[key]).toBeTypeOf('number')
    }
    const indices = json.accessors[prim.indices]
    expect(indices.componentType).toBe(5123)
    expect(indices.type).toBe('SCALAR')
    expect(indices.count).toBe(3)
  })

  it('computes POSITION min/max and passes coordinates through unchanged', () => {
    const prim = json.meshes[0].primitives[0]
    const pos = json.accessors[prim.attributes.POSITION]
    expect(pos.count).toBe(FIXTURE_VERTICES.length)
    expect(pos.min).toEqual([1, 2, 3])
    expect(pos.max).toEqual([7, 8, 9])
    const view = json.bufferViews[pos.bufferView]
    expect(floatsAt(buffer, view.byteOffset ?? 0, 3)).toEqual([1, 2, 3])
  })

  it('flips the v texture coordinate', () => {
    const prim = json.meshes[0].primitives[0]
    const uv = json.accessors[prim.attributes.TEXCOORD_0]
    const view = json.bufferViews[uv.bufferView]
    expect(floatsAt(buffer, view.byteOffset ?? 0, 2)).toEqual([0.25, 0.25])
  })

  it('stores COLOR_0 as normalized u8 RGBA reordered from bgra bytes', () => {
    const prim = json.meshes[0].primitives[0]
    const color = json.accessors[prim.attributes.COLOR_0]
    expect(color.componentType).toBe(5121)
    expect(color.type).toBe('VEC4')
    expect(color.normalized).toBe(true)
    const view = json.bufferViews[color.bufferView]
    const off = view.byteOffset ?? 0
    // vertex0: b=10 g=20 r=30 a=40 -> RGBA 30,20,10,40
    expect([buffer[off], buffer[off + 1], buffer[off + 2], buffer[off + 3]]).toEqual([
      30, 20, 10, 40
    ])
  })

  it('assigns matrix2 to the node matrix verbatim', () => {
    expect(json.nodes[0].matrix).toEqual(Array.from({ length: 16 }, (_, i) => 100 + i))
    expect(json.scenes[json.scene].nodes).toContain(0)
  })

  it('places a pure translation at matrix elements 12..14', () => {
    const translate = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 5, 6, 7, 1]
    const { json: j } = exportGltf(withMatrix2(fixtureFile(), translate)) as { json: any }
    expect(j.nodes[0].matrix.slice(12, 15)).toEqual([5, 6, 7])
  })
})

describe('exportGlb', () => {
  const glb = exportGlb(fixtureFile())
  const view = new DataView(glb.buffer, glb.byteOffset, glb.byteLength)

  it('packs a valid GLB v2 container', () => {
    expect(view.getUint32(0, true)).toBe(0x46546c67) // 'glTF'
    expect(view.getUint32(4, true)).toBe(2)
    expect(view.getUint32(8, true)).toBe(glb.byteLength)
    expect(glb.byteLength % 4).toBe(0)
  })

  it('contains a JSON chunk followed by a BIN chunk', () => {
    const jsonLen = view.getUint32(12, true)
    expect(view.getUint32(16, true)).toBe(0x4e4f534a) // 'JSON'
    expect(jsonLen % 4).toBe(0)
    const json = JSON.parse(new TextDecoder().decode(glb.subarray(20, 20 + jsonLen)))
    expect(json.asset.version).toBe('2.0')
    expect(json.buffers[0].uri).toBeUndefined()

    const binHeader = 20 + jsonLen
    const binLen = view.getUint32(binHeader, true)
    expect(view.getUint32(binHeader + 4, true)).toBe(0x004e4942) // 'BIN'
    expect(json.buffers[0].byteLength).toBeLessThanOrEqual(binLen)
    expect(binHeader + 8 + binLen).toBe(glb.byteLength)
  })
})

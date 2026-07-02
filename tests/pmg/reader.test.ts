import { describe, expect, it } from 'vitest'
import {
  FIXTURE_BOUNDING_FLOATS,
  FIXTURE_FILLS,
  FIXTURE_INDICES,
  FIXTURE_IS_TEXTURE_MAPPED,
  FIXTURE_MESH_INDEX,
  FIXTURE_NAMES,
  FIXTURE_SKINS,
  FIXTURE_STRIP_INDICES,
  FIXTURE_UNK9,
  FIXTURE_VERTICES,
  buildPmgFixture,
  fixtureMatrix1,
  fixtureMatrix2
} from '../fixtures/pmgFixture'
import { readPmg, PmgParseError } from '../../src/core/pmg/reader'
import {
  readBoundingFloats,
  readIndices,
  readMatrix,
  readSkin,
  readStripIndices,
  readVertex
} from '../../src/core/pmg/access'

const v17File = (): Uint8Array => buildPmgFixture({ meshes: [{ version: '1.7' }] })

describe('readPmg file header', () => {
  it('parses model name, version bytes, and unknown region', () => {
    const file = readPmg(v17File())
    expect(file.name.text).toBe(FIXTURE_NAMES.model)
    expect(Array.from(file.fileVersion)).toEqual([2, 1])
    expect(file.unk1.length).toBe(96)
    expect(file.unk1.every((b) => b === FIXTURE_FILLS.unk1)).toBe(true)
  })

  it('parses mesh groups with names and unknown region', () => {
    const file = readPmg(v17File())
    expect(file.groups).toHaveLength(1)
    expect(file.groups[0].name.text).toBe(FIXTURE_NAMES.group)
    expect(file.groups[0].unk2.raw.every((b) => b === FIXTURE_FILLS.unk2)).toBe(true)
    expect(file.groups[0].meshes).toHaveLength(1)
  })

  it('preserves padding between structural header and first mesh block', () => {
    const file = readPmg(buildPmgFixture({ meshes: [{ version: '1.7' }], headerPadding: 8 }))
    expect(file.headerPadding.length).toBe(8)
    expect(file.headerPadding.every((b) => b === FIXTURE_FILLS.padding)).toBe(true)
  })

  it('parses per-mesh header info (meshSize, names, index, unk9)', () => {
    const info = readPmg(v17File()).groups[0].meshes[0].headerInfo
    expect(info.boneName.text).toBe(FIXTURE_NAMES.bone)
    expect(info.meshName.text).toBe(FIXTURE_NAMES.mesh)
    expect(info.jointName.text).toBe(FIXTURE_NAMES.joint)
    expect(info.index).toBe(FIXTURE_MESH_INDEX)
    expect(info.unk9).toBe(FIXTURE_UNK9)
    expect(info.meshSize).toBeGreaterThan(0)
  })

  it('throws PmgParseError on bad magic', () => {
    const data = v17File()
    data[0] = 0x58
    expect(() => readPmg(data)).toThrow(PmgParseError)
  })

  it('throws PmgParseError on truncated file', () => {
    expect(() => readPmg(v17File().slice(0, 40))).toThrow(PmgParseError)
  })
})

describe('readPmg pm! v1.7 mesh', () => {
  it('parses version and all fixed strings', () => {
    const m = readPmg(v17File()).groups[0].meshes[0]
    expect(m.version).toBe('1.7')
    expect(m.boneName.text).toBe(FIXTURE_NAMES.bone)
    expect(m.meshName.text).toBe(FIXTURE_NAMES.mesh)
    expect(m.jointName.text).toBe(FIXTURE_NAMES.joint)
    expect(m.stateName.text).toBe(FIXTURE_NAMES.state)
    expect(m.normalName.text).toBe(FIXTURE_NAMES.normal)
    expect(m.colorName.text).toBe(FIXTURE_NAMES.color)
    expect(m.textureName.text).toBe(FIXTURE_NAMES.texture)
    expect(m.unk25).toBeNull()
  })

  it('parses matrices, index, and flags', () => {
    const m = readPmg(v17File()).groups[0].meshes[0]
    expect(readMatrix(m.matrix1)).toEqual(fixtureMatrix1())
    expect(readMatrix(m.matrix2)).toEqual(fixtureMatrix2())
    expect(m.index).toBe(FIXTURE_MESH_INDEX)
    expect(m.isTextureMapped).toBe(FIXTURE_IS_TEXTURE_MAPPED)
    expect(m.unk8.every((b) => b === FIXTURE_FILLS.unk8)).toBe(true)
    expect(m.unk10.every((b) => b === FIXTURE_FILLS.unk10)).toBe(true)
  })

  it('parses the count table', () => {
    const c = readPmg(v17File()).groups[0].meshes[0].counts
    expect(c.indexCount).toBe(FIXTURE_INDICES.length)
    expect(c.faceCount).toBe(1)
    expect(c.stripIndexCount).toBe(FIXTURE_STRIP_INDICES.length)
    expect(c.vertexCount).toBe(FIXTURE_VERTICES.length)
    expect(c.skinCount).toBe(FIXTURE_SKINS.length)
    expect(c.physicsCount).toBe(0)
    expect(c.isAnimated).toBe(0)
  })

  it('parses bounding block floats', () => {
    const m = readPmg(v17File()).groups[0].meshes[0]
    expect(readBoundingFloats(m)).toEqual(FIXTURE_BOUNDING_FLOATS)
  })

  it('exposes vertices through the access helpers', () => {
    const m = readPmg(v17File()).groups[0].meshes[0]
    FIXTURE_VERTICES.forEach((e, i) => {
      expect(readVertex(m, i)).toEqual({
        x: e.x, y: e.y, z: e.z,
        nx: e.nx, ny: e.ny, nz: e.nz,
        b: e.b, g: e.g, r: e.r, a: e.a,
        u: e.u, v: e.v
      })
    })
  })

  it('exposes indices, strip indices, and skins', () => {
    const m = readPmg(v17File()).groups[0].meshes[0]
    expect(Array.from(readIndices(m))).toEqual([...FIXTURE_INDICES])
    expect(Array.from(readStripIndices(m))).toEqual([...FIXTURE_STRIP_INDICES])
    expect(readSkin(m, 0)).toEqual({ ...FIXTURE_SKINS[0] })
  })

  it('preserves trailer bytes verbatim', () => {
    const file = readPmg(buildPmgFixture({ meshes: [{ version: '1.7', trailer: [1, 2, 3, 4, 5] }] }))
    expect(Array.from(file.groups[0].meshes[0].trailer)).toEqual([1, 2, 3, 4, 5])
  })

  it('reads physics records as opaque bytes', () => {
    const m = readPmg(buildPmgFixture({ meshes: [{ version: '1.7', physicsRecordCount: 2 }] }))
      .groups[0].meshes[0]
    expect(m.physics.length).toBe(64)
    expect(m.physics.every((b) => b === FIXTURE_FILLS.physics)).toBe(true)
  })
})

describe('readPmg pm! v2.0 mesh', () => {
  it('parses length-prefixed strings', () => {
    const m = readPmg(buildPmgFixture({ meshes: [{ version: '2.0' }] })).groups[0].meshes[0]
    expect(m.version).toBe('2.0')
    expect(m.boneName.text).toBe(FIXTURE_NAMES.bone)
    expect(m.meshName.text).toBe(FIXTURE_NAMES.mesh)
    expect(m.stateName.text).toBe(FIXTURE_NAMES.state)
    expect(m.colorName.text).toBe(FIXTURE_NAMES.color)
    expect(m.textureName.text).toBe(FIXTURE_NAMES.texture)
    expect(m.unk25).toBeNull()
  })

  it('handles empty length-prefixed strings', () => {
    const m = readPmg(buildPmgFixture({ meshes: [{ version: '2.0', textureName: '' }] }))
      .groups[0].meshes[0]
    expect(m.textureName.text).toBe('')
  })

  it('parses geometry identically to v1.7', () => {
    const m = readPmg(buildPmgFixture({ meshes: [{ version: '2.0' }] })).groups[0].meshes[0]
    expect(Array.from(readIndices(m))).toEqual([...FIXTURE_INDICES])
    expect(readVertex(m, 0).x).toBe(FIXTURE_VERTICES[0].x)
  })
})

describe('readPmg pm! v3.0 mesh', () => {
  it('parses the extra unk25 string between normalName and colorName', () => {
    const m = readPmg(buildPmgFixture({ meshes: [{ version: '3.0' }] })).groups[0].meshes[0]
    expect(m.version).toBe('3.0')
    expect(m.unk25?.text).toBe(FIXTURE_NAMES.unk25)
    expect(m.colorName.text).toBe(FIXTURE_NAMES.color)
    expect(m.textureName.text).toBe(FIXTURE_NAMES.texture)
  })
})

describe('readPmg multi-mesh files', () => {
  it('parses several meshes with mixed pm! versions in one group', () => {
    const file = readPmg(
      buildPmgFixture({
        meshes: [
          { version: '1.7', meshName: 'mesh_v17' },
          { version: '2.0', meshName: 'mesh_v20' },
          { version: '3.0', meshName: 'mesh_v30' }
        ]
      })
    )
    expect(file.groups[0].meshes.map((m) => m.meshName.text)).toEqual([
      'mesh_v17',
      'mesh_v20',
      'mesh_v30'
    ])
  })
})

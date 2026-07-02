/**
 * OBJ exporter spec. Fixture geometry: 3 vertices, 1 triangle [0,1,2],
 * matrix2[i] = 100 + i (row-major D3D: position' = [x y z 1] * M).
 */
import { describe, expect, it } from 'vitest'
import { exportObj } from '../../src/core/export/obj'
import { readPmg } from '../../src/core/pmg/reader'
import { buildPmgFixture, FIXTURE_NAMES, FIXTURE_VERTICES } from '../fixtures/pmgFixture'

const parseFloats = (line: string): number[] => line.split(/\s+/).slice(1).map(Number)

const linesOf = (text: string, prefix: string): string[] =>
  text.split('\n').filter((l) => l.startsWith(prefix))

describe('exportObj', () => {
  const file = readPmg(buildPmgFixture({ meshes: [{ version: '2.0' }] }))
  const { obj, mtl } = exportObj(file)

  it('emits one o line named after the mesh', () => {
    expect(linesOf(obj, 'o ')).toEqual([`o ${FIXTURE_NAMES.mesh}`])
  })

  it('transforms positions by matrix2 with translation from elements 12..14', () => {
    // vertex0 = (1,2,3); m[i] = 100+i
    // x' = 1*100 + 2*104 + 3*108 + 112 = 744
    const v = linesOf(obj, 'v ')
    expect(v).toHaveLength(FIXTURE_VERTICES.length)
    expect(parseFloats(v[0])).toEqual([744, 751, 758])
  })

  it('transforms normals by the rotation part only', () => {
    // normal0 = (0,0,1) -> row 2 of M = (108,109,110)
    const vn = linesOf(obj, 'vn ')
    expect(vn).toHaveLength(FIXTURE_VERTICES.length)
    expect(parseFloats(vn[0])).toEqual([108, 109, 110])
  })

  it('flips the v texture coordinate', () => {
    const vt = linesOf(obj, 'vt ')
    expect(vt).toHaveLength(FIXTURE_VERTICES.length)
    expect(parseFloats(vt[0])).toEqual([0.25, 0.25]) // u=0.25, 1-0.75
    expect(parseFloats(vt[1])).toEqual([0.5, 0.875]) // u=0.5, 1-0.125
  })

  it('emits 1-based faces keeping file winding', () => {
    expect(linesOf(obj, 'f ')).toEqual(['f 1/1/1 2/2/2 3/3/3'])
  })

  it('references the mtl library and material', () => {
    expect(obj).toContain(`mtllib ${FIXTURE_NAMES.model}.mtl`)
    expect(obj).toContain(`usemtl ${FIXTURE_NAMES.texture}`)
  })

  it('writes one material with a dds map_Kd', () => {
    expect(linesOf(mtl, 'newmtl ')).toEqual([`newmtl ${FIXTURE_NAMES.texture}`])
    expect(mtl).toContain(`map_Kd ${FIXTURE_NAMES.texture}.dds`)
  })
})

describe('exportObj with multiple meshes', () => {
  const file = readPmg(
    buildPmgFixture({
      meshes: [
        { version: '2.0', meshName: 'mesh_a' },
        { version: '2.0', meshName: 'mesh_b', textureName: 'tex_b' }
      ]
    })
  )
  const { obj, mtl } = exportObj(file)

  it('offsets face indices per mesh', () => {
    expect(linesOf(obj, 'f ')).toEqual(['f 1/1/1 2/2/2 3/3/3', 'f 4/4/4 5/5/5 6/6/6'])
  })

  it('emits one o line per mesh', () => {
    expect(linesOf(obj, 'o ')).toEqual(['o mesh_a', 'o mesh_b'])
  })

  it('deduplicates materials by texture name', () => {
    expect(linesOf(mtl, 'newmtl ').sort()).toEqual([
      'newmtl tex_b',
      `newmtl ${FIXTURE_NAMES.texture}`
    ])
  })
})

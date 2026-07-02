import { describe, expect, it } from 'vitest'
import { buildPmgFixture } from '../fixtures/pmgFixture'
import { makeFixedString, makeLpString } from '../../src/core/binary/cursor'
import { readPmg } from '../../src/core/pmg/reader'
import { writePmg } from '../../src/core/pmg/writer'
import type { PmgFile } from '../../src/core/pmg/types'

const roundTrip = (data: Uint8Array): Uint8Array => writePmg(readPmg(data))

const withMesh0 = (file: PmgFile, patch: Partial<PmgFile['groups'][0]['meshes'][0]>): PmgFile => ({
  ...file,
  groups: [{ ...file.groups[0], meshes: [{ ...file.groups[0].meshes[0], ...patch }] }]
})

describe('writePmg round-trip fidelity', () => {
  it.each(['1.7', '2.0', '3.0'] as const)('is byte-identical for pm! v%s', (version) => {
    const original = buildPmgFixture({ meshes: [{ version }] })
    expect(roundTrip(original)).toEqual(original)
  })

  it('is byte-identical with header padding, trailer, and physics records', () => {
    const original = buildPmgFixture({
      meshes: [{ version: '2.0', trailer: [9, 8, 7], physicsRecordCount: 3 }],
      headerPadding: 16
    })
    expect(roundTrip(original)).toEqual(original)
  })

  it('is byte-identical for multi-mesh mixed-version files', () => {
    const original = buildPmgFixture({
      meshes: [
        { version: '1.7', meshName: 'a' },
        { version: '2.0', meshName: 'b', textureName: '' },
        { version: '3.0', meshName: 'c' }
      ]
    })
    expect(roundTrip(original)).toEqual(original)
  })
})

describe('writePmg after edits', () => {
  it('recomputes sizes when an LP string changes length (v2.0)', () => {
    const file = readPmg(buildPmgFixture({ meshes: [{ version: '2.0' }] }))
    const edited = withMesh0(file, { textureName: makeLpString('a_much_longer_texture_name') })
    const reparsed = readPmg(writePmg(edited))
    const m = reparsed.groups[0].meshes[0]
    expect(m.textureName.text).toBe('a_much_longer_texture_name')
    expect(m.stateName.text).toBe(file.groups[0].meshes[0].stateName.text)
    expect(Array.from(m.vertices)).toEqual(Array.from(file.groups[0].meshes[0].vertices))
  })

  it('writes edited fixed strings (v1.7) at the same block size', () => {
    const original = buildPmgFixture({ meshes: [{ version: '1.7' }] })
    const file = readPmg(original)
    const edited = withMesh0(file, { textureName: makeFixedString('new_tex', 32) })
    const out = writePmg(edited)
    expect(out.length).toBe(original.length)
    expect(readPmg(out).groups[0].meshes[0].textureName.text).toBe('new_tex')
  })

  it('keeps mesh header meshSize consistent with the rewritten block', () => {
    const file = readPmg(buildPmgFixture({ meshes: [{ version: '2.0' }] }))
    const edited = withMesh0(file, { meshName: makeLpString('renamed_mesh_with_long_name') })
    const reparsed = readPmg(writePmg(edited))
    // reader validates block bounds via pm!.size, so a successful reparse with
    // matching content proves headerSize/meshSize/size were all recomputed coherently
    expect(reparsed.groups[0].meshes[0].meshName.text).toBe('renamed_mesh_with_long_name')
  })
})

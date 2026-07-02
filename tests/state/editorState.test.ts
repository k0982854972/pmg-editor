import { describe, expect, test } from 'vitest'
import { makeFixedString, makeLpString } from '../../src/core/binary/cursor'
import type { FixedString } from '../../src/core/binary/cursor'
import type { MeshCounts, MeshGroup, PmMesh, PmVersion, PmgFile } from '../../src/core/pmg/types'
import {
  editorReducer,
  initialEditorState,
  selectedMeshOf
} from '../../src/renderer/src/state/editorReducer'
import { withMeshString } from '../../src/renderer/src/state/meshEdit'

const emptyCounts: MeshCounts = {
  indexCount: 0,
  faceCount: 0,
  stripIndexCount: 0,
  stripFaceCount: 0,
  vertexCount: 0,
  skinCount: 0,
  physicsCount: 0,
  isAnimated: 0,
  morphFrameSize: 0,
  morphFrameCount: 0,
  unk18: 0,
  unk19: 0,
  unk20: 0,
  unk21: 0,
  unk22: 0,
  indicesSize: 0,
  stripIndicesSize: 0,
  verticesSize: 0,
  skinsSize: 0,
  unk23: 0
}

function makeTestMesh(version: PmVersion): PmMesh {
  const body = (text: string, length: number): FixedString =>
    version === '1.7' ? makeFixedString(text, length) : makeLpString(text)
  return {
    version,
    headerInfo: {
      meshSize: 0,
      boneName: makeFixedString('bone0', 32),
      meshName: makeFixedString('mesh0', 128),
      jointName: makeFixedString('', 32),
      index: 0,
      unk9: 0
    },
    boneName: body('bone0', 32),
    meshName: body('mesh0', 128),
    jointName: body('', 32),
    stateName: body('state0', 32),
    normalName: body('', 32),
    colorName: body('', 32),
    textureName: body('tex0', 32),
    unk25: null,
    matrix1: new Uint8Array(64),
    matrix2: new Uint8Array(64),
    index: 0,
    unk8: new Uint8Array(4),
    isTextureMapped: 1,
    unk10: new Uint8Array(4),
    counts: emptyCounts,
    bounding: new Uint8Array(60),
    indices: new Uint8Array(0),
    stripIndices: new Uint8Array(0),
    vertices: new Uint8Array(0),
    skins: new Uint8Array(0),
    physics: new Uint8Array(0),
    trailer: new Uint8Array(0)
  }
}

function makeTestFile(version: PmVersion): PmgFile {
  const group: MeshGroup = {
    name: makeFixedString('group0', 32),
    unk2: makeFixedString('', 32),
    meshes: [makeTestMesh(version), makeTestMesh(version)]
  }
  return {
    fileVersion: Uint8Array.of(2, 1),
    name: makeFixedString('model', 128),
    unk1: new Uint8Array(4),
    headerPadding: new Uint8Array(0),
    groups: [group]
  }
}

describe('withMeshString', () => {
  test('encodes v1.7 stateName as 32-byte fixed field without mutating original', () => {
    const mesh = makeTestMesh('1.7')

    const updated = withMeshString(mesh, 'stateName', 'newstate')

    expect(updated.stateName.text).toBe('newstate')
    expect(updated.stateName.raw.byteLength).toBe(32)
    expect(mesh.stateName.text).toBe('state0')
    expect(updated).not.toBe(mesh)
  })

  test('encodes v2.0 textureName as LP string payload', () => {
    const mesh = makeTestMesh('2.0')

    const updated = withMeshString(mesh, 'textureName', 'skin.dds')

    expect(updated.textureName.text).toBe('skin.dds')
    expect(updated.textureName.raw).toEqual(makeLpString('skin.dds').raw)
  })

  test('meshName edit also updates headerInfo.meshName as fixed 128 bytes', () => {
    const mesh = makeTestMesh('2.0')

    const updated = withMeshString(mesh, 'meshName', 'renamed')

    expect(updated.meshName.text).toBe('renamed')
    expect(updated.meshName.raw).toEqual(makeLpString('renamed').raw)
    expect(updated.headerInfo.meshName.text).toBe('renamed')
    expect(updated.headerInfo.meshName.raw.byteLength).toBe(128)
  })

  test('throws when v1.7 fixed field text is too long', () => {
    const mesh = makeTestMesh('1.7')
    const tooLong = 'x'.repeat(32)

    expect(() => withMeshString(mesh, 'stateName', tooLong)).toThrow()
  })
})

describe('editorReducer', () => {
  test('fileLoaded resets selection, dirty flag and error', () => {
    const file = makeTestFile('1.7')
    const dirtyState = {
      ...initialEditorState,
      isDirty: true,
      error: 'old error',
      selection: { groupIndex: 0, meshIndex: 1 }
    }

    const next = editorReducer(dirtyState, { type: 'fileLoaded', file, path: '/tmp/a.pmg' })

    expect(next.file).toBe(file)
    expect(next.filePath).toBe('/tmp/a.pmg')
    expect(next.selection).toBeNull()
    expect(next.isDirty).toBe(false)
    expect(next.error).toBeNull()
  })

  test('meshReplaced swaps only the target mesh immutably and marks dirty', () => {
    const file = makeTestFile('1.7')
    const loaded = editorReducer(initialEditorState, {
      type: 'fileLoaded',
      file,
      path: '/tmp/a.pmg'
    })
    const selection = { groupIndex: 0, meshIndex: 1 }
    const replacement = withMeshString(file.groups[0].meshes[1], 'stateName', 'edited')

    const next = editorReducer(loaded, { type: 'meshReplaced', selection, mesh: replacement })

    expect(next.isDirty).toBe(true)
    expect(next.file?.groups[0].meshes[1]).toBe(replacement)
    expect(next.file?.groups[0].meshes[0]).toBe(file.groups[0].meshes[0])
    expect(next.file).not.toBe(file)
    expect(file.groups[0].meshes[1].stateName.text).toBe('state0')
  })

  test('selectedMeshOf resolves the selected mesh', () => {
    const file = makeTestFile('3.0')
    const loaded = editorReducer(initialEditorState, {
      type: 'fileLoaded',
      file,
      path: '/tmp/a.pmg'
    })
    const selected = editorReducer(loaded, {
      type: 'meshSelected',
      selection: { groupIndex: 0, meshIndex: 0 }
    })

    expect(selectedMeshOf(selected)).toBe(file.groups[0].meshes[0])
    expect(selectedMeshOf(loaded)).toBeNull()
  })

  test('fileSaved clears dirty flag and records new path', () => {
    const file = makeTestFile('1.7')
    const loaded = editorReducer(initialEditorState, {
      type: 'fileLoaded',
      file,
      path: '/tmp/a.pmg'
    })
    const edited = editorReducer(loaded, {
      type: 'meshReplaced',
      selection: { groupIndex: 0, meshIndex: 0 },
      mesh: withMeshString(file.groups[0].meshes[0], 'colorName', 'c0')
    })

    const saved = editorReducer(edited, { type: 'fileSaved', path: '/tmp/b.pmg' })

    expect(saved.isDirty).toBe(false)
    expect(saved.filePath).toBe('/tmp/b.pmg')
  })
})

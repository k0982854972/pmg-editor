/**
 * Immutable string edits on a PmMesh.
 * v1.7 mesh bodies use fixed-size fields; v2.0/3.0 bodies use LP strings.
 * headerInfo strings are ALWAYS fixed (bone 32 / mesh 128 / joint 32).
 */
import { makeFixedString, makeLpString } from '../../../core/binary/cursor'
import type { FixedString } from '../../../core/binary/cursor'
import type { PmMesh } from '../../../core/pmg/types'

export type EditableField = 'meshName' | 'stateName' | 'textureName' | 'colorName'

export const V17_FIELD_LENGTHS: Record<EditableField, number> = {
  meshName: 128,
  stateName: 32,
  textureName: 32,
  colorName: 32
}

const HEADER_MESH_NAME_LENGTH = 128

function encodeBodyString(mesh: PmMesh, field: EditableField, text: string): FixedString {
  if (mesh.version === '1.7') return makeFixedString(text, V17_FIELD_LENGTHS[field])
  return makeLpString(text)
}

/**
 * Returns a new PmMesh with `field` set to `text`.
 * Throws (from makeFixedString) when the text does not fit a fixed field.
 */
export function withMeshString(mesh: PmMesh, field: EditableField, text: string): PmMesh {
  const value = encodeBodyString(mesh, field, text)
  if (field !== 'meshName') return { ...mesh, [field]: value }
  return {
    ...mesh,
    meshName: value,
    headerInfo: {
      ...mesh.headerInfo,
      meshName: makeFixedString(text, HEADER_MESH_NAME_LENGTH)
    }
  }
}

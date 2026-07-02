/**
 * Pure editor state: loaded PmgFile, file path, mesh selection, dirty flag.
 * All updates are immutable so an unedited file stays byte-identical on save.
 */
import type { PmMesh, PmgFile } from '../../../core/pmg/types'

export interface MeshSelection {
  readonly groupIndex: number
  readonly meshIndex: number
}

export interface EditorState {
  readonly file: PmgFile | null
  readonly filePath: string | null
  readonly selection: MeshSelection | null
  readonly isDirty: boolean
  readonly error: string | null
}

export const initialEditorState: EditorState = {
  file: null,
  filePath: null,
  selection: null,
  isDirty: false,
  error: null
}

export type EditorAction =
  | { readonly type: 'fileLoaded'; readonly file: PmgFile; readonly path: string }
  | { readonly type: 'fileSaved'; readonly path: string }
  | { readonly type: 'meshSelected'; readonly selection: MeshSelection | null }
  | {
      readonly type: 'meshReplaced'
      readonly selection: MeshSelection
      readonly mesh: PmMesh
    }
  | { readonly type: 'errorRaised'; readonly message: string }
  | { readonly type: 'errorCleared' }

function replaceMesh(file: PmgFile, selection: MeshSelection, mesh: PmMesh): PmgFile {
  return {
    ...file,
    groups: file.groups.map((group, groupIndex) =>
      groupIndex === selection.groupIndex
        ? {
            ...group,
            meshes: group.meshes.map((existing, meshIndex) =>
              meshIndex === selection.meshIndex ? mesh : existing
            )
          }
        : group
    )
  }
}

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case 'fileLoaded':
      return {
        file: action.file,
        filePath: action.path,
        selection: null,
        isDirty: false,
        error: null
      }
    case 'fileSaved':
      return { ...state, filePath: action.path, isDirty: false, error: null }
    case 'meshSelected':
      return { ...state, selection: action.selection }
    case 'meshReplaced':
      if (!state.file) return state
      return {
        ...state,
        file: replaceMesh(state.file, action.selection, action.mesh),
        isDirty: true
      }
    case 'errorRaised':
      return { ...state, error: action.message }
    case 'errorCleared':
      return { ...state, error: null }
  }
}

export function selectedMeshOf(state: EditorState): PmMesh | null {
  if (!state.file || !state.selection) return null
  const group = state.file.groups[state.selection.groupIndex]
  return group?.meshes[state.selection.meshIndex] ?? null
}

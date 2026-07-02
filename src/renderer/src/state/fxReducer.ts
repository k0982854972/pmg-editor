/**
 * Pure FX workspace state: loaded EffectDocument, file path, selection
 * (emitter index + node path into the preserveOrder tree), dirty flag.
 * Mirrors editorReducer; all updates are immutable.
 */
import type { EffectDocument } from '../../../core/fx/effectXml'
import type { NodePath } from './fxEdit'

export interface FxState {
  readonly doc: EffectDocument | null
  readonly filePath: string | null
  readonly selectedEmitter: number | null
  readonly selectedNodePath: NodePath | null
  readonly isDirty: boolean
  readonly error: string | null
}

export const initialFxState: FxState = {
  doc: null,
  filePath: null,
  selectedEmitter: null,
  selectedNodePath: null,
  isDirty: false,
  error: null
}

export type FxAction =
  | { readonly type: 'fxLoaded'; readonly doc: EffectDocument; readonly path: string }
  | { readonly type: 'fxSaved'; readonly path: string }
  | {
      readonly type: 'nodeSelected'
      readonly emitterIndex: number | null
      readonly path: NodePath | null
    }
  | { readonly type: 'docEdited'; readonly doc: EffectDocument }
  | { readonly type: 'errorRaised'; readonly message: string }
  | { readonly type: 'errorCleared' }

export function fxReducer(state: FxState, action: FxAction): FxState {
  switch (action.type) {
    case 'fxLoaded':
      return {
        doc: action.doc,
        filePath: action.path,
        selectedEmitter: null,
        selectedNodePath: null,
        isDirty: false,
        error: null
      }
    case 'fxSaved':
      return { ...state, filePath: action.path, isDirty: false, error: null }
    case 'nodeSelected':
      return { ...state, selectedEmitter: action.emitterIndex, selectedNodePath: action.path }
    case 'docEdited':
      if (!state.doc) return state
      return { ...state, doc: action.doc, isDirty: true }
    case 'errorRaised':
      return { ...state, error: action.message }
    case 'errorCleared':
      return { ...state, error: null }
  }
}

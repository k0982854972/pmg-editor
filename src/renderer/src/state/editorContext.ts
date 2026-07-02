/**
 * Editor context + useEditor hook, kept apart from the provider component
 * so react-refresh sees component-only modules.
 */
import { createContext, useContext } from 'react'
import type { Dispatch } from 'react'
import type { EditorAction, EditorState } from './editorReducer'

export interface EditorContextValue {
  readonly state: EditorState
  readonly dispatch: Dispatch<EditorAction>
}

export const EditorContext = createContext<EditorContextValue | null>(null)

export function useEditor(): EditorContextValue {
  const value = useContext(EditorContext)
  if (!value) throw new Error('useEditor must be used within EditorProvider')
  return value
}

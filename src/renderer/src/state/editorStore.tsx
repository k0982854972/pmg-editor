/**
 * React provider wiring over the pure editorReducer.
 * Consumed by App.tsx; read access goes through useEditor (editorContext.ts).
 */
import { useMemo, useReducer } from 'react'
import type { ReactNode } from 'react'
import { EditorContext } from './editorContext'
import { editorReducer, initialEditorState } from './editorReducer'

export function EditorProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [state, dispatch] = useReducer(editorReducer, initialEditorState)
  const value = useMemo(() => ({ state, dispatch }), [state])
  return <EditorContext.Provider value={value}>{children}</EditorContext.Provider>
}

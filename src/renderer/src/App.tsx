import { useState } from 'react'
import { Inspector } from './panels/Inspector'
import { SceneTree } from './panels/SceneTree'
import { useEditor } from './state/editorContext'
import { EditorProvider } from './state/editorStore'
import { Toolbar } from './Toolbar'
import { Viewport } from './viewport/Viewport'

function EditorShell(): React.JSX.Element {
  const { state, dispatch } = useEditor()
  const [hiddenKeys, setHiddenKeys] = useState<ReadonlySet<string>>(new Set())
  const [lastFilePath, setLastFilePath] = useState(state.filePath)

  // Reset visibility when a different file is opened (adjust-state-in-render pattern).
  if (lastFilePath !== state.filePath) {
    setLastFilePath(state.filePath)
    setHiddenKeys(new Set())
  }

  const toggleVisibility = (key: string): void => {
    setHiddenKeys((previous) => {
      const next = new Set(previous)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  return (
    <div className="app">
      <Toolbar />
      <SceneTree
        file={state.file}
        selection={state.selection}
        hiddenKeys={hiddenKeys}
        onSelect={(selection) => dispatch({ type: 'meshSelected', selection })}
        onToggleVisibility={toggleVisibility}
      />
      <Viewport
        file={state.file}
        filePath={state.filePath}
        selection={state.selection}
        hiddenKeys={hiddenKeys}
      />
      <Inspector />
    </div>
  )
}

function App(): React.JSX.Element {
  return (
    <EditorProvider>
      <EditorShell />
    </EditorProvider>
  )
}

export default App

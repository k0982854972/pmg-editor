import { useEffect, useState } from 'react'
import { readPmg } from '../../core/pmg/reader'
import { AniWorkspace } from './ani/AniWorkspace'
import { DdsWorkspace } from './dds/DdsWorkspace'
import { FxWorkspace } from './fx/FxWorkspace'
import { Inspector } from './panels/Inspector'
import { SceneTree } from './panels/SceneTree'
import { useEditor } from './state/editorContext'
import { EditorProvider } from './state/editorStore'
import { FxProvider } from './state/fxStore'
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

  // Dev-only hook so automated smoke tests can load a file without the native dialog.
  useEffect(() => {
    if (!import.meta.env.DEV) return undefined
    const devWindow = window as unknown as {
      __openPmgPath?: (path: string) => Promise<void>
    }
    devWindow.__openPmgPath = async (path: string): Promise<void> => {
      const result = await window.api.openPmgPath(path)
      if (!result) return
      dispatch({ type: 'fileLoaded', file: readPmg(result.data), path: result.path })
    }
    return () => {
      delete devWindow.__openPmgPath
    }
  }, [dispatch])

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

type AppMode = 'pmg' | 'fx' | 'dds' | 'ani'

// Both workspaces stay mounted so switching modes never loses state.
function App(): React.JSX.Element {
  const [mode, setMode] = useState<AppMode>('pmg')

  return (
    <EditorProvider>
      <FxProvider>
        <div className="mode-root">
          <nav className="mode-tabs">
            <button
              type="button"
              className={mode === 'pmg' ? 'mode-tab active' : 'mode-tab'}
              onClick={() => setMode('pmg')}
            >
              模型
            </button>
            <button
              type="button"
              className={mode === 'fx' ? 'mode-tab active' : 'mode-tab'}
              onClick={() => setMode('fx')}
            >
              特效
            </button>
            <button
              type="button"
              className={mode === 'dds' ? 'mode-tab active' : 'mode-tab'}
              onClick={() => setMode('dds')}
            >
              貼圖
            </button>
            <button
              type="button"
              className={mode === 'ani' ? 'mode-tab active' : 'mode-tab'}
              onClick={() => setMode('ani')}
            >
              動畫
            </button>
          </nav>
          <div className={mode === 'pmg' ? 'mode-pane' : 'mode-pane mode-pane-hidden'}>
            <EditorShell />
          </div>
          <div className={mode === 'fx' ? 'mode-pane' : 'mode-pane mode-pane-hidden'}>
            <FxWorkspace />
          </div>
          <div className={mode === 'dds' ? 'mode-pane' : 'mode-pane mode-pane-hidden'}>
            <DdsWorkspace />
          </div>
          <div className={mode === 'ani' ? 'mode-pane' : 'mode-pane mode-pane-hidden'}>
            <AniWorkspace />
          </div>
        </div>
      </FxProvider>
    </EditorProvider>
  )
}

export default App

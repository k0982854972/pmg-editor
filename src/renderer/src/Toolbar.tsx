/**
 * Top toolbar: 開啟 / 儲存 / 另存新檔 via window.api, plus filename,
 * dirty indicator and error display (incl. PmgParseError offset).
 */
import { PmgParseError, readPmg } from '../../core/pmg/reader'
import { writePmg } from '../../core/pmg/writer'
import { useEditor } from './state/editorContext'

const basenameOf = (path: string): string => path.split(/[\\/]/).pop() ?? path

const messageOf = (error: unknown): string => {
  if (error instanceof PmgParseError) return `${error.message}（位移 ${error.offset}）`
  if (error instanceof Error) return error.message
  return '未知錯誤'
}

export function Toolbar(): React.JSX.Element {
  const { state, dispatch } = useEditor()

  const handleOpen = async (): Promise<void> => {
    try {
      const result = await window.api.openPmg()
      if (!result) return
      const file = readPmg(new Uint8Array(result.data))
      dispatch({ type: 'fileLoaded', file, path: result.path })
    } catch (error) {
      dispatch({ type: 'errorRaised', message: `開啟失敗：${messageOf(error)}` })
    }
  }

  const handleSaveAs = async (): Promise<void> => {
    if (!state.file) return
    try {
      const data = writePmg(state.file)
      const defaultName = state.filePath
        ? basenameOf(state.filePath)
        : `${state.file.name.text || 'model'}.pmg`
      const savedPath = await window.api.savePmgAs(defaultName, data)
      if (!savedPath) return
      dispatch({ type: 'fileSaved', path: savedPath })
    } catch (error) {
      dispatch({ type: 'errorRaised', message: `儲存失敗：${messageOf(error)}` })
    }
  }

  const handleSave = async (): Promise<void> => {
    if (!state.file) return
    if (!state.filePath) {
      await handleSaveAs()
      return
    }
    try {
      const data = writePmg(state.file)
      await window.api.savePmg(state.filePath, data)
      dispatch({ type: 'fileSaved', path: state.filePath })
    } catch (error) {
      dispatch({ type: 'errorRaised', message: `儲存失敗：${messageOf(error)}` })
    }
  }

  return (
    <header className="toolbar">
      <button type="button" onClick={() => void handleOpen()}>
        開啟
      </button>
      <button type="button" disabled={!state.file} onClick={() => void handleSave()}>
        儲存
      </button>
      <button type="button" disabled={!state.file} onClick={() => void handleSaveAs()}>
        另存新檔
      </button>
      <span className="toolbar-file">
        {state.filePath ? basenameOf(state.filePath) : '未開啟檔案'}
        {state.isDirty && (
          <span className="dirty-dot" title="未儲存變更">
            ●
          </span>
        )}
      </span>
      {state.error && (
        <span className="toolbar-error" title={state.error}>
          <span className="toolbar-error-text">{state.error}</span>
          <button
            type="button"
            className="error-dismiss"
            onClick={() => dispatch({ type: 'errorCleared' })}
          >
            ✕
          </button>
        </span>
      )}
    </header>
  )
}

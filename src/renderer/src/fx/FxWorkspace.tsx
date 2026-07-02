/**
 * FX workspace: sub-tabs 特效定義 (effect XML: toolbar + EmitterTree +
 * ParamEditor) and 綁定 meshdesc (AttachmentPanel). Both panes stay
 * mounted so switching keeps their state. Exposes window.__openFxPath
 * in dev builds.
 */
import { useEffect, useState } from 'react'
import { parseEffectXml, serializeEffectXml } from '../../../core/fx/effectXml'
import { useFx } from '../state/fxContext'
import { updateAttribute, updateNodeText } from '../state/fxEdit'
import { AttachmentPanel } from './AttachmentPanel'
import { EmitterTree } from './EmitterTree'
import { ParamEditor } from './ParamEditor'

type FxTab = 'effect' | 'meshdesc'

const basenameOf = (path: string): string => path.split(/[\\/]/).pop() ?? path

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : '未知錯誤')

function EffectPane(): React.JSX.Element {
  const { state, dispatch } = useFx()
  const { doc, selectedNodePath } = state

  // Dev-only hook so automated smoke tests can load a file without the dialog.
  useEffect(() => {
    if (!import.meta.env.DEV) return undefined
    const devWindow = window as unknown as {
      __openFxPath?: (path: string) => Promise<void>
    }
    devWindow.__openFxPath = async (path: string): Promise<void> => {
      const result = await window.api.openFxPath(path)
      if (!result) return
      dispatch({
        type: 'fxLoaded',
        doc: parseEffectXml(new Uint8Array(result.data)),
        path: result.path
      })
    }
    return () => {
      delete devWindow.__openFxPath
    }
  }, [dispatch])

  const handleOpen = async (): Promise<void> => {
    try {
      const result = await window.api.openFx()
      if (!result) return
      const doc = parseEffectXml(new Uint8Array(result.data))
      dispatch({ type: 'fxLoaded', doc, path: result.path })
    } catch (error) {
      dispatch({ type: 'errorRaised', message: `開啟失敗：${messageOf(error)}` })
    }
  }

  const handleSaveAs = async (): Promise<void> => {
    if (!state.doc) return
    try {
      const data = serializeEffectXml(state.doc)
      const defaultName = state.filePath ? basenameOf(state.filePath) : 'effect.xml'
      const savedPath = await window.api.saveFxAs(defaultName, data)
      if (!savedPath) return
      dispatch({ type: 'fxSaved', path: savedPath })
    } catch (error) {
      dispatch({ type: 'errorRaised', message: `儲存失敗：${messageOf(error)}` })
    }
  }

  const handleSave = async (): Promise<void> => {
    if (!state.doc) return
    if (!state.filePath) {
      await handleSaveAs()
      return
    }
    try {
      await window.api.saveFx(state.filePath, serializeEffectXml(state.doc))
      dispatch({ type: 'fxSaved', path: state.filePath })
    } catch (error) {
      dispatch({ type: 'errorRaised', message: `儲存失敗：${messageOf(error)}` })
    }
  }

  const commitEdit = (edit: () => void): void => {
    try {
      edit()
    } catch (error) {
      dispatch({ type: 'errorRaised', message: `編輯失敗：${messageOf(error)}` })
    }
  }

  return (
    <div className="fx-effect-pane">
      <div className="fx-toolbar">
        <button type="button" onClick={() => void handleOpen()}>
          開啟特效檔
        </button>
        <button type="button" disabled={!state.doc} onClick={() => void handleSave()}>
          儲存
        </button>
        <button type="button" disabled={!state.doc} onClick={() => void handleSaveAs()}>
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
      </div>
      <div className="fx-effect-body">
        <EmitterTree
          doc={state.doc}
          selectedPath={state.selectedNodePath}
          onSelect={(emitterIndex, path) => dispatch({ type: 'nodeSelected', emitterIndex, path })}
        />
        {doc && selectedNodePath ? (
          <ParamEditor
            doc={doc}
            path={selectedNodePath}
            onAttributeCommit={(key, value) =>
              commitEdit(() =>
                dispatch({
                  type: 'docEdited',
                  doc: updateAttribute(doc, selectedNodePath, key, value)
                })
              )
            }
            onTextCommit={(text) =>
              commitEdit(() =>
                dispatch({
                  type: 'docEdited',
                  doc: updateNodeText(doc, selectedNodePath, text)
                })
              )
            }
          />
        ) : (
          <section className="fx-params">
            <p className="panel-empty">從左側選取節點以編輯屬性</p>
          </section>
        )}
      </div>
    </div>
  )
}

export function FxWorkspace(): React.JSX.Element {
  const [tab, setTab] = useState<FxTab>('effect')

  return (
    <div className="fx-workspace">
      <nav className="fx-subtabs">
        <button
          type="button"
          className={tab === 'effect' ? 'fx-subtab active' : 'fx-subtab'}
          onClick={() => setTab('effect')}
        >
          特效定義
        </button>
        <button
          type="button"
          className={tab === 'meshdesc' ? 'fx-subtab active' : 'fx-subtab'}
          onClick={() => setTab('meshdesc')}
        >
          綁定 meshdesc
        </button>
      </nav>
      <div className={tab === 'effect' ? 'fx-pane' : 'fx-pane fx-pane-hidden'}>
        <EffectPane />
      </div>
      <div className={tab === 'meshdesc' ? 'fx-pane' : 'fx-pane fx-pane-hidden'}>
        <AttachmentPanel />
      </div>
    </div>
  )
}

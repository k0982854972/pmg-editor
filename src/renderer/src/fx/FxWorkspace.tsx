/**
 * FX workspace: sub-tabs 特效定義 (effect XML: toolbar + EmitterTree +
 * ParamEditor) and 綁定 meshdesc (AttachmentPanel). Both panes stay
 * mounted so switching keeps their state. Exposes window.__openFxPath
 * in dev builds.
 */
import { useEffect, useState } from 'react'
import { parseEffectXml, serializeEffectXml } from '../../../core/fx/effectXml'
import { ResizeHandle } from '../components/ResizeHandle'
import { usePersistedPanelWidth } from '../components/usePersistedPanelWidth'
import { useFx } from '../state/fxContext'
import { updateAttribute, updateNodeText } from '../state/fxEdit'
import { AttachmentPanel } from './AttachmentPanel'
import { EmitterTree } from './EmitterTree'
import { ParamEditor } from './ParamEditor'
import { FxPreview } from './preview/FxPreview'

type FxTab = 'effect' | 'meshdesc'

const TREE_WIDTH_STORAGE_KEY = 'ui.fxTreeWidth'
const TREE_DEFAULT_WIDTH = 320
const TREE_MIN_WIDTH = 200
const TREE_MAX_WIDTH = 560

const PREVIEW_WIDTH_STORAGE_KEY = 'ui.fxPreviewWidth'
const PREVIEW_DEFAULT_WIDTH = 380
const PREVIEW_MIN_WIDTH = 280
const PREVIEW_MAX_WIDTH = 800

const basenameOf = (path: string): string => path.split(/[\\/]/).pop() ?? path

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : '未知錯誤')

function EffectPane(): React.JSX.Element {
  const { state, dispatch } = useFx()
  const { doc, selectedNodePath } = state
  const [isPreviewOpen, setIsPreviewOpen] = useState(true)
  const [treeWidth, setTreeWidth] = usePersistedPanelWidth(
    TREE_WIDTH_STORAGE_KEY,
    TREE_DEFAULT_WIDTH,
    TREE_MIN_WIDTH,
    TREE_MAX_WIDTH
  )
  const [previewWidth, setPreviewWidth] = usePersistedPanelWidth(
    PREVIEW_WIDTH_STORAGE_KEY,
    PREVIEW_DEFAULT_WIDTH,
    PREVIEW_MIN_WIDTH,
    PREVIEW_MAX_WIDTH
  )

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
        <button
          type="button"
          title="開啟 effect_ver8 特效定義 XML（data/gfx/fx/effect/*.xml）"
          onClick={() => void handleOpen()}
        >
          開啟特效檔
        </button>
        <button
          type="button"
          title="儲存變更（保留原始編碼與未知屬性）"
          disabled={!state.doc}
          onClick={() => void handleSave()}
        >
          儲存
        </button>
        <button
          type="button"
          title="另存為新的特效 XML"
          disabled={!state.doc}
          onClick={() => void handleSaveAs()}
        >
          另存新檔
        </button>
        <button
          type="button"
          className={isPreviewOpen ? 'fx-preview-toggle active' : 'fx-preview-toggle'}
          title="顯示/隱藏即時粒子預覽面板"
          onClick={() => setIsPreviewOpen((value) => !value)}
        >
          預覽
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
      <div className="fx-preview-layout">
        <div className="fx-effect-body" style={{ gridTemplateColumns: `${treeWidth}px auto 1fr` }}>
          <EmitterTree
            doc={state.doc}
            selectedPath={state.selectedNodePath}
            onSelect={(emitterIndex, path) =>
              dispatch({ type: 'nodeSelected', emitterIndex, path })
            }
          />
          <ResizeHandle
            panelSide="left"
            width={treeWidth}
            minWidth={TREE_MIN_WIDTH}
            maxWidth={TREE_MAX_WIDTH}
            onWidthChange={setTreeWidth}
            ariaLabel="調整發射器樹寬度"
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
        {isPreviewOpen && (
          <>
            <ResizeHandle
              panelSide="right"
              width={previewWidth}
              minWidth={PREVIEW_MIN_WIDTH}
              maxWidth={PREVIEW_MAX_WIDTH}
              onWidthChange={setPreviewWidth}
              ariaLabel="調整預覽欄寬度"
            />
            <aside className="fx-preview-column" style={{ width: previewWidth }}>
              <FxPreview doc={doc} selectedEmitter={state.selectedEmitter} />
            </aside>
          </>
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

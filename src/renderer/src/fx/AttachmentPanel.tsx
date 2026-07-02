/**
 * Meshdesc binding sub-tab: open a weapon/tool meshdesc XML, edit its
 * EffectGroup/Effect rows (name, parent bone, effect_name, offset, rotation),
 * add/remove entries via the pure core helpers, and save back.
 * Also auto-loads the sibling same-named .pmg model and up to 5 effect-source
 * XMLs (persisted paths + auto-discovery via the main-process emitter index —
 * see useEffectSources) to drive the live preview pane (MeshdescPreview) and
 * the bone / effect-name suggestion comboboxes. The preview column width is
 * drag-resizable and persisted. Exposes window.__openMeshdescPath in dev.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { MeshdescDocument, MeshdescEffect } from '../../../core/fx/meshdesc'
import {
  addEffect,
  parseMeshdesc,
  removeEffect,
  serializeMeshdesc,
  updateEffect
} from '../../../core/fx/meshdesc'
import { readPmg } from '../../../core/pmg/reader'
import type { PmgFile } from '../../../core/pmg/types'
import { ResizeHandle } from '../components/ResizeHandle'
import { usePersistedPanelWidth } from '../components/usePersistedPanelWidth'
import { EffectSourceList } from './EffectSourceList'
import { EffectRow } from './MeshdescEffectRow'
import type { ModelStatus } from './MeshdescPreview'
import { MeshdescPreview } from './MeshdescPreview'
import { buildBoneCandidates, mergedEmitterNames, pmgBoneNamesOf } from './meshdescPreviewModel'
import { useEffectSources } from './useEffectSources'

interface MeshdescState {
  readonly doc: MeshdescDocument | null
  readonly path: string | null
  readonly isDirty: boolean
  readonly error: string | null
}

interface SiblingPmgState {
  readonly file: PmgFile | null
  readonly status: ModelStatus
}

const INITIAL_STATE: MeshdescState = { doc: null, path: null, isDirty: false, error: null }

const PREVIEW_WIDTH_STORAGE_KEY = 'ui.meshdescPreviewWidth'
const PREVIEW_DEFAULT_WIDTH = 420
const PREVIEW_MIN_WIDTH = 280
const PREVIEW_MAX_WIDTH = 800

const NEW_EFFECT: MeshdescEffect = {
  name: 'new_effect',
  parent: '',
  effectName: '',
  slot: 0,
  align: 'parent',
  offset: { x: 0, y: 0, z: 0 },
  rotAxis: { x: 0, y: 0, z: 0 },
  rotAngle: 0,
  extraAttributes: {}
}

const basenameOf = (path: string): string => path.split(/[\\/]/).pop() ?? path

/** meshdesc XML path -> sibling same-named .pmg path. */
const siblingPmgPathOf = (path: string): string => path.replace(/\.[^.\\/]*$/, '') + '.pmg'

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : '未知錯誤')

export function AttachmentPanel(): React.JSX.Element {
  const [state, setState] = useState<MeshdescState>(INITIAL_STATE)
  const [pmg, setPmg] = useState<SiblingPmgState | null>(null)
  const {
    sources,
    status: sourceStatus,
    addSourceViaDialog,
    removeSource,
    autoLoadForMeshdesc
  } = useEffectSources()
  const [previewWidth, setPreviewWidth] = usePersistedPanelWidth(
    PREVIEW_WIDTH_STORAGE_KEY,
    PREVIEW_DEFAULT_WIDTH,
    PREVIEW_MIN_WIDTH,
    PREVIEW_MAX_WIDTH
  )
  // Guards stale async PMG results when another meshdesc is opened quickly.
  const pmgRequestRef = useRef(0)
  const doc = state.doc

  const loadSiblingPmg = useCallback((meshdescPath: string): void => {
    const requestId = pmgRequestRef.current + 1
    pmgRequestRef.current = requestId
    const pmgPath = siblingPmgPathOf(meshdescPath)
    const missing: SiblingPmgState = {
      file: null,
      status: { isLoaded: false, text: `✗ 找不到同名 PMG（${basenameOf(pmgPath)}）` }
    }
    setPmg({ file: null, status: { isLoaded: false, text: `載入中：${basenameOf(pmgPath)}` } })
    window.api
      .openPmgPath(pmgPath)
      .then((result) => {
        if (pmgRequestRef.current !== requestId) return
        if (!result) {
          setPmg(missing)
          return
        }
        try {
          setPmg({
            file: readPmg(new Uint8Array(result.data)),
            status: { isLoaded: true, text: `✓ ${basenameOf(result.path)}` }
          })
        } catch (error) {
          setPmg({
            file: null,
            status: { isLoaded: false, text: `✗ PMG 解析失敗：${messageOf(error)}` }
          })
        }
      })
      .catch(() => {
        if (pmgRequestRef.current === requestId) setPmg(missing)
      })
  }, [])

  const loadBytes = useCallback(
    (path: string, data: Uint8Array): void => {
      try {
        const parsed = parseMeshdesc(data)
        setState({ doc: parsed, path, isDirty: false, error: null })
        loadSiblingPmg(path)
        autoLoadForMeshdesc(parsed)
      } catch (error) {
        setState((previous) => ({ ...previous, error: `開啟失敗：${messageOf(error)}` }))
      }
    },
    [loadSiblingPmg, autoLoadForMeshdesc]
  )

  // Dev-only hook so automated smoke tests can load a meshdesc without the dialog.
  useEffect(() => {
    if (!import.meta.env.DEV) return undefined
    const devWindow = window as unknown as {
      __openMeshdescPath?: (path: string) => Promise<void>
    }
    devWindow.__openMeshdescPath = async (path: string): Promise<void> => {
      const result = await window.api.openFxPath(path)
      if (result) loadBytes(result.path, new Uint8Array(result.data))
    }
    return () => {
      delete devWindow.__openMeshdescPath
    }
  }, [loadBytes])

  const raiseError = (message: string): void => {
    setState((previous) => ({ ...previous, error: message }))
  }

  const editDoc = (doc: MeshdescDocument): void => {
    setState((previous) => ({ ...previous, doc, isDirty: true }))
  }

  const handleOpen = async (): Promise<void> => {
    try {
      const result = await window.api.openFx()
      if (result) loadBytes(result.path, new Uint8Array(result.data))
    } catch (error) {
      raiseError(`開啟失敗：${messageOf(error)}`)
    }
  }

  const handleSaveAs = async (): Promise<void> => {
    if (!state.doc) return
    try {
      const data = serializeMeshdesc(state.doc)
      const defaultName = state.path ? basenameOf(state.path) : 'meshdesc.xml'
      const savedPath = await window.api.saveFxAs(defaultName, data)
      if (!savedPath) return
      setState((previous) => ({ ...previous, path: savedPath, isDirty: false, error: null }))
    } catch (error) {
      raiseError(`儲存失敗：${messageOf(error)}`)
    }
  }

  const handleSave = async (): Promise<void> => {
    if (!state.doc) return
    if (!state.path) {
      await handleSaveAs()
      return
    }
    try {
      await window.api.saveFx(state.path, serializeMeshdesc(state.doc))
      setState((previous) => ({ ...previous, isDirty: false, error: null }))
    } catch (error) {
      raiseError(`儲存失敗：${messageOf(error)}`)
    }
  }

  const boneOptions = useMemo(
    () => buildBoneCandidates(pmg?.file ? pmgBoneNamesOf(pmg.file) : []),
    [pmg]
  )
  const sourceDocs = useMemo(() => sources.map((source) => source.doc), [sources])
  const emitterNames = useMemo(() => mergedEmitterNames(sourceDocs), [sourceDocs])

  return (
    <div className="fx-meshdesc">
      <div className="fx-toolbar">
        <button
          type="button"
          title="開啟武器/工具的 meshdesc XML"
          onClick={() => void handleOpen()}
        >
          開啟 meshdesc
        </button>
        <button type="button" disabled={!state.doc} onClick={() => void handleSave()}>
          儲存
        </button>
        <button type="button" disabled={!state.doc} onClick={() => void handleSaveAs()}>
          另存新檔
        </button>
        <span className="toolbar-file">
          {state.path ? basenameOf(state.path) : '未開啟檔案'}
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
              onClick={() => setState((previous) => ({ ...previous, error: null }))}
            >
              ✕
            </button>
          </span>
        )}
      </div>
      <EffectSourceList
        paths={sources.map((source) => source.path)}
        status={sourceStatus}
        onAdd={() => void addSourceViaDialog()}
        onRemove={removeSource}
      />
      <div className="fx-meshdesc-layout">
        <div className="fx-meshdesc-body">
          {!doc && <p className="panel-empty">開啟武器/工具的 meshdesc XML 以編輯特效綁定</p>}
          {doc &&
            doc.groups.map((group, groupIndex) => (
              <section key={groupIndex} className="fx-meshdesc-group">
                <div className="panel-title">
                  EffectGroup {groupIndex}（play_mode={group.playMode || '—'}，play={group.play}）
                </div>
                <ul>
                  {group.effects.map((effect, effectIndex) => (
                    <EffectRow
                      key={effectIndex}
                      effect={effect}
                      boneOptions={boneOptions}
                      effectNameOptions={emitterNames}
                      onPatch={(patch) =>
                        editDoc(updateEffect(doc, groupIndex, effectIndex, patch))
                      }
                      onDelete={() => editDoc(removeEffect(doc, groupIndex, effectIndex))}
                      onInvalidNumber={(field) => raiseError(`「${field}」需要是數字`)}
                    />
                  ))}
                </ul>
                <button
                  type="button"
                  className="fx-meshdesc-add"
                  onClick={() => editDoc(addEffect(doc, groupIndex, NEW_EFFECT))}
                >
                  新增特效
                </button>
              </section>
            ))}
        </div>
        <ResizeHandle
          panelSide="right"
          width={previewWidth}
          minWidth={PREVIEW_MIN_WIDTH}
          maxWidth={PREVIEW_MAX_WIDTH}
          onWidthChange={setPreviewWidth}
          ariaLabel="調整預覽欄寬度"
        />
        <div className="fx-meshdesc-preview-column" style={{ width: previewWidth }}>
          <MeshdescPreview
            doc={doc}
            pmgFile={pmg?.file ?? null}
            modelStatus={doc ? (pmg?.status ?? null) : null}
            effectSources={sourceDocs}
          />
        </div>
      </div>
    </div>
  )
}

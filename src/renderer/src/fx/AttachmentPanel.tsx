/**
 * Meshdesc binding sub-tab: open a weapon/tool meshdesc XML, edit its
 * EffectGroup/Effect rows (name, parent bone, effect_name, offset, rotation),
 * add/remove entries via the pure core helpers, and save back.
 * Also auto-loads the sibling same-named .pmg model and an effect-source XML
 * (persisted path) to drive the live preview pane (MeshdescPreview) and the
 * bone / effect-name datalists. Exposes window.__openMeshdescPath in dev.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { EffectDocument } from '../../../core/fx/effectXml'
import { parseEffectXml } from '../../../core/fx/effectXml'
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
import { BONE_DATALIST_ID, EFFECT_NAME_DATALIST_ID, EffectRow } from './MeshdescEffectRow'
import type { ModelStatus } from './MeshdescPreview'
import { MeshdescPreview } from './MeshdescPreview'
import { buildBoneCandidates, emitterNamesOf, pmgBoneNamesOf } from './meshdescPreviewModel'

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

interface EffectSourceState {
  readonly doc: EffectDocument
  readonly path: string
}

const INITIAL_STATE: MeshdescState = { doc: null, path: null, isDirty: false, error: null }

const EFFECT_SOURCE_STORAGE_KEY = 'fx.meshdescEffectSource'
const EFFECT_SOURCE_HINT = '選擇包含發射器定義的特效 XML，供特效名稱下拉選單與預覽使用'

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

const readStoredEffectSourcePath = (): string => {
  try {
    return localStorage.getItem(EFFECT_SOURCE_STORAGE_KEY) ?? ''
  } catch {
    return ''
  }
}

const storeEffectSourcePath = (path: string): void => {
  try {
    localStorage.setItem(EFFECT_SOURCE_STORAGE_KEY, path)
  } catch {
    // Persistence is best-effort; the in-memory value still applies.
  }
}

export function AttachmentPanel(): React.JSX.Element {
  const [state, setState] = useState<MeshdescState>(INITIAL_STATE)
  const [pmg, setPmg] = useState<SiblingPmgState | null>(null)
  const [effectSource, setEffectSource] = useState<EffectSourceState | null>(null)
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
        setState({ doc: parseMeshdesc(data), path, isDirty: false, error: null })
        loadSiblingPmg(path)
      } catch (error) {
        setState((previous) => ({ ...previous, error: `開啟失敗：${messageOf(error)}` }))
      }
    },
    [loadSiblingPmg]
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

  // Auto-reload the persisted effect-source file on mount.
  useEffect(() => {
    const stored = readStoredEffectSourcePath()
    if (stored === '') return undefined
    let isCancelled = false
    window.api
      .openFxPath(stored)
      .then((result) => {
        if (isCancelled || !result) return
        try {
          setEffectSource({ doc: parseEffectXml(new Uint8Array(result.data)), path: result.path })
        } catch {
          // A stale/corrupt stored path silently stays unloaded.
        }
      })
      .catch(() => undefined)
    return () => {
      isCancelled = true
    }
  }, [])

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

  const handlePickEffectSource = async (): Promise<void> => {
    try {
      const result = await window.api.openFx()
      if (!result) return
      const parsed = parseEffectXml(new Uint8Array(result.data))
      setEffectSource({ doc: parsed, path: result.path })
      storeEffectSourcePath(result.path)
    } catch (error) {
      raiseError(`載入特效來源失敗：${messageOf(error)}`)
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
  const emitterNames = useMemo(
    () => (effectSource ? emitterNamesOf(effectSource.doc) : []),
    [effectSource]
  )

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
      <div className="fx-toolbar">
        <button
          type="button"
          title={EFFECT_SOURCE_HINT}
          onClick={() => void handlePickEffectSource()}
        >
          選擇特效檔
        </button>
        <span
          className="toolbar-file"
          title={effectSource ? effectSource.path : EFFECT_SOURCE_HINT}
        >
          特效來源：{effectSource ? `✓ ${basenameOf(effectSource.path)}` : '✗ 未選擇'}
        </span>
      </div>
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
        <div className="fx-meshdesc-preview-column">
          <MeshdescPreview
            doc={doc}
            pmgFile={pmg?.file ?? null}
            modelStatus={doc ? (pmg?.status ?? null) : null}
            effectSource={effectSource?.doc ?? null}
          />
        </div>
      </div>
      <datalist id={BONE_DATALIST_ID}>
        {boneOptions.map((name) => (
          <option key={name.toLowerCase()} value={name} />
        ))}
      </datalist>
      <datalist id={EFFECT_NAME_DATALIST_ID}>
        {emitterNames.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>
    </div>
  )
}

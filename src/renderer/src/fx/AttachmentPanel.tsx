/**
 * Meshdesc binding sub-tab: open a weapon/tool meshdesc XML, edit its
 * EffectGroup/Effect rows (name, parent bone, effect_name, offset, rotation),
 * add/remove entries via the pure core helpers, and save back.
 * Owns its own local state; exposes window.__openMeshdescPath in dev.
 */
import { useEffect, useState } from 'react'
import type { MeshdescDocument, MeshdescEffect } from '../../../core/fx/meshdesc'
import {
  addEffect,
  parseMeshdesc,
  removeEffect,
  serializeMeshdesc,
  updateEffect
} from '../../../core/fx/meshdesc'
import { CommitInput } from './CommitInput'

interface MeshdescState {
  readonly doc: MeshdescDocument | null
  readonly path: string | null
  readonly isDirty: boolean
  readonly error: string | null
}

const INITIAL_STATE: MeshdescState = { doc: null, path: null, isDirty: false, error: null }

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

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : '未知錯誤')

interface EffectRowProps {
  readonly effect: MeshdescEffect
  readonly onPatch: (patch: Partial<MeshdescEffect>) => void
  readonly onDelete: () => void
  readonly onInvalidNumber: (field: string) => void
}

function EffectRow({
  effect,
  onPatch,
  onDelete,
  onInvalidNumber
}: EffectRowProps): React.JSX.Element {
  const commitNumber = (field: string, apply: (value: number) => void) => (raw: string) => {
    const value = Number(raw)
    if (Number.isFinite(value)) apply(value)
    else onInvalidNumber(field)
  }

  return (
    <li className="fx-meshdesc-effect">
      <label className="field fx-meshdesc-field">
        <span className="field-label">名稱</span>
        <CommitInput value={effect.name} onCommit={(name) => onPatch({ name })} />
      </label>
      <label className="field fx-meshdesc-field">
        <span className="field-label">骨骼 (parent)</span>
        <CommitInput value={effect.parent} onCommit={(parent) => onPatch({ parent })} />
      </label>
      <label className="field fx-meshdesc-field">
        <span className="field-label">特效名稱 (effect_name)</span>
        <CommitInput value={effect.effectName} onCommit={(effectName) => onPatch({ effectName })} />
      </label>
      <div className="fx-meshdesc-vec">
        <span className="field-label">位移 X / Y / Z</span>
        <CommitInput
          value={String(effect.offset.x)}
          ariaLabel="位移 X"
          onCommit={commitNumber('offset.x', (x) => onPatch({ offset: { ...effect.offset, x } }))}
        />
        <CommitInput
          value={String(effect.offset.y)}
          ariaLabel="位移 Y"
          onCommit={commitNumber('offset.y', (y) => onPatch({ offset: { ...effect.offset, y } }))}
        />
        <CommitInput
          value={String(effect.offset.z)}
          ariaLabel="位移 Z"
          onCommit={commitNumber('offset.z', (z) => onPatch({ offset: { ...effect.offset, z } }))}
        />
      </div>
      <label className="field fx-meshdesc-field">
        <span className="field-label">旋轉角度 (rot_angle)</span>
        <CommitInput
          value={String(effect.rotAngle)}
          onCommit={commitNumber('rot_angle', (rotAngle) => onPatch({ rotAngle }))}
        />
      </label>
      <button type="button" className="fx-meshdesc-delete" onClick={onDelete}>
        刪除
      </button>
    </li>
  )
}

export function AttachmentPanel(): React.JSX.Element {
  const [state, setState] = useState<MeshdescState>(INITIAL_STATE)
  const doc = state.doc

  const loadBytes = (path: string, data: Uint8Array): void => {
    try {
      setState({ doc: parseMeshdesc(data), path, isDirty: false, error: null })
    } catch (error) {
      setState((previous) => ({ ...previous, error: `開啟失敗：${messageOf(error)}` }))
    }
  }

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

  return (
    <div className="fx-meshdesc">
      <div className="fx-toolbar">
        <button type="button" onClick={() => void handleOpen()}>
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
                    onPatch={(patch) => editDoc(updateEffect(doc, groupIndex, effectIndex, patch))}
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
    </div>
  )
}

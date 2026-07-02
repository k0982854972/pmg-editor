/**
 * One meshdesc Effect row: name, parent bone (datalist of PMG bones +
 * common tool bones), effect_name (datalist of emitter names from the
 * selected effect-source file), offset vector and rotation angle.
 * Extracted from AttachmentPanel.tsx; the shared <datalist> elements are
 * rendered once by the panel and referenced here by id.
 */
import { useState } from 'react'
import type { MeshdescEffect } from '../../../core/fx/meshdesc'
import { CommitInput } from './CommitInput'

export const BONE_DATALIST_ID = 'meshdesc-bone-options'
export const EFFECT_NAME_DATALIST_ID = 'meshdesc-effect-name-options'

interface DatalistInputProps {
  readonly value: string
  readonly onCommit: (value: string) => void
  readonly listId: string
  readonly title?: string
  readonly ariaLabel?: string
}

/**
 * CommitInput behavior (commit on blur/Enter, revert on Escape) plus a
 * datalist suggestion source. Kept local because CommitInput is shared by
 * other tabs and does not expose the `list` attribute.
 */
function DatalistInput({
  value,
  onCommit,
  listId,
  title,
  ariaLabel
}: DatalistInputProps): React.JSX.Element {
  const [draft, setDraft] = useState(value)
  const [lastValue, setLastValue] = useState(value)

  // Re-sync when the committed value changes externally (adjust-state-in-render).
  if (lastValue !== value) {
    setLastValue(value)
    setDraft(value)
  }

  const commit = (): void => {
    if (draft !== value) onCommit(draft)
  }

  return (
    <input
      type="text"
      list={listId}
      title={title}
      aria-label={ariaLabel}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          commit()
        } else if (event.key === 'Escape') {
          setDraft(value)
        }
      }}
    />
  )
}

export interface EffectRowProps {
  readonly effect: MeshdescEffect
  readonly onPatch: (patch: Partial<MeshdescEffect>) => void
  readonly onDelete: () => void
  readonly onInvalidNumber: (field: string) => void
}

export function EffectRow({
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
        <DatalistInput
          value={effect.parent}
          listId={BONE_DATALIST_ID}
          title="特效綁定的骨骼；候選清單來自 PMG 模型的骨骼名稱與常用工具骨骼"
          ariaLabel="骨骼 (parent)"
          onCommit={(parent) => onPatch({ parent })}
        />
      </label>
      <label className="field fx-meshdesc-field">
        <span className="field-label">特效名稱 (effect_name)</span>
        <DatalistInput
          value={effect.effectName}
          listId={EFFECT_NAME_DATALIST_ID}
          title="要播放的發射器名稱；候選清單來自選擇的特效來源檔，也可自行輸入"
          ariaLabel="特效名稱 (effect_name)"
          onCommit={(effectName) => onPatch({ effectName })}
        />
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

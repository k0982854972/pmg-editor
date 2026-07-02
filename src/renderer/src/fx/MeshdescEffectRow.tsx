/**
 * One meshdesc Effect row: name, parent bone (combobox of PMG bones +
 * common tool bones), effect_name (combobox of emitter names from the
 * selected effect-source file), offset vector and rotation angle.
 * The comboboxes replace native <datalist> suggestions with a bounded,
 * scrollable panel so long option lists never overflow the window.
 */
import { useState } from 'react'
import type { MeshdescEffect } from '../../../core/fx/meshdesc'
import { filterComboboxOptions, moveActiveIndex } from '../components/comboboxModel'
import { CommitInput } from './CommitInput'

interface ComboboxInputProps {
  readonly value: string
  readonly onCommit: (value: string) => void
  readonly options: readonly string[]
  readonly title?: string
  readonly ariaLabel?: string
}

/**
 * CommitInput behavior (commit on blur/Enter, revert on Escape) plus a
 * custom suggestion panel: opens on focus, filters by case-insensitive
 * substring while typing, ArrowUp/Down moves the highlight, Enter picks the
 * highlighted option (or commits the free text), Escape closes the panel
 * first and reverts the draft on the second press. Options are selected on
 * mousedown so the click wins over the blur commit. Free text stays allowed.
 */
function ComboboxInput({
  value,
  onCommit,
  options,
  title,
  ariaLabel
}: ComboboxInputProps): React.JSX.Element {
  const [draft, setDraft] = useState(value)
  const [lastValue, setLastValue] = useState(value)
  const [isOpen, setIsOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)

  // Re-sync when the committed value changes externally (adjust-state-in-render).
  if (lastValue !== value) {
    setLastValue(value)
    setDraft(value)
  }

  const suggestions = filterComboboxOptions(options, draft)

  const commit = (next: string): void => {
    if (next !== value) onCommit(next)
  }

  const close = (): void => {
    setIsOpen(false)
    setActiveIndex(-1)
  }

  const selectOption = (option: string): void => {
    setDraft(option)
    commit(option)
    close()
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const step = event.key === 'ArrowDown' ? 1 : -1
      setIsOpen(true)
      setActiveIndex(moveActiveIndex(suggestions.length, isOpen ? activeIndex : -1, step))
    } else if (event.key === 'Enter') {
      if (isOpen && activeIndex >= 0 && activeIndex < suggestions.length) {
        selectOption(suggestions[activeIndex])
      } else {
        commit(draft)
        close()
      }
    } else if (event.key === 'Escape') {
      if (isOpen) close()
      else setDraft(value)
    }
  }

  return (
    <div className="fx-combobox">
      <input
        type="text"
        role="combobox"
        aria-expanded={isOpen}
        aria-autocomplete="list"
        title={title}
        aria-label={ariaLabel}
        value={draft}
        onChange={(event) => {
          setDraft(event.target.value)
          setIsOpen(true)
          setActiveIndex(-1)
        }}
        onFocus={() => setIsOpen(true)}
        onBlur={() => {
          commit(draft)
          close()
        }}
        onKeyDown={handleKeyDown}
      />
      {isOpen && suggestions.length > 0 && (
        <ul className="fx-combobox-panel" role="listbox">
          {suggestions.map((option, index) => (
            <li key={`${index}:${option}`}>
              <button
                type="button"
                role="option"
                aria-selected={index === activeIndex}
                className={
                  index === activeIndex ? 'fx-combobox-option active' : 'fx-combobox-option'
                }
                ref={(element) => {
                  if (index === activeIndex) element?.scrollIntoView({ block: 'nearest' })
                }}
                onMouseDown={(event) => {
                  event.preventDefault()
                  selectOption(option)
                }}
              >
                {option}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export interface EffectRowProps {
  readonly effect: MeshdescEffect
  readonly boneOptions: readonly string[]
  readonly effectNameOptions: readonly string[]
  readonly onPatch: (patch: Partial<MeshdescEffect>) => void
  readonly onDelete: () => void
  readonly onInvalidNumber: (field: string) => void
}

export function EffectRow({
  effect,
  boneOptions,
  effectNameOptions,
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
        <ComboboxInput
          value={effect.parent}
          options={boneOptions}
          title="特效綁定的骨骼；候選清單來自 PMG 模型的骨骼名稱與常用工具骨骼"
          ariaLabel="骨骼 (parent)"
          onCommit={(parent) => onPatch({ parent })}
        />
      </label>
      <label className="field fx-meshdesc-field">
        <span className="field-label">特效名稱 (effect_name)</span>
        <ComboboxInput
          value={effect.effectName}
          options={effectNameOptions}
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

/**
 * Toolbar row listing the loaded effect-source XML files of the meshdesc
 * binding tab: one removable chip per source (basename, full path in the
 * tooltip), an add button while under the 5-source cap, and the
 * auto-load / failure status line from useEffectSources.
 */
import { MAX_EFFECT_SOURCES } from './effectSources'

const ADD_SOURCE_HINT = '選擇包含發射器定義的特效 XML（最多 5 個），供特效名稱下拉選單與預覽使用'

interface EffectSourceListProps {
  readonly paths: readonly string[]
  readonly status: string | null
  readonly onAdd: () => void
  readonly onRemove: (index: number) => void
}

const basenameOf = (path: string): string => path.split(/[\\/]/).pop() ?? path

export function EffectSourceList({
  paths,
  status,
  onAdd,
  onRemove
}: EffectSourceListProps): React.JSX.Element {
  return (
    <div className="fx-toolbar fx-source-list">
      <span className="fx-source-label" title={ADD_SOURCE_HINT}>
        特效來源：
      </span>
      {paths.length === 0 && <span className="fx-source-empty">✗ 未選擇</span>}
      {paths.map((path, index) => (
        <span key={path} className="fx-source-item" title={path}>
          ✓ {basenameOf(path)}
          <button
            type="button"
            className="fx-source-remove"
            title="移除此特效來源"
            onClick={() => onRemove(index)}
          >
            ✕
          </button>
        </span>
      ))}
      {paths.length < MAX_EFFECT_SOURCES && (
        <button type="button" title={ADD_SOURCE_HINT} onClick={onAdd}>
          新增特效來源
        </button>
      )}
      {status && (
        <span className="fx-source-status" title={status}>
          {status}
        </span>
      )}
    </div>
  )
}

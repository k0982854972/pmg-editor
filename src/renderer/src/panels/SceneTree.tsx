/**
 * Left panel: group → mesh tree with selection and per-mesh visibility toggle.
 * Visibility is local UI state owned by App.tsx (keys from meshKeyOf).
 */
import type { PmgFile } from '../../../core/pmg/types'
import type { MeshSelection } from '../state/editorReducer'
import { meshKeyOf } from '../viewport/buildMeshes'

interface SceneTreeProps {
  file: PmgFile | null
  selection: MeshSelection | null
  hiddenKeys: ReadonlySet<string>
  onSelect: (selection: MeshSelection) => void
  onToggleVisibility: (key: string) => void
}

function EyeIcon({ isVisible }: { isVisible: boolean }): React.JSX.Element {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" />
      {isVisible ? <circle cx="12" cy="12" r="3" /> : <line x1="4" y1="20" x2="20" y2="4" />}
    </svg>
  )
}

export function SceneTree({
  file,
  selection,
  hiddenKeys,
  onSelect,
  onToggleVisibility
}: SceneTreeProps): React.JSX.Element {
  return (
    <aside className="scene-tree">
      <h2 className="panel-title">網格</h2>
      {!file && <p className="panel-empty">尚未開啟檔案</p>}
      {file && (
        <ul className="tree-groups">
          {file.groups.map((group, groupIndex) => (
            <li key={groupIndex}>
              <div className="tree-group-name">{group.name.text || `群組 ${groupIndex}`}</div>
              <ul className="tree-meshes">
                {group.meshes.map((mesh, meshIndex) => {
                  const key = meshKeyOf(groupIndex, meshIndex)
                  const isSelected =
                    selection?.groupIndex === groupIndex && selection?.meshIndex === meshIndex
                  const isVisible = !hiddenKeys.has(key)
                  return (
                    <li key={meshIndex} className={isSelected ? 'tree-mesh selected' : 'tree-mesh'}>
                      <button
                        type="button"
                        className="tree-mesh-name"
                        onClick={() => onSelect({ groupIndex, meshIndex })}
                      >
                        {mesh.meshName.text || `網格 ${meshIndex}`}
                      </button>
                      <button
                        type="button"
                        className="tree-eye"
                        title={isVisible ? '隱藏' : '顯示'}
                        onClick={() => onToggleVisibility(key)}
                      >
                        <EyeIcon isVisible={isVisible} />
                      </button>
                    </li>
                  )
                })}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </aside>
  )
}

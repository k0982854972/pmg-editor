/**
 * Right panel: read-only mesh info + editable string fields for the selected
 * mesh. Edits are committed on blur/Enter and rebuild the PmgFile immutably.
 */
import { useState } from 'react'
import { readMatrix } from '../../../core/pmg/access'
import type { PmMesh } from '../../../core/pmg/types'
import { useEditor } from '../state/editorContext'
import { selectedMeshOf } from '../state/editorReducer'
import type { MeshSelection } from '../state/editorReducer'
import { withMeshString } from '../state/meshEdit'
import type { EditableField } from '../state/meshEdit'
import { meshKeyOf } from '../viewport/buildMeshes'

interface TextFieldProps {
  label: string
  value: string
  onCommit: (text: string) => string | null
}

function TextField({ label, value, onCommit }: TextFieldProps): React.JSX.Element {
  const [draft, setDraft] = useState(value)
  const [error, setError] = useState<string | null>(null)
  const [lastValue, setLastValue] = useState(value)

  // Re-sync the draft when the committed value changes (adjust-state-in-render pattern).
  if (lastValue !== value) {
    setLastValue(value)
    setDraft(value)
    setError(null)
  }

  const commit = (): void => {
    if (draft === value) {
      setError(null)
      return
    }
    setError(onCommit(draft))
  }

  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <input
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur()
          if (event.key === 'Escape') {
            setDraft(value)
            setError(null)
          }
        }}
      />
      {error && <span className="field-error">{error}</span>}
    </label>
  )
}

const formatFloat = (value: number): string =>
  Object.is(value, -0) ? '0' : Number(value.toFixed(4)).toString()

function MatrixGrid({ label, raw }: { label: string; raw: Uint8Array }): React.JSX.Element {
  const values = readMatrix(raw)
  return (
    <div className="matrix-block">
      <span className="field-label">{label}</span>
      <div className="matrix-grid">
        {values.map((value, index) => (
          <span key={index} className="matrix-cell" title={String(value)}>
            {formatFloat(value)}
          </span>
        ))}
      </div>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string | number }): React.JSX.Element {
  return (
    <>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </>
  )
}

function MeshDetails({
  mesh,
  selection,
  onEdit
}: {
  mesh: PmMesh
  selection: MeshSelection
  onEdit: (field: EditableField, text: string) => string | null
}): React.JSX.Element {
  return (
    <div key={meshKeyOf(selection.groupIndex, selection.meshIndex)}>
      <dl className="info-grid">
        <InfoRow label="版本" value={mesh.version} />
        <InfoRow label="骨骼" value={mesh.boneName.text || '—'} />
        <InfoRow label="關節" value={mesh.jointName.text || '—'} />
        <InfoRow label="頂點數" value={mesh.counts.vertexCount} />
        <InfoRow label="面數" value={mesh.counts.faceCount} />
        <InfoRow label="索引數" value={mesh.counts.indexCount} />
        <InfoRow label="蒙皮數" value={mesh.counts.skinCount} />
        <InfoRow label="物理數" value={mesh.counts.physicsCount} />
        <InfoRow label="貼圖映射" value={mesh.isTextureMapped ? '是' : '否'} />
      </dl>
      <TextField
        label="網格名稱 meshName"
        value={mesh.meshName.text}
        onCommit={(text) => onEdit('meshName', text)}
      />
      <TextField
        label="狀態 stateName"
        value={mesh.stateName.text}
        onCommit={(text) => onEdit('stateName', text)}
      />
      <TextField
        label="貼圖 textureName"
        value={mesh.textureName.text}
        onCommit={(text) => onEdit('textureName', text)}
      />
      <TextField
        label="顏色 colorName"
        value={mesh.colorName.text}
        onCommit={(text) => onEdit('colorName', text)}
      />
      <MatrixGrid label="矩陣 1" raw={mesh.matrix1} />
      <MatrixGrid label="矩陣 2" raw={mesh.matrix2} />
    </div>
  )
}

export function Inspector(): React.JSX.Element {
  const { state, dispatch } = useEditor()
  const mesh = selectedMeshOf(state)
  const selection = state.selection

  const handleEdit = (field: EditableField, text: string): string | null => {
    if (!mesh || !selection) return null
    try {
      dispatch({ type: 'meshReplaced', selection, mesh: withMeshString(mesh, field, text) })
      return null
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return `無法套用：${message}`
    }
  }

  return (
    <aside className="inspector">
      <h2 className="panel-title">屬性</h2>
      {mesh && selection ? (
        <MeshDetails mesh={mesh} selection={selection} onEdit={handleEdit} />
      ) : (
        <p className="panel-empty">請先選取網格</p>
      )}
    </aside>
  )
}

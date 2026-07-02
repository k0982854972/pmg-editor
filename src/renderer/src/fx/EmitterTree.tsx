/**
 * Left-hand emitter tree: emitters from doc.emitters, expandable to their
 * child element chain. Top-level rows are labelled by the emitter's `name`
 * attribute when present (tag shown as secondary text and tooltip); child
 * rows show the tag with the `name` attribute (or classname) as secondary
 * text. Selection reports both the emitter index and the raw NodePath.
 */
import { useState } from 'react'
import type { EffectDocument, XmlNode } from '../../../core/fx/effectXml'
import { emitterDisplayName, nodeAttributes, nodeTag } from '../../../core/fx/effectXml'
import type { NodePath } from '../state/fxEdit'
import { childNodeRefs, getNodeAtPath, rootNodePath } from '../state/fxEdit'

interface EmitterTreeProps {
  readonly doc: EffectDocument | null
  readonly selectedPath: NodePath | null
  readonly onSelect: (emitterIndex: number, path: NodePath) => void
}

const pathKey = (path: NodePath): string => path.join('/')

interface RowLabel {
  readonly primary: string
  readonly secondary: string
  readonly tooltip: string
}

/**
 * Emitter rows prefer the distinct `name` attribute (tag as secondary +
 * tooltip); child rows keep the tag with name attribute or classname as
 * secondary text.
 */
const rowLabelOf = (node: XmlNode, isEmitterRow: boolean): RowLabel => {
  const tag = nodeTag(node)
  const attrs = nodeAttributes(node)
  const name = (attrs.name ?? '').trim()
  const classname = attrs.classname ?? ''
  if (isEmitterRow) {
    const primary = emitterDisplayName(node)
    return {
      primary,
      secondary: primary !== tag ? tag : classname,
      tooltip: tag
    }
  }
  return { primary: tag, secondary: name !== '' ? name : classname, tooltip: tag }
}

interface TreeNodeProps {
  readonly node: XmlNode
  readonly path: NodePath
  readonly emitterIndex: number
  readonly isEmitterRow: boolean
  readonly selectedKey: string | null
  readonly onSelect: (emitterIndex: number, path: NodePath) => void
}

function TreeNode({
  node,
  path,
  emitterIndex,
  isEmitterRow,
  selectedKey,
  onSelect
}: TreeNodeProps): React.JSX.Element {
  const [isExpanded, setIsExpanded] = useState(false)
  const children = childNodeRefs(node, path)
  const label = rowLabelOf(node, isEmitterRow)
  const isSelected = selectedKey === pathKey(path)

  return (
    <li className="fx-tree-item">
      <div className={isSelected ? 'fx-tree-row selected' : 'fx-tree-row'}>
        <button
          type="button"
          className="fx-tree-toggle"
          disabled={children.length === 0}
          onClick={() => setIsExpanded((previous) => !previous)}
        >
          {children.length === 0 ? '·' : isExpanded ? '▾' : '▸'}
        </button>
        <button
          type="button"
          className="fx-tree-label"
          title={label.tooltip}
          onClick={() => onSelect(emitterIndex, path)}
        >
          <span className="fx-tree-tag">{label.primary}</span>
          {label.secondary && <span className="fx-tree-classname">{label.secondary}</span>}
        </button>
      </div>
      {isExpanded && children.length > 0 && (
        <ul className="fx-tree-children">
          {children.map((child) => (
            <TreeNode
              key={pathKey(child.path)}
              node={child.node}
              path={child.path}
              emitterIndex={emitterIndex}
              isEmitterRow={false}
              selectedKey={selectedKey}
              onSelect={onSelect}
            />
          ))}
        </ul>
      )}
    </li>
  )
}

export function EmitterTree({ doc, selectedPath, onSelect }: EmitterTreeProps): React.JSX.Element {
  if (!doc) {
    return (
      <aside className="fx-tree">
        <div className="panel-title">發射器</div>
        <p className="panel-empty">尚未開啟特效檔</p>
      </aside>
    )
  }

  const rootPath = rootNodePath(doc)
  const emitterRefs = childNodeRefs(getNodeAtPath(doc, rootPath), rootPath)
  const selectedKey = selectedPath ? pathKey(selectedPath) : null

  return (
    <aside className="fx-tree">
      <div className="panel-title">發射器</div>
      {emitterRefs.length === 0 && <p className="panel-empty">此檔案沒有發射器</p>}
      <ul>
        {emitterRefs.map((ref, emitterIndex) => (
          <TreeNode
            key={pathKey(ref.path)}
            node={ref.node}
            path={ref.path}
            emitterIndex={emitterIndex}
            isEmitterRow
            selectedKey={selectedKey}
            onSelect={onSelect}
          />
        ))}
      </ul>
    </aside>
  )
}

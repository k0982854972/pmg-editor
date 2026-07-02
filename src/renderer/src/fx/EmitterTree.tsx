/**
 * Left-hand emitter tree: emitters from doc.emitters, expandable to their
 * child element chain (tag name + classname attribute). Selection reports
 * both the emitter index and the raw NodePath into the tree.
 */
import { useState } from 'react'
import type { EffectDocument, XmlNode } from '../../../core/fx/effectXml'
import { nodeAttributes, nodeTag } from '../../../core/fx/effectXml'
import type { NodePath } from '../state/fxEdit'
import { childNodeRefs, getNodeAtPath, rootNodePath } from '../state/fxEdit'

interface EmitterTreeProps {
  readonly doc: EffectDocument | null
  readonly selectedPath: NodePath | null
  readonly onSelect: (emitterIndex: number, path: NodePath) => void
}

const pathKey = (path: NodePath): string => path.join('/')

interface TreeNodeProps {
  readonly node: XmlNode
  readonly path: NodePath
  readonly emitterIndex: number
  readonly selectedKey: string | null
  readonly onSelect: (emitterIndex: number, path: NodePath) => void
}

function TreeNode({
  node,
  path,
  emitterIndex,
  selectedKey,
  onSelect
}: TreeNodeProps): React.JSX.Element {
  const [isExpanded, setIsExpanded] = useState(false)
  const children = childNodeRefs(node, path)
  const classname = nodeAttributes(node).classname
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
          onClick={() => onSelect(emitterIndex, path)}
        >
          <span className="fx-tree-tag">{nodeTag(node)}</span>
          {classname && <span className="fx-tree-classname">{classname}</span>}
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
            selectedKey={selectedKey}
            onSelect={onSelect}
          />
        ))}
      </ul>
    </aside>
  )
}

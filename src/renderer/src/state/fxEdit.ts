/**
 * Immutable edit helpers for the EffectDocument preserveOrder tree.
 * A NodePath is a chain of raw indices: path[0] indexes doc.tree, each
 * following index addresses the raw child array of the current node.
 * Consumed by fxReducer/ParamEditor; tested in tests/fxui/fxEdit.test.ts.
 */
import type { EffectDocument, XmlNode } from '../../../core/fx/effectXml'
import { nodeChildren, nodeTag } from '../../../core/fx/effectXml'

export type NodePath = readonly number[]

export interface NodeRef {
  readonly path: NodePath
  readonly node: XmlNode
}

const isElement = (node: XmlNode): boolean => {
  const tag = nodeTag(node)
  return tag !== '' && !tag.startsWith('?')
}

const rawChildren = (node: XmlNode): readonly XmlNode[] => {
  const tag = nodeTag(node)
  return tag ? ((node[tag] ?? []) as XmlNode[]) : []
}

/** Path of the document root element (skips the XML declaration). */
export function rootNodePath(doc: EffectDocument): NodePath {
  const index = doc.tree.findIndex(isElement)
  if (index < 0) throw new Error('fxEdit: document has no root element')
  return [index]
}

/** Resolve a NodePath to its node; throws on a dangling path. */
export function getNodeAtPath(doc: EffectDocument, path: NodePath): XmlNode {
  let nodes: readonly XmlNode[] = doc.tree
  let current: XmlNode | undefined
  for (const index of path) {
    current = nodes[index]
    if (!current) throw new Error(`fxEdit: invalid node path [${path.join(', ')}]`)
    nodes = rawChildren(current)
  }
  if (!current) throw new Error('fxEdit: empty node path')
  return current
}

/** Element children of a node paired with their full paths. */
export function childNodeRefs(node: XmlNode, basePath: NodePath): NodeRef[] {
  return rawChildren(node)
    .map((child, index): NodeRef => ({ path: [...basePath, index], node: child }))
    .filter((ref) => isElement(ref.node))
}

function replaceAt(
  nodes: readonly XmlNode[],
  path: NodePath,
  replace: (node: XmlNode) => XmlNode
): XmlNode[] {
  const [head, ...rest] = path
  if (head === undefined || !nodes[head]) {
    throw new Error(`fxEdit: invalid node path segment ${String(head)}`)
  }
  return nodes.map((node, index) => {
    if (index !== head) return node
    if (rest.length === 0) return replace(node)
    const tag = nodeTag(node)
    return { ...node, [tag]: replaceAt(rawChildren(node), rest, replace) }
  })
}

/** Rebuild the document around a new tree (emitters re-derived). */
function withTree(doc: EffectDocument, tree: readonly XmlNode[]): EffectDocument {
  const root = tree.find(isElement)
  if (!root) throw new Error('fxEdit: edited tree lost its root element')
  const emitters = nodeChildren(root).map((node) => ({ name: nodeTag(node), node }))
  return { ...doc, tree, emitters }
}

/** Set (or add) one attribute on the node at path; returns a new document. */
export function updateAttribute(
  doc: EffectDocument,
  path: NodePath,
  key: string,
  value: string
): EffectDocument {
  const tree = replaceAt(doc.tree, path, (node) => ({
    ...node,
    ':@': { ...((node[':@'] ?? {}) as Record<string, string>), [`@_${key}`]: value }
  }))
  return withTree(doc, tree)
}

/** Replace the text content of the node at path, keeping element children. */
export function updateNodeText(doc: EffectDocument, path: NodePath, text: string): EffectDocument {
  const tree = replaceAt(doc.tree, path, (node) => {
    const tag = nodeTag(node)
    if (!tag) throw new Error('fxEdit: cannot set text on a non-element node')
    const elements = rawChildren(node).filter((child) => !('#text' in child))
    const children = text === '' ? elements : [{ '#text': text }, ...elements]
    return { ...node, [tag]: children }
  })
  return withTree(doc, tree)
}

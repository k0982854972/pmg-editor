/**
 * Mabinogi effect XML core (effect_ver7/effect_ver8 particle definitions).
 *
 * Emitter element names are arbitrary (they ARE the effect names), so the
 * document keeps a fast-xml-parser preserveOrder tree for lossless generic
 * access, plus a typed emitter listing. Round-tripping is semantic
 * (parse -> serialize -> parse is deep-equal), not byte-exact; the source
 * encoding and BOM are reproduced on serialize.
 */
import { XMLBuilder, XMLParser } from 'fast-xml-parser'
import type { XmlEncoding } from './xmlEncoding'
import { decodeXmlBytes, detectXmlEncoding, encodeXmlText } from './xmlEncoding'

/** One node of the preserveOrder tree: a tag key -> children, ':@' -> attrs. */
export type XmlNode = Record<string, unknown>

export interface EffectEmitter {
  readonly name: string
  readonly node: XmlNode
}

export interface EffectDocument {
  readonly encoding: XmlEncoding
  readonly rootTag: string
  readonly emitters: readonly EffectEmitter[]
  /** Full preserveOrder tree (including the XML declaration, if present). */
  readonly tree: readonly XmlNode[]
}

const PARSE_OPTIONS = {
  preserveOrder: true,
  ignoreAttributes: false,
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true
} as const

const BUILD_OPTIONS = {
  preserveOrder: true,
  ignoreAttributes: false,
  format: true,
  suppressEmptyNode: true
} as const

/** Element tag of a preserveOrder node ('' for pure text nodes). */
export function nodeTag(node: XmlNode): string {
  return Object.keys(node).find((key) => key !== ':@' && key !== '#text') ?? ''
}

/** Attributes of a node with the '@_' prefix stripped. */
export function nodeAttributes(node: XmlNode): Record<string, string> {
  const raw = (node[':@'] ?? {}) as Record<string, string>
  return Object.fromEntries(Object.entries(raw).map(([key, value]) => [key.slice(2), value]))
}

/** Child element nodes (text-only children excluded). */
export function nodeChildren(node: XmlNode): XmlNode[] {
  const tag = nodeTag(node)
  const children = (tag ? node[tag] : []) as XmlNode[]
  return children.filter((child) => nodeTag(child) !== '')
}

/** Concatenated text content of a node's direct text children. */
export function nodeText(node: XmlNode): string {
  const tag = nodeTag(node)
  const children = (tag ? node[tag] : []) as XmlNode[]
  return children
    .filter((child) => '#text' in child)
    .map((child) => String(child['#text']))
    .join('')
}

const isDeclarationOrText = (node: XmlNode): boolean => {
  const tag = nodeTag(node)
  return tag === '' || tag.startsWith('?')
}

export function parseEffectXml(bytes: Uint8Array): EffectDocument {
  const encoding = detectXmlEncoding(bytes)
  const text = decodeXmlBytes(bytes, encoding)
  const tree = new XMLParser(PARSE_OPTIONS).parse(text) as XmlNode[]

  const root = tree.find((node) => !isDeclarationOrText(node))
  if (!root) {
    throw new Error('effect XML: no root element found')
  }
  const rootTag = nodeTag(root)
  const emitters = nodeChildren(root).map((node) => ({ name: nodeTag(node), node }))
  return { encoding, rootTag, emitters, tree }
}

export function serializeEffectXml(doc: EffectDocument): Uint8Array {
  const text = new XMLBuilder(BUILD_OPTIONS).build(doc.tree) as string
  return encodeXmlText(text, doc.encoding)
}

/**
 * fxEdit spec: immutable attribute/text edits on the EffectDocument
 * preserveOrder tree, addressed by raw index chains (NodePath), and
 * round-tripping through serializeEffectXml -> parseEffectXml.
 */
import { describe, expect, it } from 'vitest'
import {
  nodeAttributes,
  nodeChildren,
  nodeTag,
  nodeText,
  parseEffectXml,
  serializeEffectXml
} from '../../src/core/fx/effectXml'
import {
  childNodeRefs,
  getNodeAtPath,
  rootNodePath,
  updateAttribute,
  updateNodeText
} from '../../src/renderer/src/state/fxEdit'

const SAMPLE = `<?xml version="1.0" encoding="utf-8"?>
<effect_ver8 version="8" classname="EffectGroup[8]" name="particles5_ver8">
  <fireball classname="CEmitterType[8]" rotation_axis="1 0 0">
    <EffectType classname="CParticleType[8]" gravity_scale="-1">
      <Life classname="CLifeController[8]" variance="0">0 1000</Life>
      <ColorOverLife classname="CColorOverLifeController[8]">0 00FFFFC0 1 00000000</ColorOverLife>
    </EffectType>
  </fireball>
  <smoke classname="CEmitterType[8]" />
</effect_ver8>
`

const load = (): ReturnType<typeof parseEffectXml> =>
  parseEffectXml(new TextEncoder().encode(SAMPLE))

describe('node path navigation', () => {
  it('rootNodePath resolves to the document root element', () => {
    const doc = load()
    const root = getNodeAtPath(doc, rootNodePath(doc))
    expect(nodeTag(root)).toBe('effect_ver8')
  })

  it('childNodeRefs lists element children with resolvable paths', () => {
    const doc = load()
    const rootPath = rootNodePath(doc)
    const emitters = childNodeRefs(getNodeAtPath(doc, rootPath), rootPath)
    expect(emitters.map((ref) => nodeTag(ref.node))).toEqual(['fireball', 'smoke'])
    for (const ref of emitters) {
      expect(nodeTag(getNodeAtPath(doc, ref.path))).toBe(nodeTag(ref.node))
    }
  })

  it('getNodeAtPath throws on an invalid path', () => {
    const doc = load()
    expect(() => getNodeAtPath(doc, [99])).toThrow()
    expect(() => getNodeAtPath(doc, [...rootNodePath(doc), 42])).toThrow()
  })
})

describe('updateAttribute', () => {
  it('changes an existing attribute and round-trips through serialize/parse', () => {
    const doc = load()
    const rootPath = rootNodePath(doc)
    const fireballPath = childNodeRefs(getNodeAtPath(doc, rootPath), rootPath)[0].path
    const edited = updateAttribute(doc, fireballPath, 'rotation_axis', '0 1 0')

    const reparsed = parseEffectXml(serializeEffectXml(edited))
    const attrs = nodeAttributes(reparsed.emitters[0].node)
    expect(attrs.rotation_axis).toBe('0 1 0')
    expect(attrs.classname).toBe('CEmitterType[8]')
  })

  it('adds a new attribute when the key does not exist yet', () => {
    const doc = load()
    const edited = updateAttribute(doc, rootNodePath(doc), 'comment', 'hello')
    const reparsed = parseEffectXml(serializeEffectXml(edited))
    const root = getNodeAtPath(reparsed, rootNodePath(reparsed))
    expect(nodeAttributes(root).comment).toBe('hello')
    expect(nodeAttributes(root).name).toBe('particles5_ver8')
  })

  it('does not mutate the original document and rebuilds emitters', () => {
    const doc = load()
    const rootPath = rootNodePath(doc)
    const fireballPath = childNodeRefs(getNodeAtPath(doc, rootPath), rootPath)[0].path
    const edited = updateAttribute(doc, fireballPath, 'rotation_axis', '0 1 0')

    expect(nodeAttributes(doc.emitters[0].node).rotation_axis).toBe('1 0 0')
    expect(nodeAttributes(edited.emitters[0].node).rotation_axis).toBe('0 1 0')
    expect(edited.emitters.map((e) => e.name)).toEqual(['fireball', 'smoke'])
  })

  it('throws on an invalid path', () => {
    const doc = load()
    expect(() => updateAttribute(doc, [99, 0], 'x', 'y')).toThrow()
  })
})

describe('updateNodeText', () => {
  const lifePathOf = (doc: ReturnType<typeof parseEffectXml>): readonly number[] => {
    const rootPath = rootNodePath(doc)
    const fireball = childNodeRefs(getNodeAtPath(doc, rootPath), rootPath)[0]
    const effectType = childNodeRefs(fireball.node, fireball.path)[0]
    return childNodeRefs(effectType.node, effectType.path)[0].path
  }

  it('replaces controller text and round-trips through serialize/parse', () => {
    const doc = load()
    const edited = updateNodeText(doc, lifePathOf(doc), '0 2500')
    const reparsed = parseEffectXml(serializeEffectXml(edited))
    expect(nodeText(getNodeAtPath(reparsed, lifePathOf(reparsed)))).toBe('0 2500')
    // Original stays untouched.
    expect(nodeText(getNodeAtPath(doc, lifePathOf(doc)))).toBe('0 1000')
  })

  it('keeps element children when setting text on a container node', () => {
    const doc = load()
    const rootPath = rootNodePath(doc)
    const fireball = childNodeRefs(getNodeAtPath(doc, rootPath), rootPath)[0]
    const effectTypePath = childNodeRefs(fireball.node, fireball.path)[0].path

    const edited = updateNodeText(doc, effectTypePath, 'note')
    const reparsed = parseEffectXml(serializeEffectXml(edited))
    const rerootPath = rootNodePath(reparsed)
    const refireball = childNodeRefs(getNodeAtPath(reparsed, rerootPath), rerootPath)[0]
    const reEffectType = childNodeRefs(refireball.node, refireball.path)[0]
    expect(nodeText(reEffectType.node)).toBe('note')
    expect(nodeChildren(reEffectType.node).map(nodeTag)).toEqual(['Life', 'ColorOverLife'])
  })

  it('clears text when given an empty string', () => {
    const doc = load()
    const edited = updateNodeText(doc, lifePathOf(doc), '')
    expect(nodeText(getNodeAtPath(edited, lifePathOf(edited)))).toBe('')
  })
})

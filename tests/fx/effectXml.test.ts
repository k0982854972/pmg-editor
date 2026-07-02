/**
 * Effect XML core spec: parse Mabinogi effect_ver8-style XML, preserve
 * unknown elements/attributes, and round-trip semantically in the source
 * encoding (UTF-8 or UTF-16 with BOM).
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

const SAMPLE = `<?xml version="1.0" encoding="utf-8"?>
<effect_ver8 version="8" classname="EffectGroup[8]" name="particles5_ver8">
  <magic_fireball_projectile classname="CEmitterType[8]" rotation_axis="1 0 0" emission_dirtype="3">
    <EmitterShape classname="CEmitterShapePoint[8]" link_to_emitter="1" position="0.0 0.0 0.0" />
    <EffectType classname="CParticleType[8]" gravity_scale="-1" pivot="0.5 0.5" align="screen">
      <Texture texture="common_effect_alpha" tas_classname="tas_dynamicgrid[8]" tex_width="512" tex_height="512" width="64" height="64" x="0" y="128" />
      <Life classname="CLifeController[8]" variance="0">0 1000</Life>
      <ColorOverLife classname="CColorOverLifeController[8]" variance="0" min="0" max="1">0 00FFFFC0 0.15 FFFF8080 0.8 80602040 1 00000000</ColorOverLife>
    </EffectType>
  </magic_fireball_projectile>
  <second_emitter classname="CEmitterType[8]" />
</effect_ver8>
`

const utf8Bytes = (text: string): Uint8Array => new TextEncoder().encode(text)

function utf16leBytes(text: string, withBom: boolean): Uint8Array {
  const out = new Uint8Array((text.length + (withBom ? 1 : 0)) * 2)
  const view = new DataView(out.buffer)
  let offset = 0
  if (withBom) {
    view.setUint16(0, 0xfeff, true)
    offset = 2
  }
  for (let i = 0; i < text.length; i++) {
    view.setUint16(offset + i * 2, text.charCodeAt(i), true)
  }
  return out
}

describe('parseEffectXml', () => {
  const doc = parseEffectXml(utf8Bytes(SAMPLE))

  it('identifies the root tag and encoding', () => {
    expect(doc.rootTag).toBe('effect_ver8')
    expect(doc.encoding).toEqual({ name: 'utf-8', hasBom: false })
  })

  it('lists emitters by their arbitrary element names', () => {
    expect(doc.emitters.map((e) => e.name)).toEqual(['magic_fireball_projectile', 'second_emitter'])
  })

  it('gives generic access to attributes, children, and text', () => {
    const emitter = doc.emitters[0].node
    expect(nodeAttributes(emitter).rotation_axis).toBe('1 0 0')
    expect(nodeAttributes(emitter).emission_dirtype).toBe('3')

    const effectType = nodeChildren(emitter).find((c) => nodeTag(c) === 'EffectType')
    expect(effectType).toBeDefined()
    const life = nodeChildren(effectType!).find((c) => nodeTag(c) === 'Life')
    expect(nodeText(life!)).toBe('0 1000')
    const col = nodeChildren(effectType!).find((c) => nodeTag(c) === 'ColorOverLife')
    expect(nodeText(col!)).toBe('0 00FFFFC0 0.15 FFFF8080 0.8 80602040 1 00000000')
  })

  it('rejects bytes without an XML element', () => {
    expect(() => parseEffectXml(utf8Bytes('not xml at all'))).toThrow()
  })
})

describe('serializeEffectXml', () => {
  it('round-trips UTF-8 semantically, keeping unknown attributes', () => {
    const doc = parseEffectXml(utf8Bytes(SAMPLE))
    const again = parseEffectXml(serializeEffectXml(doc))
    expect(again.tree).toEqual(doc.tree)
    expect(again.encoding).toEqual(doc.encoding)
    expect(nodeAttributes(again.emitters[0].node).emission_dirtype).toBe('3')
  })

  it('round-trips UTF-16LE with BOM in the same encoding', () => {
    const source = SAMPLE.replace('utf-8', 'utf-16')
    const doc = parseEffectXml(utf16leBytes(source, true))
    expect(doc.encoding).toEqual({ name: 'utf-16le', hasBom: true })
    expect(doc.rootTag).toBe('effect_ver8')

    const bytes = serializeEffectXml(doc)
    expect([bytes[0], bytes[1]]).toEqual([0xff, 0xfe])
    const again = parseEffectXml(bytes)
    expect(again.encoding).toEqual({ name: 'utf-16le', hasBom: true })
    expect(again.tree).toEqual(doc.tree)
  })

  it('detects BOM-less UTF-16LE from the byte pattern', () => {
    const doc = parseEffectXml(utf16leBytes('<effect_ver7 version="7"/>', false))
    expect(doc.encoding.name).toBe('utf-16le')
    expect(doc.rootTag).toBe('effect_ver7')
  })
})

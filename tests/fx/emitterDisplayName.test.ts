/**
 * Spec for emitterDisplayName: emitter/child nodes should be labelled by
 * their `name` attribute when present (distinct effect ids like
 * `dark_wind01`), falling back to the element tag otherwise.
 */
import { describe, expect, it } from 'vitest'
import { emitterDisplayName, parseEffectXml } from '../../src/core/fx/effectXml'

const SAMPLE = `<?xml version="1.0" encoding="utf-8"?>
<EffectGroup classname="EffectGroup[10]" name="title_effect01">
  <Glasgavelen_ShoutOfDeath_beam classname="CEmitterType[10]" name="dark_wind01" />
  <Glasgavelen_ShoutOfDeath_beam classname="CEmitterType[10]" name="dark_grow01" />
  <leaves_emitter classname="CEmitterType[8]" />
  <Effect classname="CEmitterType[8]" name="   " />
</EffectGroup>
`

const utf8Bytes = (text: string): Uint8Array => new TextEncoder().encode(text)

describe('emitterDisplayName', () => {
  const doc = parseEffectXml(utf8Bytes(SAMPLE))

  it('prefers the name attribute over the element tag', () => {
    expect(emitterDisplayName(doc.emitters[0].node)).toBe('dark_wind01')
  })

  it('distinguishes repeated tags by their name attributes', () => {
    expect(doc.emitters.slice(0, 2).map((e) => emitterDisplayName(e.node))).toEqual([
      'dark_wind01',
      'dark_grow01'
    ])
  })

  it('falls back to the tag when there is no name attribute', () => {
    expect(emitterDisplayName(doc.emitters[2].node)).toBe('leaves_emitter')
  })

  it('falls back to the tag when the name attribute is blank', () => {
    expect(emitterDisplayName(doc.emitters[3].node)).toBe('Effect')
  })
})

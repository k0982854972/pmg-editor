/**
 * meshdesc attachment XML spec: EffectGroup/Effect entries with typed
 * fields, defaulted missing attributes, preserved unknown attributes, and
 * pure add/remove/update helpers.
 */
import { describe, expect, it } from 'vitest'
import {
  addEffect,
  parseMeshdesc,
  removeEffect,
  serializeMeshdesc,
  updateEffect
} from '../../src/core/fx/meshdesc'
import type { MeshdescEffect } from '../../src/core/fx/meshdesc'

const SAMPLE = `<?xml version="1.0" encoding="utf-8"?>
<meshdesc version="3" effect_version="7">
  <EffectGroup play_mode="loop" play="1">
    <Effect name="fx_a" parent="HandtoolR" effect_name="glow_effect" slot="0" align="parent" offset="4.3 0 0" rot_axis="0 0 1" rot_angle="90" custom_attr="keepme" />
    <Effect name="fx_b" effect_name="trail" />
  </EffectGroup>
  <EffectGroup play_mode="once" play="0" />
</meshdesc>
`

const bytes = (): Uint8Array => new TextEncoder().encode(SAMPLE)

describe('parseMeshdesc', () => {
  const doc = parseMeshdesc(bytes())

  it('reads root attributes and groups', () => {
    expect(doc.version).toBe('3')
    expect(doc.effectVersion).toBe('7')
    expect(doc.groups).toHaveLength(2)
    expect(doc.groups[0].playMode).toBe('loop')
    expect(doc.groups[0].play).toBe(1)
    expect(doc.groups[1].playMode).toBe('once')
    expect(doc.groups[1].effects).toEqual([])
  })

  it('reads typed effect fields', () => {
    const fx = doc.groups[0].effects[0]
    expect(fx.name).toBe('fx_a')
    expect(fx.parent).toBe('HandtoolR')
    expect(fx.effectName).toBe('glow_effect')
    expect(fx.slot).toBe(0)
    expect(fx.align).toBe('parent')
    expect(fx.offset).toEqual({ x: 4.3, y: 0, z: 0 })
    expect(fx.rotAxis).toEqual({ x: 0, y: 0, z: 1 })
    expect(fx.rotAngle).toBe(90)
  })

  it('defaults missing attributes and keeps unknown ones', () => {
    const fx = doc.groups[0].effects[1]
    expect(fx.parent).toBe('')
    expect(fx.slot).toBe(0)
    expect(fx.offset).toEqual({ x: 0, y: 0, z: 0 })
    expect(fx.rotAxis).toEqual({ x: 0, y: 0, z: 0 })
    expect(fx.rotAngle).toBe(0)

    expect(doc.groups[0].effects[0].extraAttributes).toEqual({ custom_attr: 'keepme' })
  })
})

describe('serializeMeshdesc', () => {
  it('round-trips semantically, keeping unknown attributes', () => {
    const doc = parseMeshdesc(bytes())
    const again = parseMeshdesc(serializeMeshdesc(doc))
    expect(again).toEqual(doc)
    expect(again.groups[0].effects[0].extraAttributes.custom_attr).toBe('keepme')
  })

  it('round-trips after an edit', () => {
    const doc = parseMeshdesc(bytes())
    const edited = updateEffect(doc, 0, 0, { rotAngle: 45 })
    const again = parseMeshdesc(serializeMeshdesc(edited))
    expect(again.groups[0].effects[0].rotAngle).toBe(45)
    expect(again.groups[0].effects[0].extraAttributes.custom_attr).toBe('keepme')
  })
})

describe('meshdesc helpers', () => {
  const doc = parseMeshdesc(bytes())
  const newFx: MeshdescEffect = {
    name: 'fx_new',
    parent: 'HandtoolL',
    effectName: 'spark',
    slot: 1,
    align: 'world',
    offset: { x: 1, y: 2, z: 3 },
    rotAxis: { x: 0, y: 1, z: 0 },
    rotAngle: 180,
    extraAttributes: {}
  }

  it('addEffect appends without mutating the original', () => {
    const next = addEffect(doc, 1, newFx)
    expect(next.groups[1].effects).toEqual([newFx])
    expect(doc.groups[1].effects).toEqual([])
  })

  it('removeEffect drops one entry without mutating the original', () => {
    const next = removeEffect(doc, 0, 0)
    expect(next.groups[0].effects.map((e) => e.name)).toEqual(['fx_b'])
    expect(doc.groups[0].effects).toHaveLength(2)
  })

  it('updateEffect patches fields without mutating the original', () => {
    const next = updateEffect(doc, 0, 1, { parent: 'Head', slot: 2 })
    expect(next.groups[0].effects[1].parent).toBe('Head')
    expect(next.groups[0].effects[1].slot).toBe(2)
    expect(next.groups[0].effects[1].effectName).toBe('trail')
    expect(doc.groups[0].effects[1].parent).toBe('')
  })

  it('helpers throw on out-of-range indices', () => {
    expect(() => addEffect(doc, 9, newFx)).toThrow(/group/i)
    expect(() => removeEffect(doc, 0, 9)).toThrow(/effect/i)
    expect(() => updateEffect(doc, 0, 9, {})).toThrow(/effect/i)
  })
})

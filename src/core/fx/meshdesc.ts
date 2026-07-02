/**
 * meshdesc attachment XML (weapon/tool effect placement):
 * <meshdesc version="3" effect_version="7">
 *   <EffectGroup play_mode="loop" play="1">
 *     <Effect name=".." parent="HandtoolR" effect_name=".." slot="0"
 *             align="parent" offset="4.3 0 0" rot_axis="0 0 0" rot_angle="0"/>
 *   </EffectGroup>
 * </meshdesc>
 * Missing attributes get defaults; unknown attributes are preserved.
 */
import { XMLBuilder, XMLParser } from 'fast-xml-parser'
import type { XmlEncoding } from './xmlEncoding'
import { decodeXmlBytes, detectXmlEncoding, encodeXmlText } from './xmlEncoding'

export interface Vec3 {
  readonly x: number
  readonly y: number
  readonly z: number
}

export interface MeshdescEffect {
  readonly name: string
  readonly parent: string
  readonly effectName: string
  readonly slot: number
  readonly align: string
  readonly offset: Vec3
  readonly rotAxis: Vec3
  readonly rotAngle: number
  readonly extraAttributes: Readonly<Record<string, string>>
}

export interface MeshdescGroup {
  readonly playMode: string
  readonly play: number
  readonly effects: readonly MeshdescEffect[]
  readonly extraAttributes: Readonly<Record<string, string>>
}

export interface MeshdescDocument {
  readonly encoding: XmlEncoding
  readonly version: string
  readonly effectVersion: string
  readonly groups: readonly MeshdescGroup[]
}

type Attrs = Record<string, string>
type RawElement = Attrs & { EffectGroup?: RawElement[]; Effect?: RawElement[] }

const KNOWN_EFFECT_ATTRS = [
  '@_name',
  '@_parent',
  '@_effect_name',
  '@_slot',
  '@_align',
  '@_offset',
  '@_rot_axis',
  '@_rot_angle'
]
const KNOWN_GROUP_ATTRS = ['@_play_mode', '@_play']

const XML_OPTIONS = {
  ignoreAttributes: false,
  parseTagValue: false,
  parseAttributeValue: false,
  isArray: (name: string): boolean => name === 'EffectGroup' || name === 'Effect'
} as const

const attr = (el: Attrs, name: string, fallback: string): string => el[`@_${name}`] ?? fallback

const numAttr = (el: Attrs, name: string, fallback: number): number => {
  const raw = el[`@_${name}`]
  if (raw === undefined) return fallback
  const value = Number(raw)
  if (!Number.isFinite(value)) throw new Error(`meshdesc: invalid number "${raw}" for ${name}`)
  return value
}

function vec3Attr(el: Attrs, name: string): Vec3 {
  const raw = el[`@_${name}`]
  if (raw === undefined) return { x: 0, y: 0, z: 0 }
  const parts = raw.trim().split(/\s+/).map(Number)
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) {
    throw new Error(`meshdesc: invalid vector "${raw}" for ${name}`)
  }
  return { x: parts[0], y: parts[1], z: parts[2] }
}

const extraAttrs = (el: Attrs, known: readonly string[]): Attrs =>
  Object.fromEntries(
    Object.entries(el)
      .filter(([key, value]) => key.startsWith('@_') && !known.includes(key))
      .map(([key, value]) => [key.slice(2), String(value)])
  )

function parseEffect(el: RawElement): MeshdescEffect {
  return {
    name: attr(el, 'name', ''),
    parent: attr(el, 'parent', ''),
    effectName: attr(el, 'effect_name', ''),
    slot: numAttr(el, 'slot', 0),
    align: attr(el, 'align', ''),
    offset: vec3Attr(el, 'offset'),
    rotAxis: vec3Attr(el, 'rot_axis'),
    rotAngle: numAttr(el, 'rot_angle', 0),
    extraAttributes: extraAttrs(el, KNOWN_EFFECT_ATTRS)
  }
}

export function parseMeshdesc(bytes: Uint8Array): MeshdescDocument {
  const encoding = detectXmlEncoding(bytes)
  const parsed = new XMLParser(XML_OPTIONS).parse(decodeXmlBytes(bytes, encoding)) as {
    meshdesc?: RawElement
  }
  const root = parsed.meshdesc
  if (!root) throw new Error('meshdesc XML: missing <meshdesc> root element')

  const groups = (root.EffectGroup ?? []).map(
    (el): MeshdescGroup => ({
      playMode: attr(el, 'play_mode', ''),
      play: numAttr(el, 'play', 0),
      effects: (el.Effect ?? []).map(parseEffect),
      extraAttributes: extraAttrs(el, KNOWN_GROUP_ATTRS)
    })
  )
  return {
    encoding,
    version: attr(root, 'version', ''),
    effectVersion: attr(root, 'effect_version', ''),
    groups
  }
}

const vec3Text = (v: Vec3): string => `${v.x} ${v.y} ${v.z}`

const prefixed = (attrs: Attrs): Attrs =>
  Object.fromEntries(Object.entries(attrs).map(([key, value]) => [`@_${key}`, value]))

export function serializeMeshdesc(doc: MeshdescDocument): Uint8Array {
  const tree = {
    '?xml': { '@_version': '1.0', '@_encoding': doc.encoding.name.startsWith('utf-16') ? 'utf-16' : 'utf-8' },
    meshdesc: {
      '@_version': doc.version,
      '@_effect_version': doc.effectVersion,
      EffectGroup: doc.groups.map((group) => ({
        '@_play_mode': group.playMode,
        '@_play': String(group.play),
        ...prefixed({ ...group.extraAttributes }),
        Effect: group.effects.map((fx) => ({
          '@_name': fx.name,
          '@_parent': fx.parent,
          '@_effect_name': fx.effectName,
          '@_slot': String(fx.slot),
          '@_align': fx.align,
          '@_offset': vec3Text(fx.offset),
          '@_rot_axis': vec3Text(fx.rotAxis),
          '@_rot_angle': String(fx.rotAngle),
          ...prefixed({ ...fx.extraAttributes })
        }))
      }))
    }
  }
  const text = new XMLBuilder({
    ignoreAttributes: false,
    format: true,
    suppressEmptyNode: true
  }).build(tree) as string
  return encodeXmlText(text, doc.encoding)
}

function requireGroup(doc: MeshdescDocument, groupIndex: number): MeshdescGroup {
  const group = doc.groups[groupIndex]
  if (!group) throw new Error(`meshdesc: no EffectGroup at index ${groupIndex}`)
  return group
}

function requireEffect(group: MeshdescGroup, effectIndex: number): MeshdescEffect {
  const effect = group.effects[effectIndex]
  if (!effect) throw new Error(`meshdesc: no Effect at index ${effectIndex}`)
  return effect
}

const withGroup = (
  doc: MeshdescDocument,
  groupIndex: number,
  update: (group: MeshdescGroup) => MeshdescGroup
): MeshdescDocument => ({
  ...doc,
  groups: doc.groups.map((group, i) => (i === groupIndex ? update(group) : group))
})

export function addEffect(
  doc: MeshdescDocument,
  groupIndex: number,
  effect: MeshdescEffect
): MeshdescDocument {
  requireGroup(doc, groupIndex)
  return withGroup(doc, groupIndex, (group) => ({
    ...group,
    effects: [...group.effects, effect]
  }))
}

export function removeEffect(
  doc: MeshdescDocument,
  groupIndex: number,
  effectIndex: number
): MeshdescDocument {
  requireEffect(requireGroup(doc, groupIndex), effectIndex)
  return withGroup(doc, groupIndex, (group) => ({
    ...group,
    effects: group.effects.filter((_, i) => i !== effectIndex)
  }))
}

export function updateEffect(
  doc: MeshdescDocument,
  groupIndex: number,
  effectIndex: number,
  patch: Partial<MeshdescEffect>
): MeshdescDocument {
  requireEffect(requireGroup(doc, groupIndex), effectIndex)
  return withGroup(doc, groupIndex, (group) => ({
    ...group,
    effects: group.effects.map((effect, i) =>
      i === effectIndex ? { ...effect, ...patch } : effect
    )
  }))
}

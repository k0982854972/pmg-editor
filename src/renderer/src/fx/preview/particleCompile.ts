/**
 * Compilation of an EffectDocument emitter node into the plain data the
 * FX preview simulation consumes: per-EffectType keyframe tracks, atlas
 * cell, ColorOverLife frames and the emitter shape. Missing controllers
 * fall back to documented defaults (life 1000 ms, number 10, size 1,
 * speed 0, spin 0, angle 0, *OverLife constant 1, emission angle 45 deg).
 * Re-exported through particleModel.ts.
 */
import type { EffectDocument, XmlNode } from '../../../../core/fx/effectXml'
import { nodeAttributes, nodeChildren, nodeTag, nodeText } from '../../../../core/fx/effectXml'
import type { ColorKeyframe } from '../../../../core/fx/colorOverLife'
import { parseColorKeyframes } from '../../../../core/fx/colorOverLife'
import type { Rgba, Track } from './particleTracks'
import { frameToRgba, parseTrack } from './particleTracks'

export const DEFAULT_EMISSION_ANGLE_DEG = 45

const DEFAULT_DURATION_MS = 1000

export interface AtlasCell {
  readonly texture: string
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
  readonly texWidth: number
  readonly texHeight: number
  readonly column: number
  readonly row: number
  readonly aniLoopPerSec: number
}

export type ShapeKind = 'point' | 'circle' | 'sphere' | 'hemisphere'

export interface CompiledShape {
  readonly kind: ShapeKind
  readonly radius: number
  readonly position: readonly [number, number, number]
}

export interface CompiledEffectType {
  readonly name: string
  readonly atlas: AtlasCell | null
  readonly life: Track
  readonly number: Track
  readonly size: Track
  readonly speed: Track
  readonly spin: Track
  readonly angle: Track
  readonly sizeOverLife: Track
  readonly speedOverLife: Track
  readonly spinOverLife: Track
  readonly gravityOverLife: Track
  readonly colorOverLife: readonly ColorKeyframe[]
  readonly tint: Rgba
  readonly gravityScale: number
  readonly lifeRandomness: number
  readonly align: string
}

export interface CompiledEmitter {
  readonly name: string
  readonly shape: CompiledShape
  readonly emissionAngle: Track
  /** Best-effort emitter cycle length in ms (for the loop control). */
  readonly durationMs: number
  readonly effectTypes: readonly CompiledEffectType[]
}

const attrNumber = (attrs: Record<string, string>, key: string, fallback: number): number => {
  const value = Number(attrs[key])
  return Number.isFinite(value) ? value : fallback
}

const childByTag = (node: XmlNode, tag: string): XmlNode | undefined =>
  nodeChildren(node).find((child) => nodeTag(child) === tag)

const trackOf = (node: XmlNode, tag: string, fallback: Track): Track => {
  const child = childByTag(node, tag)
  if (!child) return fallback
  const track = parseTrack(nodeText(child))
  return track.length > 0 ? track : fallback
}

const constantTrack = (value: number): Track => [{ time: 0, value }]

const safeColorFrames = (text: string): readonly ColorKeyframe[] => {
  try {
    return parseColorKeyframes(text)
  } catch {
    return []
  }
}

function parseShape(emitterNode: XmlNode): CompiledShape {
  const shapeNode = childByTag(emitterNode, 'EmitterShape')
  const fallback: CompiledShape = { kind: 'point', radius: 0, position: [0, 0, 0] }
  if (!shapeNode) return fallback
  const attrs = nodeAttributes(shapeNode)
  const classname = attrs.classname ?? ''
  let kind: ShapeKind = 'point'
  if (classname.includes('Hemisphere')) kind = 'hemisphere'
  else if (classname.includes('Sphere')) kind = 'sphere'
  else if (classname.includes('Circle')) kind = 'circle'
  const radiusTokens = (attrs.radius ?? '').trim().split(/\s+/).map(Number)
  const radius = Math.max(0, ...radiusTokens.filter(Number.isFinite).map(Math.abs))
  const positionTokens = (attrs.position ?? '').trim().split(/\s+/).map(Number)
  const position: [number, number, number] = [
    Number.isFinite(positionTokens[0]) ? positionTokens[0] : 0,
    Number.isFinite(positionTokens[1]) ? positionTokens[1] : 0,
    Number.isFinite(positionTokens[2]) ? positionTokens[2] : 0
  ]
  return { kind, radius, position }
}

function parseAtlas(effectTypeNode: XmlNode): AtlasCell | null {
  const textureNode = childByTag(effectTypeNode, 'Texture')
  if (!textureNode) return null
  const attrs = nodeAttributes(textureNode)
  const texture = attrs.texture ?? ''
  if (!texture) return null
  return {
    texture,
    x: attrNumber(attrs, 'x', 0),
    y: attrNumber(attrs, 'y', 0),
    width: attrNumber(attrs, 'width', 0),
    height: attrNumber(attrs, 'height', 0),
    texWidth: attrNumber(attrs, 'tex_width', 0),
    texHeight: attrNumber(attrs, 'tex_height', 0),
    column: Math.max(1, attrNumber(attrs, 'column', 1)),
    row: Math.max(1, attrNumber(attrs, 'row', 1)),
    aniLoopPerSec: attrNumber(attrs, 'ani_loop_per_sec', 0)
  }
}

function compileEffectType(node: XmlNode): CompiledEffectType {
  const attrs = nodeAttributes(node)
  const colorNode = childByTag(node, 'Color')
  const tintFrames = colorNode ? safeColorFrames(nodeText(colorNode)) : []
  const colorOverLifeNode = childByTag(node, 'ColorOverLife')
  return {
    name: attrs.name ?? attrs.classname ?? 'EffectType',
    atlas: parseAtlas(node),
    life: trackOf(node, 'Life', constantTrack(1000)),
    number: trackOf(node, 'Number', constantTrack(10)),
    size: trackOf(node, 'Size', constantTrack(1)),
    speed: trackOf(node, 'Speed', constantTrack(0)),
    spin: trackOf(node, 'Spin', constantTrack(0)),
    angle: trackOf(node, 'Angle', constantTrack(0)),
    sizeOverLife: trackOf(node, 'SizeOverLife', constantTrack(1)),
    speedOverLife: trackOf(node, 'SpeedOverLife', constantTrack(1)),
    spinOverLife: trackOf(node, 'SpinOverLife', constantTrack(1)),
    gravityOverLife: trackOf(node, 'GravityOverLife', constantTrack(1)),
    colorOverLife: colorOverLifeNode ? safeColorFrames(nodeText(colorOverLifeNode)) : [],
    tint: tintFrames.length > 0 ? frameToRgba(tintFrames[0]) : { r: 1, g: 1, b: 1, a: 1 },
    gravityScale: attrNumber(attrs, 'gravity_scale', 0),
    lifeRandomness: attrNumber(attrs, 'life_randomness', 0),
    align: attrs.align ?? ''
  }
}

const lastKeyTime = (track: Track): number => (track.length > 0 ? track[track.length - 1].time : 0)

export function compileEmitter(doc: EffectDocument, emitterIndex: number): CompiledEmitter | null {
  const emitter = doc.emitters[emitterIndex]
  if (!emitter) return null
  const emitterNode = emitter.node
  const effectTypes = nodeChildren(emitterNode)
    .filter((child) => nodeTag(child) === 'EffectType')
    .map(compileEffectType)
  const angleNode = childByTag(emitterNode, 'EmissionAngleController')
  const emissionAngle = angleNode
    ? parseTrack(nodeText(angleNode))
    : constantTrack(DEFAULT_EMISSION_ANGLE_DEG)
  const durationMs = Math.max(
    DEFAULT_DURATION_MS,
    lastKeyTime(emissionAngle),
    ...effectTypes.map((et) => Math.max(lastKeyTime(et.number), lastKeyTime(et.life)))
  )
  return {
    name: emitter.name,
    shape: parseShape(emitterNode),
    emissionAngle,
    durationMs,
    effectTypes
  }
}

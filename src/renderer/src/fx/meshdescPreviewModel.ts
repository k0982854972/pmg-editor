/**
 * Pure helpers behind the meshdesc binding live preview (no three.js).
 * Tested in tests/fxui/meshdescPreviewModel.test.ts.
 *
 * Anchor semantics (documented approximation — the real engine attaches
 * effects to animated skeleton bones, which the editor does not simulate):
 * - The anchor of an Effect row is the world translation of the FIRST PMG
 *   mesh whose headerInfo boneName or jointName equals the row's `parent`
 *   case-insensitively (PMG files store names lowercase, meshdesc uses
 *   mixed case like "HandtoolR"). Translation is read from the mesh's
 *   row-major matrix2 (indices 3/7/11), i.e. the bind pose.
 * - `slot` N > 0 refines the anchor: PMG files ship tiny placeholder meshes
 *   named "<basename>_<bone>+<N>_<suffix>_" (e.g.
 *   "e_twohandweapon01_handtoolr+2_r_") on the same bone; the socket
 *   position is the mesh's local vertex centroid transformed by its
 *   row-major matrix2 (p' = M*p, same convention as core/export/obj.ts).
 *   A missing "+N" mesh falls back to the base anchor with
 *   isSlotResolved = false so the UI can warn.
 * - The row's `offset` shares the PMG unit scale (effect Size/offset values
 *   are the same magnitude as PMG extents in the corpus) and is added to
 *   the anchor unscaled; the meshdesc scene renders particles in the same
 *   native units.
 * - An unresolved parent anchors at the origin (isResolved = false) so the
 *   effect still previews somewhere visible.
 */
import type { EffectDocument } from '../../../core/fx/effectXml'
import { emitterDisplayName } from '../../../core/fx/effectXml'
import type { Vec3 } from '../../../core/fx/meshdesc'
import { readMatrix, readVertex } from '../../../core/pmg/access'
import type { PmgFile, PmMesh } from '../../../core/pmg/types'

/** Tool bones that commonly appear as meshdesc parents (community casing). */
export const COMMON_TOOL_BONES: readonly string[] = [
  'HandToolR',
  'HandToolL',
  'BodyToolR',
  'BodyToolL',
  'BackTool',
  'Bip01'
]

export interface MeshAnchorSource {
  readonly boneName: string
  readonly jointName: string
  /** headerInfo meshName text — carries the "+<slot>" socket suffix. */
  readonly meshName: string
  /** 16 floats, row-major, translation at indices 3/7/11 (PMG matrix2). */
  readonly matrix: readonly number[]
  /** Local-space centroid of the mesh's vertices; null when it has none. */
  readonly centroid: Vec3 | null
}

export interface AnchorResolution {
  readonly position: Vec3
  readonly isResolved: boolean
  /** False only when slot > 0 and no "+<slot>" mesh exists on the bone. */
  readonly isSlotResolved: boolean
}

/** Quaternion as plain data so the helper stays pure and three-free. */
export interface RotationQuaternion {
  readonly x: number
  readonly y: number
  readonly z: number
  readonly w: number
}

const ORIGIN: Vec3 = { x: 0, y: 0, z: 0 }
const IDENTITY_QUATERNION: RotationQuaternion = { x: 0, y: 0, z: 0, w: 1 }
const DEGREES_TO_RADIANS = Math.PI / 180

/**
 * Datalist candidates for the 骨骼 (parent) field: distinct PMG bone/joint
 * names first (original casing), then the common tool bones, deduped
 * case-insensitively (first occurrence wins).
 */
export function buildBoneCandidates(pmgBoneNames: readonly string[]): readonly string[] {
  const seen = new Set<string>()
  const candidates: string[] = []
  for (const name of [...pmgBoneNames, ...COMMON_TOOL_BONES]) {
    const trimmed = name.trim()
    const key = trimmed.toLowerCase()
    if (trimmed === '' || seen.has(key)) continue
    seen.add(key)
    candidates.push(trimmed)
  }
  return candidates
}

/** Distinct non-empty boneName/jointName texts of a PMG file, original casing. */
export function pmgBoneNamesOf(file: PmgFile): readonly string[] {
  const names: string[] = []
  for (const group of file.groups) {
    for (const mesh of group.meshes) {
      names.push(mesh.headerInfo.boneName.text, mesh.headerInfo.jointName.text)
    }
  }
  return names.filter((name) => name.trim() !== '')
}

/** Local-space centroid of a PMG mesh's vertices; null for empty meshes. */
function meshCentroidOf(mesh: PmMesh): Vec3 | null {
  const count = mesh.counts.vertexCount
  if (count <= 0) return null
  let x = 0
  let y = 0
  let z = 0
  for (let i = 0; i < count; i++) {
    const vertex = readVertex(mesh, i)
    x += vertex.x
    y += vertex.y
    z += vertex.z
  }
  return { x: x / count, y: y / count, z: z / count }
}

/** Anchor sources (names, matrix2 floats, centroid) for every PMG mesh. */
export function anchorSourcesOf(file: PmgFile): readonly MeshAnchorSource[] {
  return file.groups.flatMap((group) =>
    group.meshes.map((mesh) => ({
      boneName: mesh.headerInfo.boneName.text,
      jointName: mesh.headerInfo.jointName.text,
      meshName: mesh.headerInfo.meshName.text,
      matrix: readMatrix(mesh.matrix2),
      centroid: meshCentroidOf(mesh)
    }))
  )
}

const translationOf = (matrix: readonly number[]): Vec3 => ({
  x: matrix[3] ?? 0,
  y: matrix[7] ?? 0,
  z: matrix[11] ?? 0
})

/** p' = M*p with M row-major (same convention as core/export/obj.ts). */
const transformPoint = (matrix: readonly number[], p: Vec3): Vec3 => ({
  x: p.x * (matrix[0] ?? 0) + p.y * (matrix[1] ?? 0) + p.z * (matrix[2] ?? 0) + (matrix[3] ?? 0),
  y: p.x * (matrix[4] ?? 0) + p.y * (matrix[5] ?? 0) + p.z * (matrix[6] ?? 0) + (matrix[7] ?? 0),
  z: p.x * (matrix[8] ?? 0) + p.y * (matrix[9] ?? 0) + p.z * (matrix[10] ?? 0) + (matrix[11] ?? 0)
})

const boneMatches = (mesh: MeshAnchorSource, wanted: string): boolean =>
  mesh.boneName.trim().toLowerCase() === wanted || mesh.jointName.trim().toLowerCase() === wanted

/**
 * Anchor of a meshdesc parent bone. slot <= 0 is the base behavior: world
 * translation of the first mesh whose boneName or jointName equals `parent`
 * case-insensitively (origin when blank or not found). slot > 0 prefers the
 * mesh on the same bone whose meshName carries "+<slot>" (exact number, so
 * "+1" never matches "+17"); its anchor is the vertex centroid transformed
 * by its matrix2 (translation only when the mesh has no vertices). When no
 * "+<slot>" mesh exists the base anchor is returned with
 * isSlotResolved = false.
 */
export function resolveParentAnchor(
  meshes: readonly MeshAnchorSource[],
  parent: string,
  slot = 0
): AnchorResolution {
  const wanted = parent.trim().toLowerCase()
  if (wanted === '') return { position: ORIGIN, isResolved: false, isSlotResolved: false }
  const boneMeshes = meshes.filter((mesh) => boneMatches(mesh, wanted))
  const base = boneMeshes[0]
  if (!base) return { position: ORIGIN, isResolved: false, isSlotResolved: false }
  if (slot > 0) {
    const slotPattern = new RegExp(`\\+${slot}(?!\\d)`)
    const slotMesh = boneMeshes.find((mesh) => slotPattern.test(mesh.meshName))
    if (slotMesh) {
      const position = slotMesh.centroid
        ? transformPoint(slotMesh.matrix, slotMesh.centroid)
        : translationOf(slotMesh.matrix)
      return { position, isResolved: true, isSlotResolved: true }
    }
    return { position: translationOf(base.matrix), isResolved: true, isSlotResolved: false }
  }
  return { position: translationOf(base.matrix), isResolved: true, isSlotResolved: true }
}

/** Parent/slot anchor plus the row offset (native units — no scale factor). */
export function effectAnchorWorld(
  meshes: readonly MeshAnchorSource[],
  effect: { readonly parent: string; readonly slot?: number; readonly offset: Vec3 }
): AnchorResolution {
  const anchor = resolveParentAnchor(meshes, effect.parent, effect.slot ?? 0)
  return {
    isResolved: anchor.isResolved,
    isSlotResolved: anchor.isSlotResolved,
    position: {
      x: anchor.position.x + effect.offset.x,
      y: anchor.position.y + effect.offset.y,
      z: anchor.position.z + effect.offset.z
    }
  }
}

/**
 * rot_axis/rot_angle (degrees) -> unit quaternion (axis-angle). A zero or
 * non-finite axis, or a zero/non-finite angle, yields the identity.
 */
export function effectRotationQuaternion(
  rotAxis: Vec3,
  rotAngleDegrees: number
): RotationQuaternion {
  const length = Math.hypot(rotAxis.x, rotAxis.y, rotAxis.z)
  if (!Number.isFinite(length) || length === 0) return IDENTITY_QUATERNION
  if (!Number.isFinite(rotAngleDegrees) || rotAngleDegrees === 0) return IDENTITY_QUATERNION
  const half = (rotAngleDegrees * DEGREES_TO_RADIANS) / 2
  const s = Math.sin(half) / length
  return { x: rotAxis.x * s, y: rotAxis.y * s, z: rotAxis.z * s, w: Math.cos(half) }
}

/**
 * Index of the emitter whose display name equals `effectName` — exact match
 * preferred, case-insensitive fallback; null when blank or not found.
 */
export function resolveEmitterIndex(doc: EffectDocument, effectName: string): number | null {
  const wanted = effectName.trim()
  if (wanted === '') return null
  const names = doc.emitters.map((emitter) => emitterDisplayName(emitter.node))
  const exact = names.findIndex((name) => name === wanted)
  if (exact !== -1) return exact
  const lower = wanted.toLowerCase()
  const relaxed = names.findIndex((name) => name.toLowerCase() === lower)
  return relaxed !== -1 ? relaxed : null
}

/** Distinct emitter display names of an effect document (datalist options). */
export function emitterNamesOf(doc: EffectDocument): readonly string[] {
  return [...new Set(doc.emitters.map((emitter) => emitterDisplayName(emitter.node)))]
}

export interface EmitterAcrossResolution {
  readonly sourceIndex: number
  readonly emitterIndex: number
}

/**
 * Resolves an effect_name against multiple effect sources: the first
 * source (in slot order) containing the emitter wins. Null when no source
 * resolves the name.
 */
export function resolveEmitterAcross(
  sources: readonly EffectDocument[],
  effectName: string
): EmitterAcrossResolution | null {
  for (let sourceIndex = 0; sourceIndex < sources.length; sourceIndex++) {
    const emitterIndex = resolveEmitterIndex(sources[sourceIndex], effectName)
    if (emitterIndex !== null) return { sourceIndex, emitterIndex }
  }
  return null
}

/**
 * Emitter display names merged across all sources in slot order, deduped
 * case-insensitively (first occurrence wins) — combobox suggestions.
 */
export function mergedEmitterNames(sources: readonly EffectDocument[]): readonly string[] {
  const seen = new Set<string>()
  const names: string[] = []
  for (const source of sources) {
    for (const name of emitterNamesOf(source)) {
      const key = name.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      names.push(name)
    }
  }
  return names
}

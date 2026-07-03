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
import { readMatrix } from '../../../core/pmg/access'
import type { PmgFile } from '../../../core/pmg/types'

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
  /** 16 floats, row-major, translation at indices 3/7/11 (PMG matrix2). */
  readonly matrix: readonly number[]
}

export interface AnchorResolution {
  readonly position: Vec3
  readonly isResolved: boolean
}

const ORIGIN: Vec3 = { x: 0, y: 0, z: 0 }

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

/** Anchor sources (names + matrix2 floats) for every mesh of a PMG file. */
export function anchorSourcesOf(file: PmgFile): readonly MeshAnchorSource[] {
  return file.groups.flatMap((group) =>
    group.meshes.map((mesh) => ({
      boneName: mesh.headerInfo.boneName.text,
      jointName: mesh.headerInfo.jointName.text,
      matrix: readMatrix(mesh.matrix2)
    }))
  )
}

/**
 * World translation of the first mesh whose boneName or jointName equals
 * `parent` case-insensitively; origin when blank or not found.
 */
export function resolveParentAnchor(
  meshes: readonly MeshAnchorSource[],
  parent: string
): AnchorResolution {
  const wanted = parent.trim().toLowerCase()
  if (wanted === '') return { position: ORIGIN, isResolved: false }
  for (const mesh of meshes) {
    const matches =
      mesh.boneName.trim().toLowerCase() === wanted ||
      mesh.jointName.trim().toLowerCase() === wanted
    if (!matches) continue
    const { matrix } = mesh
    return {
      position: { x: matrix[3] ?? 0, y: matrix[7] ?? 0, z: matrix[11] ?? 0 },
      isResolved: true
    }
  }
  return { position: ORIGIN, isResolved: false }
}

/** Parent anchor plus the row offset (native units — no scale factor). */
export function effectAnchorWorld(
  meshes: readonly MeshAnchorSource[],
  effect: { readonly parent: string; readonly offset: Vec3 }
): AnchorResolution {
  const anchor = resolveParentAnchor(meshes, effect.parent)
  return {
    isResolved: anchor.isResolved,
    position: {
      x: anchor.position.x + effect.offset.x,
      y: anchor.position.y + effect.offset.y,
      z: anchor.position.z + effect.offset.z
    }
  }
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

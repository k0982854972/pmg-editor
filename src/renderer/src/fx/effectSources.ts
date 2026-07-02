/**
 * Pure logic behind the multi effect-source slots of the meshdesc binding
 * tab: the slot cap, extraction of referenced effect_names from a meshdesc
 * document, and the auto-load planner that maps unresolved names through
 * the main-process emitter index to the effect XML files to open.
 * Consumed by AttachmentPanel via useEffectSources; specified in
 * tests/fxui/effectSources.test.ts.
 */

/** Maximum number of simultaneously loaded effect-source XML files. */
export const MAX_EFFECT_SOURCES = 5

/** Minimal structural view of a meshdesc document (see core/fx/meshdesc). */
export interface MeshdescEffectNamesView {
  readonly groups: readonly {
    readonly effects: readonly { readonly effectName: string }[]
  }[]
}

/**
 * Distinct non-blank effect_name values across all groups, deduped
 * case-insensitively (first casing wins), in document order.
 */
export function collectReferencedEffectNames(doc: MeshdescEffectNamesView): readonly string[] {
  const seen = new Set<string>()
  const names: string[] = []
  for (const group of doc.groups) {
    for (const effect of group.effects) {
      const trimmed = effect.effectName.trim()
      const key = trimmed.toLowerCase()
      if (trimmed === '' || seen.has(key)) continue
      seen.add(key)
      names.push(trimmed)
    }
  }
  return names
}

export interface AutoLoadPlanInput {
  /** effect_name values referenced by the opened meshdesc. */
  readonly referencedNames: readonly string[]
  /** Lowercased emitter names already resolvable from loaded sources. */
  readonly resolvableNames: ReadonlySet<string>
  /** Paths of already-loaded effect sources (never re-opened). */
  readonly loadedPaths: readonly string[]
  /** Emitter index: lowercased emitter name -> absolute effect XML path. */
  readonly indexEntries: Readonly<Record<string, string>>
  /** Remaining source slots (5 minus loaded sources). */
  readonly freeSlots: number
}

export interface AutoLoadPlan {
  /** Files to load, most-referenced first, truncated to the free slots. */
  readonly paths: readonly string[]
  /** Referenced names with no definition in the index. */
  readonly missingNames: readonly string[]
  /** True when more files were needed than free slots allowed. */
  readonly isTruncated: boolean
}

/** Plans which effect XML files to auto-load for an opened meshdesc. */
export function planEffectSourceAutoLoad(input: AutoLoadPlanInput): AutoLoadPlan {
  const loadedPathKeys = new Set(input.loadedPaths.map((path) => path.toLowerCase()))
  const referenceCounts = new Map<string, number>()
  const missingNames: string[] = []

  for (const name of input.referencedNames) {
    const key = name.trim().toLowerCase()
    if (key === '' || input.resolvableNames.has(key)) continue
    const path = input.indexEntries[key]
    if (path === undefined) {
      missingNames.push(name)
      continue
    }
    if (loadedPathKeys.has(path.toLowerCase())) continue
    referenceCounts.set(path, (referenceCounts.get(path) ?? 0) + 1)
  }

  const rankedPaths = [...referenceCounts.entries()]
    .sort((left, right) => right[1] - left[1])
    .map(([path]) => path)
  const freeSlots = Math.max(0, input.freeSlots)
  return {
    paths: rankedPaths.slice(0, freeSlots),
    missingNames,
    isTruncated: rankedPaths.length > freeSlots
  }
}

/**
 * Pure helpers for tolerant FX texture resolution (no fs/electron imports
 * so they stay unit-testable): the ordered list of directories to search
 * under a user-provided data root, and case-insensitive filename matching
 * against a directory listing. Consumed by src/main/textureIpc.ts;
 * specified in tests/main/textureSearch.test.ts.
 */
import { join } from 'path'

/**
 * Ordered, case-insensitively deduped directory candidates for a texture:
 * `<root>/material/fx` and its subdirs (real fx textures nest one level,
 * e.g. material/fx/effect/common_effect.dds), `<root>/material`,
 * `<root>/fx` and its subdirs (covers roots pointing at data/material),
 * `<root>`, then one-level subdirs of `<root>/material` and of `<root>`.
 */
export function orderedTextureDirs(
  dataRoot: string,
  materialSubdirNames: readonly string[],
  rootSubdirNames: readonly string[],
  materialFxSubdirNames: readonly string[] = [],
  rootFxSubdirNames: readonly string[] = []
): string[] {
  const materialDir = join(dataRoot, 'material')
  const materialFxDir = join(materialDir, 'fx')
  const rootFxDir = join(dataRoot, 'fx')
  const candidates = [
    materialFxDir,
    ...materialFxSubdirNames.map((name) => join(materialFxDir, name)),
    materialDir,
    rootFxDir,
    ...rootFxSubdirNames.map((name) => join(rootFxDir, name)),
    dataRoot,
    ...materialSubdirNames.map((name) => join(materialDir, name)),
    ...rootSubdirNames.map((name) => join(dataRoot, name))
  ]
  const seen = new Set<string>()
  return candidates.filter((dir) => {
    const key = dir.toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/**
 * First directory entry whose lowercased name equals the lowercased target
 * file name (XML texture names do not reliably match file name casing).
 */
export function matchFileNameCaseInsensitive(
  entries: readonly string[],
  fileName: string
): string | null {
  const target = fileName.toLowerCase()
  return entries.find((entry) => entry.toLowerCase() === target) ?? null
}

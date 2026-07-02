/**
 * Pure helpers for user-resizable panel widths: clamping plus best-effort
 * localStorage persistence. Used by ResizeHandle/usePersistedPanelWidth for
 * the FX emitter-tree and preview columns.
 */

/** Clamp a candidate width (px) into [minWidth, maxWidth], rounding to whole px. */
export function clampPanelWidth(value: number, minWidth: number, maxWidth: number): number {
  if (!Number.isFinite(value)) return minWidth
  return Math.min(maxWidth, Math.max(minWidth, Math.round(value)))
}

/** Read a persisted width; falls back (and clamps) on missing/invalid values. */
export function readStoredPanelWidth(
  storageKey: string,
  fallback: number,
  minWidth: number,
  maxWidth: number
): number {
  try {
    const raw = globalThis.localStorage?.getItem(storageKey)
    if (raw === null || raw === undefined || raw === '') {
      return clampPanelWidth(fallback, minWidth, maxWidth)
    }
    const parsed = Number(raw)
    if (!Number.isFinite(parsed)) return clampPanelWidth(fallback, minWidth, maxWidth)
    return clampPanelWidth(parsed, minWidth, maxWidth)
  } catch {
    return clampPanelWidth(fallback, minWidth, maxWidth)
  }
}

/** Persist a width; storage failures are ignored (in-memory value still applies). */
export function storePanelWidth(storageKey: string, width: number): void {
  try {
    globalThis.localStorage?.setItem(storageKey, String(width))
  } catch {
    // Best-effort persistence only.
  }
}

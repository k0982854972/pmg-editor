/**
 * Panel-width state hook: restores the width from localStorage on mount and
 * persists every (clamped) change. Kept separate from ResizeHandle.tsx so
 * that component file only exports components (react-refresh rule).
 */
import { useState } from 'react'
import { clampPanelWidth, readStoredPanelWidth, storePanelWidth } from './panelWidth'

export function usePersistedPanelWidth(
  storageKey: string,
  defaultWidth: number,
  minWidth: number,
  maxWidth: number
): readonly [number, (width: number) => void] {
  const [width, setWidth] = useState(() =>
    readStoredPanelWidth(storageKey, defaultWidth, minWidth, maxWidth)
  )
  const update = (next: number): void => {
    const clamped = clampPanelWidth(next, minWidth, maxWidth)
    setWidth(clamped)
    storePanelWidth(storageKey, clamped)
  }
  return [width, update]
}

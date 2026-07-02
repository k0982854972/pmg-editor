import { describe, expect, test } from 'vitest'
import {
  clampPanelWidth,
  readStoredPanelWidth,
  storePanelWidth
} from '../../src/renderer/src/components/panelWidth'

describe('clampPanelWidth', () => {
  test('keeps in-range values and rounds to whole pixels', () => {
    expect(clampPanelWidth(320, 200, 560)).toBe(320)
    expect(clampPanelWidth(320.6, 200, 560)).toBe(321)
  })

  test('clamps below minimum to the minimum', () => {
    expect(clampPanelWidth(50, 200, 560)).toBe(200)
  })

  test('clamps above maximum to the maximum', () => {
    expect(clampPanelWidth(9000, 200, 560)).toBe(560)
  })

  test('falls back to the minimum for non-finite input', () => {
    expect(clampPanelWidth(Number.NaN, 200, 560)).toBe(200)
    expect(clampPanelWidth(Number.POSITIVE_INFINITY, 200, 560)).toBe(200)
  })
})

describe('readStoredPanelWidth / storePanelWidth (no localStorage in node)', () => {
  test('returns the clamped fallback when localStorage is unavailable', () => {
    expect(readStoredPanelWidth('ui.fxTreeWidth', 320, 200, 560)).toBe(320)
    expect(readStoredPanelWidth('ui.fxTreeWidth', 50, 200, 560)).toBe(200)
  })

  test('storePanelWidth does not throw when localStorage is unavailable', () => {
    expect(() => storePanelWidth('ui.fxTreeWidth', 320)).not.toThrow()
  })
})

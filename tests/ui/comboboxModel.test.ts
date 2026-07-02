import { describe, expect, test } from 'vitest'
import {
  filterComboboxOptions,
  moveActiveIndex
} from '../../src/renderer/src/components/comboboxModel'

const OPTIONS = ['flame_small', 'Flame_Big', 'smoke_puff', 'spark'] as const

describe('filterComboboxOptions', () => {
  test('returns all options for an empty query', () => {
    expect(filterComboboxOptions(OPTIONS, '')).toEqual(OPTIONS)
    expect(filterComboboxOptions(OPTIONS, '   ')).toEqual(OPTIONS)
  })

  test('filters by case-insensitive substring', () => {
    expect(filterComboboxOptions(OPTIONS, 'FLAME')).toEqual(['flame_small', 'Flame_Big'])
    expect(filterComboboxOptions(OPTIONS, 'puff')).toEqual(['smoke_puff'])
  })

  test('returns empty array when nothing matches', () => {
    expect(filterComboboxOptions(OPTIONS, 'laser')).toEqual([])
  })
})

describe('moveActiveIndex', () => {
  test('returns -1 when there are no options', () => {
    expect(moveActiveIndex(0, -1, 1)).toBe(-1)
    expect(moveActiveIndex(0, 2, -1)).toBe(-1)
  })

  test('starts at first on ArrowDown and last on ArrowUp when nothing is active', () => {
    expect(moveActiveIndex(4, -1, 1)).toBe(0)
    expect(moveActiveIndex(4, -1, -1)).toBe(3)
  })

  test('steps and wraps around both ends', () => {
    expect(moveActiveIndex(4, 0, 1)).toBe(1)
    expect(moveActiveIndex(4, 3, 1)).toBe(0)
    expect(moveActiveIndex(4, 0, -1)).toBe(3)
  })

  test('recovers from a stale out-of-range index', () => {
    expect(moveActiveIndex(2, 5, 1)).toBe(0)
  })
})

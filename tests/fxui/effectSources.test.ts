/**
 * effectSources spec: pure logic behind the multi effect-source slots and
 * the auto-load-on-meshdesc-open planner.
 * - collectReferencedEffectNames: distinct non-blank effect_name values of
 *   a meshdesc document, first casing wins, deduped case-insensitively.
 * - planEffectSourceAutoLoad: maps unresolved names through the emitter
 *   index to files, skips already-loaded paths, orders by reference count,
 *   truncates to the free slots and reports missing names.
 */
import { describe, expect, it } from 'vitest'
import {
  collectReferencedEffectNames,
  MAX_EFFECT_SOURCES,
  partitionSourcesByUsefulness,
  planEffectSourceAutoLoad
} from '../../src/renderer/src/fx/effectSources'

const docWith = (...effectNames: string[]): Parameters<typeof collectReferencedEffectNames>[0] => ({
  groups: [{ effects: effectNames.map((effectName) => ({ effectName })) }]
})

describe('collectReferencedEffectNames', () => {
  it('collects distinct names across groups, first casing wins', () => {
    const doc = {
      groups: [
        { effects: [{ effectName: 'Dark_Wind01' }, { effectName: 'aura01' }] },
        { effects: [{ effectName: 'dark_wind01' }] }
      ]
    }
    expect(collectReferencedEffectNames(doc)).toEqual(['Dark_Wind01', 'aura01'])
  })

  it('drops blank names', () => {
    expect(collectReferencedEffectNames(docWith('', '  ', 'fx1'))).toEqual(['fx1'])
  })
})

describe('partitionSourcesByUsefulness', () => {
  const source = (path: string, ...names: string[]): { path: string; names: Set<string> } => ({
    path,
    names: new Set(names)
  })

  it('keeps sources that resolve at least one referenced name, evicts the rest', () => {
    const { useful, unused } = partitionSourcesByUsefulness(
      [source('/a.xml', 'fire01'), source('/b.xml', 'old_glow'), source('/c.xml', 'ice01')],
      ['Fire01', 'ice01', 'missing01']
    )
    expect(useful.map((s) => s.path)).toEqual(['/a.xml', '/c.xml'])
    expect(unused.map((s) => s.path)).toEqual(['/b.xml'])
  })

  it('matches names case-insensitively and handles empty inputs', () => {
    expect(partitionSourcesByUsefulness([], ['x'])).toEqual({ useful: [], unused: [] })
    const { useful, unused } = partitionSourcesByUsefulness([source('/a.xml', 'FX1')], [])
    expect(useful).toEqual([])
    expect(unused.map((s) => s.path)).toEqual(['/a.xml'])
  })
})

describe('planEffectSourceAutoLoad', () => {
  const entries = {
    dark_wind01: '/fx/dark.xml',
    dark_grow01: '/fx/dark.xml',
    aura01: '/fx/aura.xml',
    ice01: '/fx/ice.xml'
  }
  const base = {
    resolvableNames: new Set<string>(),
    loadedPaths: [] as readonly string[],
    indexEntries: entries,
    freeSlots: MAX_EFFECT_SOURCES
  }

  it('exposes the 5-slot cap', () => {
    expect(MAX_EFFECT_SOURCES).toBe(5)
  })

  it('maps unresolved names to deduped file paths, most-referenced first', () => {
    const plan = planEffectSourceAutoLoad({
      ...base,
      referencedNames: ['aura01', 'dark_wind01', 'dark_grow01']
    })
    expect(plan.paths).toEqual(['/fx/dark.xml', '/fx/aura.xml'])
    expect(plan.missingNames).toEqual([])
    expect(plan.isTruncated).toBe(false)
  })

  it('looks names up case-insensitively', () => {
    const plan = planEffectSourceAutoLoad({ ...base, referencedNames: ['AURA01'] })
    expect(plan.paths).toEqual(['/fx/aura.xml'])
  })

  it('skips names already resolvable from loaded sources', () => {
    const plan = planEffectSourceAutoLoad({
      ...base,
      referencedNames: ['aura01', 'ice01'],
      resolvableNames: new Set(['aura01'])
    })
    expect(plan.paths).toEqual(['/fx/ice.xml'])
  })

  it('skips paths that are already loaded and reports missing names', () => {
    const plan = planEffectSourceAutoLoad({
      ...base,
      referencedNames: ['dark_wind01', 'no_such_fx'],
      loadedPaths: ['/fx/dark.xml']
    })
    expect(plan.paths).toEqual([])
    expect(plan.missingNames).toEqual(['no_such_fx'])
  })

  it('truncates to the free slots and flags truncation', () => {
    const plan = planEffectSourceAutoLoad({
      ...base,
      referencedNames: ['dark_wind01', 'dark_grow01', 'aura01', 'ice01'],
      freeSlots: 1
    })
    expect(plan.paths).toEqual(['/fx/dark.xml'])
    expect(plan.isTruncated).toBe(true)
  })

  it('flags truncation even with zero free slots', () => {
    const plan = planEffectSourceAutoLoad({ ...base, referencedNames: ['aura01'], freeSlots: 0 })
    expect(plan.paths).toEqual([])
    expect(plan.isTruncated).toBe(true)
  })
})

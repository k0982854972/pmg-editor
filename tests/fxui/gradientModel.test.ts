/**
 * gradientModel spec: pure helpers backing GradientEditor — CSS preview
 * string, sorted stop edits, midpoint-interpolated insertion, RGB hex
 * conversion for <input type="color">.
 */
import { describe, expect, it } from 'vitest'
import type { ColorKeyframe } from '../../src/core/fx/colorOverLife'
import {
  addMidpointStop,
  buildGradientCss,
  removeStop,
  replaceStop,
  rgbHexOf,
  withRgbHex
} from '../../src/renderer/src/fx/gradientModel'

const stop = (time: number, a: number, r: number, g: number, b: number): ColorKeyframe => ({
  time,
  a,
  r,
  g,
  b
})

describe('buildGradientCss', () => {
  it('maps keyframes to rgba stops at time*100%', () => {
    const css = buildGradientCss([stop(0, 0, 255, 255, 192), stop(1, 255, 0, 0, 0)])
    expect(css).toBe('linear-gradient(to right, rgba(255, 255, 192, 0) 0%, rgba(0, 0, 0, 1) 100%)')
  })

  it('rounds fractional alpha and clamps time into 0..1', () => {
    const css = buildGradientCss([stop(-0.5, 128, 10, 20, 30), stop(1.5, 255, 1, 2, 3)])
    expect(css).toBe('linear-gradient(to right, rgba(10, 20, 30, 0.502) 0%, rgba(1, 2, 3, 1) 100%)')
  })

  it('duplicates a single stop across the whole strip', () => {
    const css = buildGradientCss([stop(0.4, 255, 9, 9, 9)])
    expect(css).toBe('linear-gradient(to right, rgba(9, 9, 9, 1) 0%, rgba(9, 9, 9, 1) 100%)')
  })

  it('renders fully transparent for an empty list', () => {
    expect(buildGradientCss([])).toBe(
      'linear-gradient(to right, rgba(0, 0, 0, 0) 0%, rgba(0, 0, 0, 0) 100%)'
    )
  })
})

describe('replaceStop', () => {
  it('applies a patch and keeps the list sorted by time', () => {
    const frames = [stop(0, 255, 0, 0, 0), stop(0.5, 255, 5, 5, 5), stop(1, 255, 9, 9, 9)]
    const next = replaceStop(frames, 0, { time: 0.8 })
    expect(next.map((f) => f.time)).toEqual([0.5, 0.8, 1])
    expect(next[1].r).toBe(0)
    // Original untouched.
    expect(frames[0].time).toBe(0)
  })
})

describe('removeStop', () => {
  it('removes the stop at the given index immutably', () => {
    const frames = [stop(0, 255, 0, 0, 0), stop(1, 255, 9, 9, 9)]
    const next = removeStop(frames, 0)
    expect(next).toEqual([stop(1, 255, 9, 9, 9)])
    expect(frames).toHaveLength(2)
  })
})

describe('addMidpointStop', () => {
  it('inserts an interpolated stop in the middle of the largest gap', () => {
    const frames = [stop(0, 0, 0, 0, 0), stop(0.2, 100, 20, 40, 60), stop(1, 200, 100, 200, 40)]
    const next = addMidpointStop(frames)
    expect(next.map((f) => f.time)).toEqual([0, 0.2, 0.6, 1])
    expect(next[2]).toEqual(stop(0.6, 150, 60, 120, 50))
  })

  it('creates an opaque white stop for an empty list', () => {
    expect(addMidpointStop([])).toEqual([stop(0, 255, 255, 255, 255)])
  })

  it('extends a single stop toward the free end of the strip', () => {
    expect(addMidpointStop([stop(0.3, 255, 1, 2, 3)])).toEqual([
      stop(0.3, 255, 1, 2, 3),
      stop(1, 255, 1, 2, 3)
    ])
    expect(addMidpointStop([stop(1, 255, 1, 2, 3)])).toEqual([
      stop(0, 255, 1, 2, 3),
      stop(1, 255, 1, 2, 3)
    ])
  })
})

describe('rgb hex conversion', () => {
  it('formats RGB channels as a #rrggbb string', () => {
    expect(rgbHexOf(stop(0, 255, 255, 128, 0))).toBe('#ff8000')
  })

  it('parses a #rrggbb string back into the keyframe, keeping time and alpha', () => {
    const next = withRgbHex(stop(0.5, 42, 0, 0, 0), '#ff8000')
    expect(next).toEqual(stop(0.5, 42, 255, 128, 0))
  })
})

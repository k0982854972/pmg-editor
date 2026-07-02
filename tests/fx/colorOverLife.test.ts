/**
 * ColorOverLife keyframe text spec: whitespace-separated `time AARRGGBB`
 * pairs, formatted back with uppercase 8-digit hex and minimal time text.
 */
import { describe, expect, it } from 'vitest'
import { formatColorKeyframes, parseColorKeyframes } from '../../src/core/fx/colorOverLife'

const SAMPLE = '0 00FFFFC0 0.15 FFFF8080 0.8 80602040 1 00000000'

describe('parseColorKeyframes', () => {
  it('parses time AARRGGBB pairs', () => {
    const frames = parseColorKeyframes(SAMPLE)
    expect(frames).toHaveLength(4)
    expect(frames[0]).toEqual({ time: 0, a: 0x00, r: 0xff, g: 0xff, b: 0xc0 })
    expect(frames[1]).toEqual({ time: 0.15, a: 0xff, r: 0xff, g: 0x80, b: 0x80 })
    expect(frames.map((f) => f.time)).toEqual([0, 0.15, 0.8, 1])
  })

  it('accepts lowercase hex and irregular whitespace', () => {
    const frames = parseColorKeyframes('  0\t00ffffc0\n 1  ffFF8080 ')
    expect(frames).toHaveLength(2)
    expect(frames[0].b).toBe(0xc0)
  })

  it('returns an empty array for blank text', () => {
    expect(parseColorKeyframes('')).toEqual([])
    expect(parseColorKeyframes('   ')).toEqual([])
  })

  it('throws on an odd token count', () => {
    expect(() => parseColorKeyframes('0 00FFFFC0 0.5')).toThrow(/odd|pair/i)
  })

  it('throws on malformed hex', () => {
    expect(() => parseColorKeyframes('0 00FFZZC0')).toThrow(/hex|color/i)
    expect(() => parseColorKeyframes('0 FFF')).toThrow(/hex|color/i)
  })

  it('throws on a non-numeric time', () => {
    expect(() => parseColorKeyframes('abc 00FFFFC0')).toThrow(/time/i)
  })
})

describe('formatColorKeyframes', () => {
  it('round-trips the sample text exactly', () => {
    expect(formatColorKeyframes(parseColorKeyframes(SAMPLE))).toBe(SAMPLE)
  })

  it('writes uppercase 8-digit hex without trailing time zeros', () => {
    expect(
      formatColorKeyframes([
        { time: 0.5, a: 1, r: 2, g: 0xab, b: 0xcd },
        { time: 1, a: 0, r: 0, g: 0, b: 0 }
      ])
    ).toBe('0.5 0102ABCD 1 00000000')
  })

  it('formats an empty list as an empty string', () => {
    expect(formatColorKeyframes([])).toBe('')
  })
})

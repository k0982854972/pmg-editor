/**
 * Pure helpers behind GradientEditor: CSS preview string, sorted stop
 * edits, midpoint-interpolated insertion, and RGB hex conversion for
 * <input type="color">. Tested in tests/fxui/gradientModel.test.ts.
 */
import type { ColorKeyframe } from '../../../core/fx/colorOverLife'

const MAX_BYTE = 255
const round3 = (n: number): number => Math.round(n * 1000) / 1000
const clamp01 = (n: number): number => Math.min(1, Math.max(0, n))

const cssStop = (frame: ColorKeyframe, timeOverride?: number): string => {
  const time = clamp01(timeOverride ?? frame.time)
  const alpha = round3(frame.a / MAX_BYTE)
  return `rgba(${frame.r}, ${frame.g}, ${frame.b}, ${alpha}) ${round3(time * 100)}%`
}

const TRANSPARENT: ColorKeyframe = { time: 0, a: 0, r: 0, g: 0, b: 0 }
const OPAQUE_WHITE: ColorKeyframe = { time: 0, a: MAX_BYTE, r: MAX_BYTE, g: MAX_BYTE, b: MAX_BYTE }

export const sortStops = (frames: readonly ColorKeyframe[]): ColorKeyframe[] =>
  [...frames].sort((a, b) => a.time - b.time)

/** linear-gradient(...) preview string; degenerate lists get padded stops. */
export function buildGradientCss(frames: readonly ColorKeyframe[]): string {
  const sorted = sortStops(frames)
  const stops =
    sorted.length === 0
      ? [cssStop(TRANSPARENT, 0), cssStop(TRANSPARENT, 1)]
      : sorted.length === 1
        ? [cssStop(sorted[0], 0), cssStop(sorted[0], 1)]
        : sorted.map((frame) => cssStop(frame))
  return `linear-gradient(to right, ${stops.join(', ')})`
}

/** Patch the stop at index, returning a new time-sorted list. */
export function replaceStop(
  frames: readonly ColorKeyframe[],
  index: number,
  patch: Partial<ColorKeyframe>
): ColorKeyframe[] {
  return sortStops(frames.map((frame, i) => (i === index ? { ...frame, ...patch } : frame)))
}

export function removeStop(frames: readonly ColorKeyframe[], index: number): ColorKeyframe[] {
  return frames.filter((_, i) => i !== index)
}

const lerpByte = (a: number, b: number): number => Math.round((a + b) / 2)

/** Insert an interpolated stop in the middle of the largest time gap. */
export function addMidpointStop(frames: readonly ColorKeyframe[]): ColorKeyframe[] {
  if (frames.length === 0) return [OPAQUE_WHITE]
  const sorted = sortStops(frames)
  if (sorted.length === 1) {
    const only = sorted[0]
    const time = only.time < 1 ? 1 : 0
    return sortStops([only, { ...only, time }])
  }
  let gapIndex = 0
  for (let i = 1; i < sorted.length - 1; i += 1) {
    const gap = sorted[i + 1].time - sorted[i].time
    if (gap > sorted[gapIndex + 1].time - sorted[gapIndex].time) gapIndex = i
  }
  const before = sorted[gapIndex]
  const after = sorted[gapIndex + 1]
  const midpoint: ColorKeyframe = {
    time: round3((before.time + after.time) / 2),
    a: lerpByte(before.a, after.a),
    r: lerpByte(before.r, after.r),
    g: lerpByte(before.g, after.g),
    b: lerpByte(before.b, after.b)
  }
  return sortStops([...sorted, midpoint])
}

const byteHex = (n: number): string => n.toString(16).padStart(2, '0')

/** RGB channels as '#rrggbb' for <input type="color">. */
export const rgbHexOf = (frame: ColorKeyframe): string =>
  `#${byteHex(frame.r)}${byteHex(frame.g)}${byteHex(frame.b)}`

/** Apply a '#rrggbb' value onto a keyframe, keeping time and alpha. */
export function withRgbHex(frame: ColorKeyframe, hex: string): ColorKeyframe {
  const match = /^#([0-9a-fA-F]{6})$/.exec(hex)
  if (!match) throw new Error(`gradientModel: invalid color "${hex}"; expected #rrggbb`)
  const value = parseInt(match[1], 16)
  return { ...frame, r: (value >> 16) & 0xff, g: (value >> 8) & 0xff, b: value & 0xff }
}

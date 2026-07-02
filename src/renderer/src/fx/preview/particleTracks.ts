/**
 * Track/color primitives shared by the FX preview compiler and simulation:
 * whitespace-separated `time value` keyframe parsing, clamped linear
 * sampling, ColorOverLife interpolation and a deterministic seeded rng.
 * Re-exported through particleModel.ts.
 */
import type { ColorKeyframe } from '../../../../core/fx/colorOverLife'

export interface TrackPoint {
  readonly time: number
  readonly value: number
}

export type Track = readonly TrackPoint[]

export interface Rgba {
  readonly r: number
  readonly g: number
  readonly b: number
  readonly a: number
}

/** Mulberry32: small deterministic rng for reproducible previews/tests. */
export function createSeededRng(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function parseTrack(text: string): Track {
  const tokens = text.trim().split(/\s+/).filter(Boolean)
  const points: TrackPoint[] = []
  for (let i = 0; i + 1 < tokens.length; i += 2) {
    const time = Number(tokens[i])
    const value = Number(tokens[i + 1])
    if (Number.isFinite(time) && Number.isFinite(value)) points.push({ time, value })
  }
  return points
}

export function sampleTrack(track: Track, t: number, fallback: number): number {
  if (track.length === 0) return fallback
  if (t <= track[0].time) return track[0].value
  const last = track[track.length - 1]
  if (t >= last.time) return last.value
  for (let i = 1; i < track.length; i++) {
    const next = track[i]
    if (t > next.time) continue
    const previous = track[i - 1]
    const span = next.time - previous.time
    const frac = span > 0 ? (t - previous.time) / span : 0
    return previous.value + (next.value - previous.value) * frac
  }
  return last.value
}

export const frameToRgba = (frame: ColorKeyframe): Rgba => ({
  r: frame.r / 255,
  g: frame.g / 255,
  b: frame.b / 255,
  a: frame.a / 255
})

export function sampleColorFrames(frames: readonly ColorKeyframe[], t: number): Rgba {
  if (frames.length === 0) return { r: 1, g: 1, b: 1, a: 1 }
  if (t <= frames[0].time) return frameToRgba(frames[0])
  const last = frames[frames.length - 1]
  if (t >= last.time) return frameToRgba(last)
  for (let i = 1; i < frames.length; i++) {
    const next = frames[i]
    if (t > next.time) continue
    const previous = frames[i - 1]
    const span = next.time - previous.time
    const frac = span > 0 ? (t - previous.time) / span : 0
    const a = frameToRgba(previous)
    const b = frameToRgba(next)
    return {
      r: a.r + (b.r - a.r) * frac,
      g: a.g + (b.g - a.g) * frac,
      b: a.b + (b.b - a.b) * frac,
      a: a.a + (b.a - a.a) * frac
    }
  }
  return frameToRgba(last)
}

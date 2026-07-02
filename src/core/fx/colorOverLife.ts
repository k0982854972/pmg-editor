/**
 * ColorOverLife controller text: whitespace-separated `time AARRGGBB`
 * keyframe pairs (e.g. "0 00FFFFC0 0.15 FFFF8080 1 00000000").
 */

export interface ColorKeyframe {
  readonly time: number
  readonly a: number
  readonly r: number
  readonly g: number
  readonly b: number
}

const HEX_COLOR = /^[0-9a-fA-F]{8}$/

export function parseColorKeyframes(text: string): ColorKeyframe[] {
  const tokens = text.trim().split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return []
  if (tokens.length % 2 !== 0) {
    throw new Error(
      `ColorOverLife: odd token count ${tokens.length}; expected time/color pairs`
    )
  }

  const frames: ColorKeyframe[] = []
  for (let i = 0; i < tokens.length; i += 2) {
    const time = Number(tokens[i])
    if (!Number.isFinite(time)) {
      throw new Error(`ColorOverLife: invalid time "${tokens[i]}" at pair ${i / 2}`)
    }
    const hex = tokens[i + 1]
    if (!HEX_COLOR.test(hex)) {
      throw new Error(
        `ColorOverLife: invalid color "${hex}" at pair ${i / 2}; expected 8 hex digits (AARRGGBB)`
      )
    }
    frames.push({
      time,
      a: parseInt(hex.slice(0, 2), 16),
      r: parseInt(hex.slice(2, 4), 16),
      g: parseInt(hex.slice(4, 6), 16),
      b: parseInt(hex.slice(6, 8), 16)
    })
  }
  return frames
}

const byte = (n: number): string => n.toString(16).toUpperCase().padStart(2, '0')

export function formatColorKeyframes(frames: readonly ColorKeyframe[]): string {
  return frames
    .map((f) => `${String(f.time)} ${byte(f.a)}${byte(f.r)}${byte(f.g)}${byte(f.b)}`)
    .join(' ')
}

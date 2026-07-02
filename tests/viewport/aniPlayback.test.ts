import { describe, expect, it } from 'vitest'
import { readAni } from '../../src/core/ani/reader'
import {
  buildPlayback,
  loopTimeMs,
  sampleTrack,
  type BoneTrack
} from '../../src/renderer/src/viewport/aniPlayback'
import { buildAniFixture, makeFrame } from '../ani/aniFixture'

const HALF_SQRT2 = Math.SQRT1_2

function trackOf(
  frames: Parameters<typeof buildAniFixture>[0]['bones'][number]['frames']
): BoneTrack {
  const file = readAni(buildAniFixture({ bones: [{ time: 1000, frames }] }))
  return buildPlayback(file).tracks[0]
}

describe('buildPlayback', () => {
  it('decodes one track per primary bone with the file duration', () => {
    const file = readAni(
      buildAniFixture({
        bones: [
          { time: 800, frames: [makeFrame({ time: 0 }), makeFrame({ time: 800 })] },
          { time: 1200, frames: [makeFrame({ time: 0, px: 3 })] }
        ]
      })
    )
    const playback = buildPlayback(file)
    expect(playback.tracks).toHaveLength(2)
    expect(playback.durationMs).toBe(1200)
    expect(playback.tracks[0].times).toEqual([0, 800])
    expect(playback.tracks[1].positions[0]).toBe(3)
  })
})

describe('sampleTrack', () => {
  it('returns null for an empty track', () => {
    expect(sampleTrack(trackOf([]), 10)).toBeNull()
  })

  it('holds a single keyframe at any time', () => {
    const track = trackOf([makeFrame({ time: 100, px: 1, py: 2, pz: 3 })])
    for (const t of [0, 100, 5000]) {
      const pose = sampleTrack(track, t)
      expect(pose?.position).toEqual([1, 2, 3])
      expect(pose?.rotation).toEqual([0, 0, 0, 1])
    }
  })

  it('lerps positions linearly between keyframes', () => {
    const track = trackOf([
      makeFrame({ time: 0, px: 0, py: 10, pz: -4 }),
      makeFrame({ time: 200, px: 8, py: 20, pz: 4 })
    ])
    const pose = sampleTrack(track, 50)
    expect(pose?.position[0]).toBeCloseTo(2)
    expect(pose?.position[1]).toBeCloseTo(12.5)
    expect(pose?.position[2]).toBeCloseTo(-2)
  })

  it('slerps rotations along the shortest arc', () => {
    // identity -> 90 degrees about Z; halfway must be 45 degrees about Z.
    const track = trackOf([
      makeFrame({ time: 0 }),
      makeFrame({ time: 100, qz: HALF_SQRT2, qw: HALF_SQRT2 })
    ])
    const pose = sampleTrack(track, 50)
    expect(pose?.rotation[2]).toBeCloseTo(Math.sin(Math.PI / 8), 5)
    expect(pose?.rotation[3]).toBeCloseTo(Math.cos(Math.PI / 8), 5)
  })

  it('treats q and -q as the same orientation (no long-way spin)', () => {
    const track = trackOf([makeFrame({ time: 0, qw: 1 }), makeFrame({ time: 100, qw: -1 })])
    const pose = sampleTrack(track, 50)
    // Halfway between identity and its double cover must still be identity.
    expect(Math.abs(pose?.rotation[3] ?? 0)).toBeCloseTo(1, 5)
  })

  it('clamps before the first and after the last keyframe', () => {
    const track = trackOf([makeFrame({ time: 100, px: 5 }), makeFrame({ time: 200, px: 9 })])
    expect(sampleTrack(track, 0)?.position[0]).toBe(5)
    expect(sampleTrack(track, 999)?.position[0]).toBe(9)
  })

  it('returns a normalized rotation for denormalized keys', () => {
    const track = trackOf([
      makeFrame({ time: 0, qz: 2, qw: 0 }),
      makeFrame({ time: 100, qz: 2, qw: 0 })
    ])
    const pose = sampleTrack(track, 50)
    expect(pose?.rotation[2]).toBeCloseTo(1, 5)
  })
})

describe('loopTimeMs', () => {
  it('wraps time into [0, duration)', () => {
    expect(loopTimeMs(0, 1000)).toBe(0)
    expect(loopTimeMs(250, 1000)).toBe(250)
    expect(loopTimeMs(1000, 1000)).toBe(0)
    expect(loopTimeMs(1500, 1000)).toBe(500)
  })

  it('returns 0 for a non-positive duration', () => {
    expect(loopTimeMs(123, 0)).toBe(0)
  })
})

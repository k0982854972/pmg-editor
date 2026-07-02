/**
 * Pure keyframe sampler for .ani skeletal animation playback. Decodes the
 * primary bone tracks of an AniFile once (buildPlayback) and samples a
 * bone-local pose at an arbitrary time (linear position lerp, shortest-arc
 * quaternion slerp, clamped outside the key range). ANI frames are absolute
 * bone-local transforms indexed by FRM bone id (verified against corpus
 * pairs, e.g. jenna_framework.frm vs female_graffitifloor.ani). Consumed by
 * Viewport.tsx via applyPoseToBones in skeleton.ts; tested in
 * tests/viewport/aniPlayback.test.ts.
 */
import { aniDurationMs, readAniFrame, storedFrameCount } from '../../../core/ani/reader'
import type { AniFile } from '../../../core/ani/types'

export interface BonePose {
  readonly position: readonly [number, number, number]
  /** Normalized quaternion [x, y, z, w]. */
  readonly rotation: readonly [number, number, number, number]
}

export interface BoneTrack {
  /** Keyframe times in ms, ascending. */
  readonly times: readonly number[]
  /** 3 numbers per keyframe. */
  readonly positions: readonly number[]
  /** 4 numbers per keyframe (x, y, z, w). */
  readonly rotations: readonly number[]
}

export interface AniPlayback {
  /** One track per primary bone, in file order (= FRM bone id order). */
  readonly tracks: readonly BoneTrack[]
  readonly durationMs: number
}

/** Decode every primary bone's frame block into a samplable track. */
export function buildPlayback(file: AniFile): AniPlayback {
  const tracks = file.bones.map((bone): BoneTrack => {
    const count = storedFrameCount(bone)
    const times: number[] = []
    const positions: number[] = []
    const rotations: number[] = []
    for (let i = 0; i < count; i += 1) {
      const frame = readAniFrame(bone, i)
      times.push(frame.time)
      positions.push(frame.position.x, frame.position.y, frame.position.z)
      rotations.push(frame.rotation.x, frame.rotation.y, frame.rotation.z, frame.rotation.w)
    }
    return { times, positions, rotations }
  })
  return { tracks, durationMs: aniDurationMs(file) }
}

/** Wrap a running time into [0, durationMs); 0 when the duration is empty. */
export function loopTimeMs(timeMs: number, durationMs: number): number {
  if (durationMs <= 0) return 0
  const wrapped = timeMs % durationMs
  return wrapped < 0 ? wrapped + durationMs : wrapped
}

/** Index of the last keyframe at or before timeMs (-1 when before the first). */
function segmentIndex(times: readonly number[], timeMs: number): number {
  let low = 0
  let high = times.length - 1
  let result = -1
  while (low <= high) {
    const mid = (low + high) >> 1
    if (times[mid] <= timeMs) {
      result = mid
      low = mid + 1
    } else {
      high = mid - 1
    }
  }
  return result
}

function poseAt(track: BoneTrack, index: number): BonePose {
  const p = index * 3
  const q = index * 4
  return {
    position: [track.positions[p], track.positions[p + 1], track.positions[p + 2]],
    rotation: normalize(
      track.rotations[q],
      track.rotations[q + 1],
      track.rotations[q + 2],
      track.rotations[q + 3]
    )
  }
}

function normalize(
  x: number,
  y: number,
  z: number,
  w: number
): readonly [number, number, number, number] {
  const length = Math.hypot(x, y, z, w)
  if (length === 0 || !Number.isFinite(length)) return [0, 0, 0, 1]
  return [x / length, y / length, z / length, w / length]
}

/** Shortest-arc spherical interpolation between two quaternions. */
function slerp(
  a: readonly [number, number, number, number],
  b: readonly [number, number, number, number],
  t: number
): readonly [number, number, number, number] {
  let [bx, by, bz, bw] = b
  let dot = a[0] * bx + a[1] * by + a[2] * bz + a[3] * bw
  if (dot < 0) {
    bx = -bx
    by = -by
    bz = -bz
    bw = -bw
    dot = -dot
  }
  // Nearly parallel: fall back to normalized linear interpolation.
  if (dot > 0.9995) {
    return normalize(
      a[0] + (bx - a[0]) * t,
      a[1] + (by - a[1]) * t,
      a[2] + (bz - a[2]) * t,
      a[3] + (bw - a[3]) * t
    )
  }
  const theta = Math.acos(Math.min(1, dot))
  const sinTheta = Math.sin(theta)
  const weightA = Math.sin((1 - t) * theta) / sinTheta
  const weightB = Math.sin(t * theta) / sinTheta
  return normalize(
    a[0] * weightA + bx * weightB,
    a[1] * weightA + by * weightB,
    a[2] * weightA + bz * weightB,
    a[3] * weightA + bw * weightB
  )
}

/**
 * Sample the bone-local pose at timeMs. Clamps outside the keyframe range;
 * null when the track has no keyframes (caller keeps the bind pose).
 */
export function sampleTrack(track: BoneTrack, timeMs: number): BonePose | null {
  const count = track.times.length
  if (count === 0) return null
  const index = segmentIndex(track.times, timeMs)
  if (index < 0) return poseAt(track, 0)
  if (index >= count - 1) return poseAt(track, count - 1)
  const t0 = track.times[index]
  const t1 = track.times[index + 1]
  const t = t1 > t0 ? (timeMs - t0) / (t1 - t0) : 0
  const before = poseAt(track, index)
  const after = poseAt(track, index + 1)
  return {
    position: [
      before.position[0] + (after.position[0] - before.position[0]) * t,
      before.position[1] + (after.position[1] - before.position[1]) * t,
      before.position[2] + (after.position[2] - before.position[2]) * t
    ],
    rotation: slerp(before.rotation, after.rotation, t)
  }
}

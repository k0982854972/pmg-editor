/**
 * Pure camera-fit math for the viewport. Given a world-space bounding box and
 * the current view direction, computes where the camera, orbit target, grid
 * and clip planes should go so the whole model is framed. Consumed by
 * Viewport.tsx; tested in tests/viewport/fitCamera.test.ts.
 */

export interface Vec3Like {
  readonly x: number
  readonly y: number
  readonly z: number
}

export interface Box3Like {
  readonly min: Vec3Like
  readonly max: Vec3Like
}

export interface CameraFit {
  readonly target: Vec3Like
  readonly position: Vec3Like
  readonly near: number
  readonly far: number
  readonly minDistance: number
  readonly maxDistance: number
  readonly gridSize: number
  readonly gridY: number
}

export const DEFAULT_VIEW_DIRECTION: Vec3Like = { x: 1, y: 0.6, z: 1 }

const FIT_DISTANCE_FACTOR = 2.2
const MIN_RADIUS = 0.5
const MIN_NEAR = 0.01
const NEAR_RADIUS_DIVISOR = 1000
const FAR_RADIUS_FACTOR = 100
const MIN_DISTANCE_RADIUS_DIVISOR = 100
const MAX_DISTANCE_RADIUS_FACTOR = 20
const GRID_RADIUS_FACTOR = 4

const isFiniteVec = (v: Vec3Like): boolean =>
  Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z)

const vecLength = (v: Vec3Like): number => Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z)

function normalizedDirection(direction: Vec3Like): Vec3Like {
  const usable = isFiniteVec(direction) && vecLength(direction) > 0
  const source = usable ? direction : DEFAULT_VIEW_DIRECTION
  const magnitude = vecLength(source)
  return { x: source.x / magnitude, y: source.y / magnitude, z: source.z / magnitude }
}

/**
 * Returns null when the box is empty (inverted, as Box3 reports when nothing
 * was added) or contains non-finite values; callers keep the current camera.
 */
export function computeCameraFit(box: Box3Like, viewDirection: Vec3Like): CameraFit | null {
  if (!isFiniteVec(box.min) || !isFiniteVec(box.max)) return null
  if (box.min.x > box.max.x || box.min.y > box.max.y || box.min.z > box.max.z) return null

  const target: Vec3Like = {
    x: (box.min.x + box.max.x) / 2,
    y: (box.min.y + box.max.y) / 2,
    z: (box.min.z + box.max.z) / 2
  }
  const halfDiagonal =
    vecLength({
      x: box.max.x - box.min.x,
      y: box.max.y - box.min.y,
      z: box.max.z - box.min.z
    }) / 2
  const radius = Math.max(halfDiagonal, MIN_RADIUS)
  const distance = radius * FIT_DISTANCE_FACTOR
  const direction = normalizedDirection(viewDirection)

  return {
    target,
    position: {
      x: target.x + direction.x * distance,
      y: target.y + direction.y * distance,
      z: target.z + direction.z * distance
    },
    near: Math.max(radius / NEAR_RADIUS_DIVISOR, MIN_NEAR),
    far: radius * FAR_RADIUS_FACTOR,
    minDistance: radius / MIN_DISTANCE_RADIUS_DIVISOR,
    maxDistance: radius * MAX_DISTANCE_RADIUS_FACTOR,
    gridSize: radius * GRID_RADIUS_FACTOR,
    gridY: box.min.y
  }
}

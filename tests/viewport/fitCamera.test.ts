import { describe, expect, test } from 'vitest'
import { computeCameraFit, DEFAULT_VIEW_DIRECTION } from '../../src/renderer/src/viewport/fitCamera'
import type { Box3Like, Vec3Like } from '../../src/renderer/src/viewport/fitCamera'

const box = (min: Vec3Like, max: Vec3Like): Box3Like => ({ min, max })

const length = (v: Vec3Like): number => Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z)

const subtract = (a: Vec3Like, b: Vec3Like): Vec3Like => ({
  x: a.x - b.x,
  y: a.y - b.y,
  z: a.z - b.z
})

const UNIT_BOX = box({ x: -1, y: -1, z: -1 }, { x: 1, y: 1, z: 1 })
const UNIT_BOX_RADIUS = Math.sqrt(3)
const VIEW_X = { x: 1, y: 0, z: 0 }

describe('computeCameraFit', () => {
  test('returns null for an empty (inverted) box', () => {
    expect(computeCameraFit(box({ x: 1, y: 1, z: 1 }, { x: -1, y: -1, z: -1 }), VIEW_X)).toBeNull()
  })

  test('returns null when box contains non-finite values', () => {
    expect(
      computeCameraFit(box({ x: 0, y: 0, z: 0 }, { x: Number.NaN, y: 1, z: 1 }), VIEW_X)
    ).toBeNull()
    expect(
      computeCameraFit(
        box({ x: 0, y: 0, z: 0 }, { x: Number.POSITIVE_INFINITY, y: 1, z: 1 }),
        VIEW_X
      )
    ).toBeNull()
  })

  test('targets the box center', () => {
    const fit = computeCameraFit(box({ x: 90, y: -10, z: 40 }, { x: 110, y: 10, z: 60 }), VIEW_X)
    expect(fit).not.toBeNull()
    expect(fit?.target).toEqual({ x: 100, y: 0, z: 50 })
  })

  test('places the camera at radius * 2.2 along the normalized view direction', () => {
    const fit = computeCameraFit(UNIT_BOX, { x: 2, y: 0, z: 0 })
    expect(fit).not.toBeNull()
    if (!fit) return
    const offset = subtract(fit.position, fit.target)
    expect(offset.y).toBeCloseTo(0)
    expect(offset.z).toBeCloseTo(0)
    expect(offset.x).toBeCloseTo(UNIT_BOX_RADIUS * 2.2)
  })

  test('keeps the distance to target at radius * 2.2 for oblique directions', () => {
    const fit = computeCameraFit(UNIT_BOX, { x: 1, y: 0.6, z: 1 })
    expect(fit).not.toBeNull()
    if (!fit) return
    expect(length(subtract(fit.position, fit.target))).toBeCloseTo(UNIT_BOX_RADIUS * 2.2)
  })

  test('falls back to the default direction when view direction is zero-length', () => {
    const fit = computeCameraFit(UNIT_BOX, { x: 0, y: 0, z: 0 })
    const reference = computeCameraFit(UNIT_BOX, DEFAULT_VIEW_DIRECTION)
    expect(fit).toEqual(reference)
  })

  test('scales near and far planes to the model radius', () => {
    const big = computeCameraFit(box({ x: 0, y: 0, z: 0 }, { x: 2000, y: 2000, z: 2000 }), VIEW_X)
    expect(big).not.toBeNull()
    if (!big) return
    const radius = Math.sqrt(3) * 1000
    expect(big.near).toBeCloseTo(radius / 1000)
    expect(big.far).toBeCloseTo(radius * 100)
    expect(big.near).toBeGreaterThanOrEqual(0.01)
    expect(big.far).toBeGreaterThan(length(subtract(big.position, big.target)))
  })

  test('clamps the near plane to 0.01 for small models', () => {
    const fit = computeCameraFit(
      box({ x: 0, y: 0, z: 0 }, { x: 0.002, y: 0.002, z: 0.002 }),
      VIEW_X
    )
    expect(fit?.near).toBe(0.01)
  })

  test('clamps a degenerate point box to a usable minimum radius', () => {
    const fit = computeCameraFit(box({ x: 5, y: 5, z: 5 }, { x: 5, y: 5, z: 5 }), VIEW_X)
    expect(fit).not.toBeNull()
    if (!fit) return
    expect(fit.target).toEqual({ x: 5, y: 5, z: 5 })
    expect(length(subtract(fit.position, fit.target))).toBeGreaterThan(0)
    expect(fit.gridSize).toBeGreaterThan(0)
  })

  test('sizes the grid to the model and drops it to the box floor', () => {
    const fit = computeCameraFit(box({ x: -2, y: 3, z: -2 }, { x: 2, y: 7, z: 2 }), VIEW_X)
    expect(fit).not.toBeNull()
    if (!fit) return
    const radius = Math.sqrt(4 + 4 + 4)
    expect(fit.gridSize).toBeCloseTo(radius * 4)
    expect(fit.gridY).toBe(3)
  })

  test('derives orbit zoom limits from the radius', () => {
    const fit = computeCameraFit(UNIT_BOX, VIEW_X)
    expect(fit).not.toBeNull()
    if (!fit) return
    expect(fit.minDistance).toBeCloseTo(UNIT_BOX_RADIUS / 100)
    expect(fit.maxDistance).toBeCloseTo(UNIT_BOX_RADIUS * 20)
  })
})

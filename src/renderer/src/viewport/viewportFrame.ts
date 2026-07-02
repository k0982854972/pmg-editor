/**
 * Grid + camera-fit helpers for the model viewport, extracted from
 * Viewport.tsx. SceneRefs bundles the manually managed Three.js objects; the
 * grid is replaced on every fit so it tracks the model's size and floor.
 */
import * as THREE from 'three'
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { BuiltScene } from './buildMeshes'
import { computeCameraFit } from './fitCamera'

export interface SceneRefs {
  readonly renderer: THREE.WebGLRenderer
  readonly scene: THREE.Scene
  readonly camera: THREE.PerspectiveCamera
  readonly controls: OrbitControls
  // Replaced on every fit so the grid tracks the model's size and floor.
  grid: THREE.GridHelper
}

const GRID_DIVISIONS = 40
const GRID_CENTER_COLOR = 0x3a4150
const GRID_LINE_COLOR = 0x262b34

export const DEFAULT_GRID_SIZE = 20

export function createGrid(size: number): THREE.GridHelper {
  return new THREE.GridHelper(size, GRID_DIVISIONS, GRID_CENTER_COLOR, GRID_LINE_COLOR)
}

function replaceGrid(refs: SceneRefs, size: number, position: THREE.Vector3): void {
  refs.scene.remove(refs.grid)
  refs.grid.dispose()
  const grid = createGrid(size)
  grid.position.copy(position)
  refs.scene.add(grid)
  refs.grid = grid
}

/**
 * Frames the visible meshes: world-space bounding box (matrix2 transforms
 * applied) drives camera position, orbit target, clip planes, zoom limits and
 * grid placement. No-op when nothing is visible.
 */
export function fitCameraToScene(refs: SceneRefs, built: BuiltScene): void {
  built.root.updateWorldMatrix(true, true)
  const box = new THREE.Box3()
  built.byKey.forEach((object) => {
    if (object.visible) box.expandByObject(object)
  })
  const viewDirection = refs.camera.position.clone().sub(refs.controls.target)
  const fit = computeCameraFit(box, viewDirection)
  if (!fit) return
  refs.camera.position.set(fit.position.x, fit.position.y, fit.position.z)
  refs.camera.near = fit.near
  refs.camera.far = fit.far
  refs.camera.updateProjectionMatrix()
  refs.controls.target.set(fit.target.x, fit.target.y, fit.target.z)
  refs.controls.minDistance = fit.minDistance
  refs.controls.maxDistance = fit.maxDistance
  refs.controls.update()
  replaceGrid(refs, fit.gridSize, new THREE.Vector3(fit.target.x, fit.gridY, fit.target.z))
}

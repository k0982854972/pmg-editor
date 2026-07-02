/**
 * Manual Three.js viewport: grid, lights, orbit controls, auto-fit camera,
 * selected-mesh highlight and wireframe toggle. Consumed by App.tsx.
 */
import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { PmgFile } from '../../../core/pmg/types'
import type { MeshSelection } from '../state/editorReducer'
import { buildFileScene, disposeScene, meshKeyOf, type BuiltScene } from './buildMeshes'
import { computeCameraFit } from './fitCamera'

interface ViewportProps {
  file: PmgFile | null
  filePath: string | null
  selection: MeshSelection | null
  hiddenKeys: ReadonlySet<string>
}

interface SceneRefs {
  readonly renderer: THREE.WebGLRenderer
  readonly scene: THREE.Scene
  readonly camera: THREE.PerspectiveCamera
  readonly controls: OrbitControls
  // Replaced on every fit so the grid tracks the model's size and floor.
  grid: THREE.GridHelper
}

const SELECTED_EMISSIVE = 0x2a6bd4
const GRID_DIVISIONS = 40
const GRID_CENTER_COLOR = 0x3a4150
const GRID_LINE_COLOR = 0x262b34
const DEFAULT_GRID_SIZE = 20

function createGrid(size: number): THREE.GridHelper {
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
function fitCameraToScene(refs: SceneRefs, built: BuiltScene): void {
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

export function Viewport({
  file,
  filePath,
  selection,
  hiddenKeys
}: ViewportProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const refsRef = useRef<SceneRefs | null>(null)
  const builtRef = useRef<BuiltScene | null>(null)
  const fittedPathRef = useRef<string | null>(null)
  const [isWireframe, setIsWireframe] = useState(false)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return undefined

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(window.devicePixelRatio)
    container.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x16181d)
    const grid = createGrid(DEFAULT_GRID_SIZE)
    scene.add(grid)
    scene.add(new THREE.HemisphereLight(0xdde4ff, 0x2c3038, 1.1))
    const sun = new THREE.DirectionalLight(0xffffff, 1.6)
    sun.position.set(5, 10, 7)
    scene.add(sun)

    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 5000)
    camera.position.set(4, 3, 6)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.enablePan = true
    controls.screenSpacePanning = true

    const refs: SceneRefs = { renderer, scene, camera, controls, grid }
    refsRef.current = refs
    fittedPathRef.current = null

    const resize = (): void => {
      const width = container.clientWidth
      const height = container.clientHeight
      if (width === 0 || height === 0) return
      renderer.setSize(width, height)
      camera.aspect = width / height
      camera.updateProjectionMatrix()
    }
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(container)

    renderer.setAnimationLoop(() => {
      controls.update()
      renderer.render(scene, camera)
    })

    return () => {
      observer.disconnect()
      renderer.setAnimationLoop(null)
      controls.dispose()
      refs.grid.dispose()
      if (builtRef.current) {
        scene.remove(builtRef.current.root)
        disposeScene(builtRef.current)
        builtRef.current = null
      }
      renderer.dispose()
      container.removeChild(renderer.domElement)
      refsRef.current = null
    }
  }, [])

  useEffect(() => {
    const refs = refsRef.current
    if (!refs) return
    if (builtRef.current) {
      refs.scene.remove(builtRef.current.root)
      disposeScene(builtRef.current)
      builtRef.current = null
    }
    if (!file) {
      fittedPathRef.current = null
      return
    }
    const built = buildFileScene(file)
    builtRef.current = built
    refs.scene.add(built.root)
    // Refit only on a newly opened file, not on every field edit.
    if (fittedPathRef.current !== filePath) {
      fitCameraToScene(refs, built)
      fittedPathRef.current = filePath
    }
  }, [file, filePath])

  useEffect(() => {
    const built = builtRef.current
    if (!built) return
    const selectedKey =
      selection === null ? null : meshKeyOf(selection.groupIndex, selection.meshIndex)
    built.byKey.forEach((object, key) => {
      object.visible = !hiddenKeys.has(key)
      const material = object.material as THREE.MeshStandardMaterial
      material.wireframe = isWireframe
      material.emissive.setHex(key === selectedKey ? SELECTED_EMISSIVE : 0x000000)
    })
  }, [file, filePath, selection, hiddenKeys, isWireframe])

  return (
    <main className="viewport">
      <div className="viewport-canvas" ref={containerRef} />
      <div className="viewport-overlay">
        <button
          type="button"
          className={isWireframe ? 'toggle active' : 'toggle'}
          title="切換線框顯示模式"
          onClick={() => setIsWireframe((value) => !value)}
        >
          線框
        </button>
        <button
          type="button"
          className="toggle"
          title="將鏡頭對準模型（滑鼠左鍵旋轉、右鍵平移、滾輪縮放）"
          onClick={() => {
            const refs = refsRef.current
            const built = builtRef.current
            if (refs && built) fitCameraToScene(refs, built)
          }}
        >
          適應視圖
        </button>
      </div>
      {!file && <div className="viewport-empty">尚未載入模型</div>}
    </main>
  )
}

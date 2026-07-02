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
}

const SELECTED_EMISSIVE = 0x2a6bd4
const CAMERA_FIT_DISTANCE_FACTOR = 2.2

function fitCameraToObject(refs: SceneRefs, root: THREE.Object3D): void {
  const box = new THREE.Box3().setFromObject(root)
  if (box.isEmpty()) return
  const sphere = box.getBoundingSphere(new THREE.Sphere())
  const distance = Math.max(sphere.radius, 0.5) * CAMERA_FIT_DISTANCE_FACTOR
  const direction = new THREE.Vector3(1, 0.6, 1).normalize()
  refs.camera.position.copy(sphere.center).addScaledVector(direction, distance)
  refs.camera.near = Math.max(distance / 1000, 0.001)
  refs.camera.far = distance * 100
  refs.camera.updateProjectionMatrix()
  refs.controls.target.copy(sphere.center)
  refs.controls.update()
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
    scene.add(new THREE.GridHelper(20, 20, 0x3a4150, 0x262b34))
    scene.add(new THREE.HemisphereLight(0xdde4ff, 0x2c3038, 1.1))
    const sun = new THREE.DirectionalLight(0xffffff, 1.6)
    sun.position.set(5, 10, 7)
    scene.add(sun)

    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 5000)
    camera.position.set(4, 3, 6)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true

    const refs: SceneRefs = { renderer, scene, camera, controls }
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
      fitCameraToObject(refs, built.root)
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
          onClick={() => setIsWireframe((value) => !value)}
        >
          線框
        </button>
      </div>
      {!file && <div className="viewport-empty">尚未載入模型</div>}
    </main>
  )
}

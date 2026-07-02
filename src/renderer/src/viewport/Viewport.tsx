/**
 * Manual Three.js viewport: grid, lights, orbit controls, auto-fit camera,
 * selected-mesh highlight and wireframe toggle, plus FRM skeleton binding and
 * ANI animation playback (control strip in AnimControls.tsx). Consumed by
 * App.tsx.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { readAni } from '../../../core/ani/reader'
import { readFrm } from '../../../core/frm/reader'
import type { FrmFile } from '../../../core/frm/types'
import type { PmgFile } from '../../../core/pmg/types'
import type { MeshSelection } from '../state/editorReducer'
import { AnimControls } from './AnimControls'
import { buildPlayback, loopTimeMs, type AniPlayback } from './aniPlayback'
import { buildFileScene, disposeScene, meshKeyOf, type BuiltScene } from './buildMeshes'
import { DEFAULT_GRID_SIZE, createGrid, fitCameraToScene, type SceneRefs } from './viewportFrame'
import {
  applyPlaybackPose,
  buildSkinnedScene,
  computeSkinnedSceneStats,
  resetRigPose,
  type SkeletonRig
} from './skeleton'

interface ViewportProps {
  file: PmgFile | null
  filePath: string | null
  selection: MeshSelection | null
  hiddenKeys: ReadonlySet<string>
}

interface LoadedFrm {
  readonly frm: FrmFile
  readonly name: string
}

interface LoadedAni {
  readonly playback: AniPlayback
  readonly name: string
}

/** Mutable playback state read by the render loop (no React churn). */
interface AnimRuntime {
  rig: SkeletonRig | null
  playback: AniPlayback | null
  playing: boolean
  speed: number
  timeMs: number
  lastTick: number | null
}

const SELECTED_EMISSIVE = 0x2a6bd4

const baseName = (path: string): string => path.split(/[\\/]/).pop() ?? path

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
  const animRef = useRef<AnimRuntime>({
    rig: null,
    playback: null,
    playing: false,
    speed: 1,
    timeMs: 0,
    lastTick: null
  })
  const [isWireframe, setIsWireframe] = useState(false)
  const [loadedFrm, setLoadedFrm] = useState<LoadedFrm | null>(null)
  const [loadedAni, setLoadedAni] = useState<LoadedAni | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [displayTimeMs, setDisplayTimeMs] = useState(0)
  const [loadError, setLoadError] = useState<string | null>(null)

  const stats = useMemo(
    () => (file && loadedFrm ? computeSkinnedSceneStats(file, loadedFrm.frm) : null),
    [file, loadedFrm]
  )

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

    renderer.setAnimationLoop((time) => {
      const anim = animRef.current
      if (anim.rig && anim.playback && anim.playing) {
        const delta = anim.lastTick === null ? 0 : time - anim.lastTick
        anim.timeMs = loopTimeMs(anim.timeMs + delta * anim.speed, anim.playback.durationMs)
        applyPlaybackPose(anim.rig, anim.playback, anim.timeMs)
        setDisplayTimeMs(anim.timeMs)
      }
      anim.lastTick = time
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

  // Rebuild the scene when the file or the loaded skeleton changes.
  useEffect(() => {
    const refs = refsRef.current
    if (!refs) return
    if (builtRef.current) {
      refs.scene.remove(builtRef.current.root)
      disposeScene(builtRef.current)
      builtRef.current = null
    }
    animRef.current.rig = null
    if (!file) {
      fittedPathRef.current = null
      return
    }
    let built: BuiltScene
    if (loadedFrm) {
      const skinned = buildSkinnedScene(file, loadedFrm.frm)
      animRef.current.rig = skinned.rig
      built = skinned
    } else {
      built = buildFileScene(file)
    }
    builtRef.current = built
    refs.scene.add(built.root)
    const anim = animRef.current
    if (anim.rig && anim.playback) applyPlaybackPose(anim.rig, anim.playback, anim.timeMs)
    // Refit only on a newly opened file, not on every field edit.
    if (fittedPathRef.current !== filePath) {
      fitCameraToScene(refs, built)
      fittedPathRef.current = filePath
    }
  }, [file, filePath, loadedFrm])

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

  const loadFrmData = useCallback((data: Uint8Array, path: string): void => {
    try {
      const frm = readFrm(data)
      setLoadedFrm({ frm, name: baseName(path) })
      setLoadError(null)
    } catch (error) {
      setLoadError(`骨架載入失敗：${error instanceof Error ? error.message : String(error)}`)
    }
  }, [])

  const loadAniData = useCallback((data: Uint8Array, path: string): void => {
    try {
      const playback = buildPlayback(readAni(data))
      setLoadedAni({ playback, name: baseName(path) })
      const anim = animRef.current
      anim.playback = playback
      anim.timeMs = 0
      anim.playing = true
      setIsPlaying(true)
      setDisplayTimeMs(0)
      setLoadError(null)
    } catch (error) {
      setLoadError(`動畫載入失敗：${error instanceof Error ? error.message : String(error)}`)
    }
  }, [])

  const unloadFrm = useCallback((): void => {
    setLoadedFrm(null)
    setLoadedAni(null)
    const anim = animRef.current
    anim.playback = null
    anim.playing = false
    setIsPlaying(false)
    setDisplayTimeMs(0)
  }, [])

  const unloadAni = useCallback((): void => {
    setLoadedAni(null)
    const anim = animRef.current
    anim.playback = null
    anim.playing = false
    if (anim.rig) resetRigPose(anim.rig)
    setIsPlaying(false)
    setDisplayTimeMs(0)
  }, [])

  const seek = useCallback((timeMs: number): void => {
    const anim = animRef.current
    anim.timeMs = timeMs
    if (anim.rig && anim.playback) applyPlaybackPose(anim.rig, anim.playback, timeMs)
    setDisplayTimeMs(timeMs)
  }, [])

  const togglePlay = useCallback((): void => {
    const anim = animRef.current
    anim.playing = !anim.playing
    setIsPlaying(anim.playing)
  }, [])

  const changeSpeed = useCallback((value: number): void => {
    animRef.current.speed = value
    setSpeed(value)
  }, [])

  // Dev-only hooks so automated smoke tests can drive playback headlessly.
  useEffect(() => {
    if (!import.meta.env.DEV) return undefined
    const devWindow = window as unknown as {
      __loadFrmPath?: (path: string) => Promise<void>
      __loadAniPath?: (path: string) => Promise<void>
      __animStats?: () => {
        bones: number
        matched: number
        playing: boolean
        durationMs: number
      }
    }
    devWindow.__loadFrmPath = async (path: string): Promise<void> => {
      const result = await window.api.openFrmPath(path)
      if (result) loadFrmData(result.data, result.path)
    }
    devWindow.__loadAniPath = async (path: string): Promise<void> => {
      const result = await window.api.openAniPath(path)
      if (result) loadAniData(result.data, result.path)
    }
    devWindow.__animStats = () => ({
      bones: animRef.current.rig?.bones.length ?? 0,
      matched: stats?.skinnedMeshCount ?? 0,
      playing: animRef.current.playing,
      durationMs: animRef.current.playback?.durationMs ?? 0
    })
    return () => {
      delete devWindow.__loadFrmPath
      delete devWindow.__loadAniPath
      delete devWindow.__animStats
    }
  }, [loadFrmData, loadAniData, stats])

  const warnings: string[] = []
  if (loadError) warnings.push(`⚠ ${loadError}`)
  if (stats && stats.unmatchedBoneNames.length > 0) {
    warnings.push(`⚠ ${stats.unmatchedBoneNames.length} 個網格骨骼名稱未匹配`)
  }
  if (loadedFrm && loadedAni && loadedAni.playback.tracks.length !== loadedFrm.frm.bones.length) {
    warnings.push(
      `⚠ 動畫骨骼數 ${loadedAni.playback.tracks.length} 與骨架 ${loadedFrm.frm.bones.length} 不符`
    )
  }

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
      {file && (
        <AnimControls
          skeletonLabel={
            loadedFrm ? `✓ ${loadedFrm.name}（${loadedFrm.frm.bones.length} 骨骼）` : null
          }
          animLabel={
            loadedAni
              ? `✓ ${loadedAni.name}（${(loadedAni.playback.durationMs / 1000).toFixed(1)} 秒）`
              : null
          }
          warning={warnings.length > 0 ? warnings.join('；') : null}
          hasSkeleton={loadedFrm !== null}
          hasPlayback={loadedAni !== null}
          isPlaying={isPlaying}
          speed={speed}
          timeMs={displayTimeMs}
          durationMs={loadedAni?.playback.durationMs ?? 0}
          onLoadFrm={() => {
            void window.api.openFrm().then((result) => {
              if (result) loadFrmData(result.data, result.path)
            })
          }}
          onUnloadFrm={unloadFrm}
          onLoadAni={() => {
            void window.api.openAni().then((result) => {
              if (result) loadAniData(result.data, result.path)
            })
          }}
          onUnloadAni={unloadAni}
          onTogglePlay={togglePlay}
          onSpeedChange={changeSpeed}
          onSeek={seek}
        />
      )}
      {!file && <div className="viewport-empty">尚未載入模型</div>}
    </main>
  )
}

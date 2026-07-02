/**
 * Real-time FX particle preview panel: controls row (play/pause, restart,
 * loop, emitter selector, data-root input + folder picker) over a three.js
 * canvas driven by the pure simulation in particleModel.ts. Recompiles on
 * document or emitter changes; DDS atlas textures are resolved through
 * window.api.readFxTexture with a per-texture load status list, falling
 * back silently to the default sprite. Exposes window.__fxPreviewStats()
 * in dev builds for smoke tests.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import type { EffectDocument } from '../../../../core/fx/effectXml'
import { emitterDisplayName } from '../../../../core/fx/effectXml'
import { CommitInput } from '../CommitInput'
import type { CompiledEmitter, ParticleState } from './particleModel'
import { compileEmitter, createInitialState, createSeededRng, stepParticles } from './particleModel'
import type { PreviewSceneHandle } from './previewScene'
import { createPreviewScene, parseDdsTexture } from './previewScene'

interface FxPreviewProps {
  readonly doc: EffectDocument | null
  readonly selectedEmitter: number | null
}

interface SimRef {
  compiled: CompiledEmitter | null
  state: ParticleState | null
  rng: () => number
}

type TextureLoadState = 'loading' | 'loaded' | 'missing'

interface TextureStatus {
  readonly state: TextureLoadState
  /** Tooltip detail: resolved path when loaded, reason when missing. */
  readonly detail: string
}

const TEXTURE_STATUS_PRESENTATION: Record<TextureLoadState, { icon: string; label: string }> = {
  loading: { icon: '⏳', label: '載入中' },
  loaded: { icon: '✓', label: '已載入' },
  missing: { icon: '✗', label: '找不到（使用預設圓點）' }
}

const DATA_ROOT_STORAGE_KEY = 'fx.dataRoot'
const DATA_ROOT_HINT = '指向解包的 data 或 material 資料夾，用於載入特效貼圖'
const RNG_SEED = 1234

const readStoredDataRoot = (): string => {
  try {
    return localStorage.getItem(DATA_ROOT_STORAGE_KEY) ?? ''
  } catch {
    return ''
  }
}

const totalParticles = (state: ParticleState): number =>
  state.effectTypes.reduce((sum, effectType) => sum + effectType.particles.length, 0)

/** Distinct atlas texture names referenced by the compiled emitter. */
const uniqueTextureNames = (compiled: CompiledEmitter | null): string[] => {
  if (!compiled) return []
  const names = compiled.effectTypes
    .map((effectType) => effectType.atlas?.texture ?? '')
    .filter((name) => name !== '')
  return [...new Set(names)]
}

export function FxPreview({ doc, selectedEmitter }: FxPreviewProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<PreviewSceneHandle | null>(null)
  const simRef = useRef<SimRef>({ compiled: null, state: null, rng: createSeededRng(RNG_SEED) })
  const playingRef = useRef(true)
  const loopRef = useRef(true)

  const [isPlaying, setIsPlaying] = useState(true)
  const [isLooping, setIsLooping] = useState(true)
  const [emitterIndex, setEmitterIndex] = useState(0)
  const [dataRoot, setDataRoot] = useState(readStoredDataRoot)
  const [textureStatuses, setTextureStatuses] = useState<Record<string, TextureStatus>>({})

  // Follow tree selection changes (adjust-state-in-render pattern).
  const [lastSelected, setLastSelected] = useState(selectedEmitter)
  if (lastSelected !== selectedEmitter) {
    setLastSelected(selectedEmitter)
    if (selectedEmitter !== null) setEmitterIndex(selectedEmitter)
  }

  const emitterCount = doc?.emitters.length ?? 0
  const effectiveIndex = emitterCount > 0 ? Math.min(emitterIndex, emitterCount - 1) : 0
  const compiled = useMemo(
    () => (doc ? compileEmitter(doc, effectiveIndex) : null),
    [doc, effectiveIndex]
  )
  const textureNames = useMemo(() => uniqueTextureNames(compiled), [compiled])

  // Drop stale async texture statuses when the emitter or data root changes
  // (adjust-state-in-render pattern); defaults below cover the reset window.
  const [statusSource, setStatusSource] = useState({ compiled, dataRoot })
  if (statusSource.compiled !== compiled || statusSource.dataRoot !== dataRoot) {
    setStatusSource({ compiled, dataRoot })
    setTextureStatuses({})
  }
  const defaultTextureStatus: TextureStatus =
    dataRoot.trim() === ''
      ? { state: 'missing', detail: '尚未設定資料根目錄' }
      : { state: 'loading', detail: '' }

  useEffect(() => {
    playingRef.current = isPlaying
    loopRef.current = isLooping
  }, [isPlaying, isLooping])

  // Scene lifecycle: one WebGL context per mount; the frame callback steps
  // the sim (when playing) and copies it into the instance buffers.
  useEffect(() => {
    const container = containerRef.current
    if (!container) return undefined
    const handle = createPreviewScene(container, (dtMs) => {
      const sim = simRef.current
      if (!sim.compiled || !sim.state) return
      if (playingRef.current) {
        const finished =
          sim.state.timeMs >= sim.compiled.durationMs && totalParticles(sim.state) === 0
        if (loopRef.current && finished) {
          sim.state = createInitialState(sim.compiled)
          sim.rng = createSeededRng(RNG_SEED)
        }
        sim.state = stepParticles(sim.state, dtMs, sim.compiled, sim.rng)
      }
      sceneRef.current?.updateParticles(sim.state, sim.compiled)
    })
    sceneRef.current = handle
    const sim = simRef.current
    handle.syncEffectTypes(sim.compiled?.effectTypes.length ?? 0)
    return () => {
      sceneRef.current = null
      handle.dispose()
    }
  }, [])

  // Restart the sim whenever the compiled emitter (doc/emitter) changes.
  useEffect(() => {
    simRef.current = {
      compiled,
      state: compiled ? createInitialState(compiled) : null,
      rng: createSeededRng(RNG_SEED)
    }
    sceneRef.current?.syncEffectTypes(compiled?.effectTypes.length ?? 0)
  }, [compiled])

  // Resolve DDS atlas textures and track a visible status per texture name;
  // any failure keeps the default sprite.
  useEffect(() => {
    const root = dataRoot.trim()
    if (!compiled || root === '' || textureNames.length === 0) return undefined
    let isCancelled = false
    const setStatus = (name: string, status: TextureStatus): void => {
      if (isCancelled) return
      setTextureStatuses((previous) => ({ ...previous, [name]: status }))
    }
    textureNames.forEach((name) => {
      window.api
        .readFxTexture(root, name)
        .then((result) => {
          if (isCancelled) return
          if (!result) {
            setStatus(name, { state: 'missing', detail: '在資料根目錄下找不到對應的 .dds 檔' })
            return
          }
          // Decode one texture per EffectType slot: setTexture() disposes
          // per slot, so a shared instance must not be reused across slots.
          let isApplied = false
          compiled.effectTypes.forEach((effectType, index) => {
            if (effectType.atlas?.texture !== name) return
            const texture = parseDdsTexture(new Uint8Array(result.data))
            if (!texture) return
            sceneRef.current?.setTexture(index, texture)
            isApplied = true
          })
          setStatus(
            name,
            isApplied
              ? { state: 'loaded', detail: result.path }
              : { state: 'missing', detail: `DDS 解析失敗：${result.path}` }
          )
        })
        .catch(() => {
          setStatus(name, { state: 'missing', detail: '讀取貼圖時發生錯誤' })
        })
    })
    return () => {
      isCancelled = true
    }
  }, [compiled, dataRoot, textureNames])

  // Dev-only stats hook for automated smoke tests.
  useEffect(() => {
    if (!import.meta.env.DEV) return undefined
    const devWindow = window as unknown as {
      __fxPreviewStats?: () => {
        running: boolean
        particleCount: number
        effectTypes: number
      }
    }
    devWindow.__fxPreviewStats = () => {
      const sim = simRef.current
      return {
        running: playingRef.current && sim.compiled !== null,
        particleCount: sim.state ? totalParticles(sim.state) : 0,
        effectTypes: sim.compiled?.effectTypes.length ?? 0
      }
    }
    return () => {
      delete devWindow.__fxPreviewStats
    }
  }, [])

  const handleRestart = (): void => {
    const sim = simRef.current
    if (!sim.compiled) return
    sim.state = createInitialState(sim.compiled)
    sim.rng = createSeededRng(RNG_SEED)
  }

  const handleDataRootCommit = (value: string): void => {
    setDataRoot(value)
    try {
      localStorage.setItem(DATA_ROOT_STORAGE_KEY, value)
    } catch {
      // Persistence is best-effort; the in-memory value still applies.
    }
  }

  const handlePickDataRoot = (): void => {
    window.api
      .pickFxDataRoot()
      .then((path) => {
        if (path) handleDataRootCommit(path)
      })
      .catch(() => undefined)
  }

  return (
    <div className="fx-preview-panel">
      <div className="fx-preview-controls">
        <button
          type="button"
          title="播放或暫停粒子模擬"
          onClick={() => setIsPlaying((value) => !value)}
        >
          {isPlaying ? '暫停' : '播放'}
        </button>
        <button type="button" title="從頭重新播放" disabled={!compiled} onClick={handleRestart}>
          重播
        </button>
        <label className="fx-preview-loop" title="播放結束後自動重播">
          <input
            type="checkbox"
            checked={isLooping}
            onChange={(event) => setIsLooping(event.target.checked)}
          />
          循環
        </label>
        <select
          className="fx-preview-emitter"
          aria-label="預覽發射器"
          title="選擇要預覽的發射器"
          value={effectiveIndex}
          disabled={emitterCount === 0}
          onChange={(event) => setEmitterIndex(Number(event.target.value))}
        >
          {doc?.emitters.map((emitter, index) => (
            <option key={index} value={index} title={emitter.name}>
              {emitterDisplayName(emitter.node)}
            </option>
          ))}
        </select>
      </div>
      <div className="fx-preview-controls">
        <span className="fx-preview-label" title={DATA_ROOT_HINT}>
          資料根目錄
        </span>
        <CommitInput
          className="fx-preview-dataroot"
          ariaLabel="資料根目錄"
          placeholder="例如 E:\...\data"
          value={dataRoot}
          onCommit={handleDataRootCommit}
        />
        <button type="button" title={DATA_ROOT_HINT} onClick={handlePickDataRoot}>
          選擇資料夾
        </button>
      </div>
      {textureNames.length > 0 && (
        <div className="fx-preview-textures" title="目前發射器引用的貼圖與載入狀態">
          {textureNames.map((name) => {
            const status = textureStatuses[name] ?? defaultTextureStatus
            const presentation = TEXTURE_STATUS_PRESENTATION[status.state]
            return (
              <div
                key={name}
                className={`fx-preview-texture is-${status.state}`}
                title={status.detail !== '' ? status.detail : presentation.label}
              >
                <span className="fx-preview-texture-icon">{presentation.icon}</span>
                <span className="fx-preview-texture-name">{name}</span>
                <span className="fx-preview-texture-state">{presentation.label}</span>
              </div>
            )
          })}
        </div>
      )}
      <div className="fx-preview-canvas" ref={containerRef} />
      {!doc && <div className="fx-preview-empty">尚未載入特效</div>}
    </div>
  )
}

/**
 * Real-time FX particle preview panel: controls row (play/pause, restart,
 * loop, emitter selector, data-root input) over a three.js canvas driven
 * by the pure simulation in particleModel.ts. Recompiles on document or
 * emitter changes; DDS atlas textures are resolved through
 * window.api.readFxTexture and fall back silently to the default sprite.
 * Exposes window.__fxPreviewStats() in dev builds for smoke tests.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import type { EffectDocument } from '../../../../core/fx/effectXml'
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

const DATA_ROOT_STORAGE_KEY = 'fx.dataRoot'
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

  // Resolve DDS atlas textures; any failure keeps the default sprite.
  useEffect(() => {
    const root = dataRoot.trim()
    if (!compiled || root === '') return undefined
    let isCancelled = false
    compiled.effectTypes.forEach((effectType, index) => {
      if (!effectType.atlas) return
      window.api
        .readFxTexture(root, effectType.atlas.texture)
        .then((result) => {
          if (isCancelled || !result) return
          const texture = parseDdsTexture(new Uint8Array(result.data))
          if (!texture) return
          if (isCancelled) texture.dispose()
          else sceneRef.current?.setTexture(index, texture)
        })
        .catch(() => undefined)
    })
    return () => {
      isCancelled = true
    }
  }, [compiled, dataRoot])

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

  return (
    <div className="fx-preview-panel">
      <div className="fx-preview-controls">
        <button type="button" onClick={() => setIsPlaying((value) => !value)}>
          {isPlaying ? '暫停' : '播放'}
        </button>
        <button type="button" disabled={!compiled} onClick={handleRestart}>
          重播
        </button>
        <label className="fx-preview-loop">
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
          value={effectiveIndex}
          disabled={emitterCount === 0}
          onChange={(event) => setEmitterIndex(Number(event.target.value))}
        >
          {doc?.emitters.map((emitter, index) => (
            <option key={index} value={index}>
              {emitter.name}
            </option>
          ))}
        </select>
      </div>
      <div className="fx-preview-controls">
        <span className="fx-preview-label">資料根目錄</span>
        <CommitInput
          className="fx-preview-dataroot"
          ariaLabel="資料根目錄"
          placeholder="例如 E:\...\data"
          value={dataRoot}
          onCommit={handleDataRootCommit}
        />
      </div>
      <div className="fx-preview-canvas" ref={containerRef} />
      {!doc && <div className="fx-preview-empty">尚未載入特效</div>}
    </div>
  )
}

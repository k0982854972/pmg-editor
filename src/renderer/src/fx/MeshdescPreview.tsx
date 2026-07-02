/**
 * Live preview pane for the meshdesc binding tab: renders the sibling PMG
 * weapon model plus the particle simulation of every Effect row whose
 * effect_name resolves in the selected effect-source document, anchored at
 * the row's parent mesh translation + scaled offset (approximation — see
 * meshdescPreviewModel.ts). Re-anchors/re-compiles on any attachment edit;
 * all attached emitters loop forever. Exposes window.__meshdescPreviewStats
 * in dev builds for smoke tests.
 */
import { useEffect, useMemo, useRef } from 'react'
import type { EffectDocument } from '../../../core/fx/effectXml'
import type { MeshdescDocument, MeshdescEffect } from '../../../core/fx/meshdesc'
import type { PmgFile } from '../../../core/pmg/types'
import type { CompiledEmitter, ParticleState } from './preview/particleModel'
import {
  compileEmitter,
  createInitialState,
  createSeededRng,
  stepParticles
} from './preview/particleModel'
import type { AnchorResolution } from './meshdescPreviewModel'
import { anchorSourcesOf, effectAnchorWorld, resolveEmitterIndex } from './meshdescPreviewModel'
import type { MeshdescSceneHandle } from './meshdescScene'
import { createMeshdescScene } from './meshdescScene'

export interface ModelStatus {
  readonly isLoaded: boolean
  readonly text: string
}

interface MeshdescPreviewProps {
  readonly doc: MeshdescDocument | null
  readonly pmgFile: PmgFile | null
  readonly modelStatus: ModelStatus | null
  readonly effectSource: EffectDocument | null
}

interface AttachmentPlan {
  readonly key: string
  readonly effect: MeshdescEffect
  readonly compiled: CompiledEmitter | null
  readonly anchor: AnchorResolution
}

interface ActiveAttachmentPlan extends AttachmentPlan {
  readonly compiled: CompiledEmitter
}

interface AttachmentSim {
  state: ParticleState
  rng: () => number
}

const RNG_SEED = 1234

const totalParticles = (state: ParticleState): number =>
  state.effectTypes.reduce((sum, effectType) => sum + effectType.particles.length, 0)

function buildAttachmentPlans(
  doc: MeshdescDocument | null,
  effectSource: EffectDocument | null,
  pmgFile: PmgFile | null
): readonly AttachmentPlan[] {
  if (!doc) return []
  const meshes = pmgFile ? anchorSourcesOf(pmgFile) : []
  return doc.groups.flatMap((group, groupIndex) =>
    group.effects.map((effect, effectIndex): AttachmentPlan => {
      const emitterIndex = effectSource
        ? resolveEmitterIndex(effectSource, effect.effectName)
        : null
      const compiled =
        effectSource && emitterIndex !== null ? compileEmitter(effectSource, emitterIndex) : null
      return {
        key: `${groupIndex}:${effectIndex}`,
        effect,
        compiled,
        anchor: effectAnchorWorld(meshes, effect)
      }
    })
  )
}

function attachmentStatusText(plan: AttachmentPlan, hasSource: boolean): string {
  if (!hasSource) return '✗ 尚未選擇特效來源檔'
  if (!plan.compiled) return `✗ 特效來源中找不到「${plan.effect.effectName || '（空白）'}」，略過`
  if (!plan.anchor.isResolved) return `✓ ${plan.effect.effectName}（骨骼未解析，錨定於原點）`
  return `✓ ${plan.effect.effectName} @ ${plan.effect.parent}`
}

export function MeshdescPreview({
  doc,
  pmgFile,
  modelStatus,
  effectSource
}: MeshdescPreviewProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<MeshdescSceneHandle | null>(null)
  const simsRef = useRef<AttachmentSim[]>([])
  const activeRef = useRef<readonly AttachmentPlan[]>([])

  const plans = useMemo(
    () => buildAttachmentPlans(doc, effectSource, pmgFile),
    [doc, effectSource, pmgFile]
  )
  const activePlans = useMemo(
    () => plans.filter((plan): plan is ActiveAttachmentPlan => plan.compiled !== null),
    [plans]
  )

  // Scene lifecycle: one WebGL context per mount; the frame callback steps
  // every attached emitter's sim (looping) and refreshes instance buffers.
  useEffect(() => {
    const container = containerRef.current
    if (!container) return undefined
    const handle = createMeshdescScene(container, (dtMs) => {
      const active = activeRef.current
      const states = simsRef.current.map((sim, index) => {
        const compiled = active[index]?.compiled
        if (!compiled) return null
        const finished = sim.state.timeMs >= compiled.durationMs && totalParticles(sim.state) === 0
        if (finished) {
          sim.state = createInitialState(compiled)
          sim.rng = createSeededRng(RNG_SEED)
        }
        sim.state = stepParticles(sim.state, dtMs, compiled, sim.rng)
        return sim.state
      })
      sceneRef.current?.updateParticles(states)
    })
    sceneRef.current = handle
    return () => {
      sceneRef.current = null
      handle.dispose()
    }
  }, [])

  useEffect(() => {
    sceneRef.current?.setModel(pmgFile)
  }, [pmgFile])

  // Rebuild anchored batches and reset sims on any attachment change.
  useEffect(() => {
    activeRef.current = activePlans
    simsRef.current = activePlans.map((plan) => ({
      state: createInitialState(plan.compiled),
      rng: createSeededRng(RNG_SEED)
    }))
    sceneRef.current?.syncAttachments(
      activePlans.map((plan) => ({ compiled: plan.compiled, anchor: plan.anchor.position }))
    )
  }, [activePlans])

  // Dev-only stats hook for automated smoke tests.
  useEffect(() => {
    if (!import.meta.env.DEV) return undefined
    const devWindow = window as unknown as {
      __meshdescPreviewStats?: () => {
        modelLoaded: boolean
        attachments: number
        activeAttachments: number
        particleCount: number
      }
    }
    devWindow.__meshdescPreviewStats = () => ({
      modelLoaded: pmgFile !== null,
      attachments: plans.length,
      activeAttachments: activePlans.length,
      particleCount: simsRef.current.reduce((sum, sim) => sum + totalParticles(sim.state), 0)
    })
    return () => {
      delete devWindow.__meshdescPreviewStats
    }
  }, [pmgFile, plans, activePlans])

  return (
    <div className="fx-preview-panel fx-meshdesc-preview">
      <div className="fx-preview-textures" title="模型與特效綁定的載入狀態">
        {modelStatus && (
          <div
            className={`fx-preview-texture ${modelStatus.isLoaded ? 'is-loaded' : 'is-missing'}`}
            title="與 meshdesc 同名的 .pmg 模型載入狀態"
          >
            <span className="fx-preview-texture-name">模型：{modelStatus.text}</span>
          </div>
        )}
        {plans.map((plan) => {
          const isActive = plan.compiled !== null
          return (
            <div
              key={plan.key}
              className={`fx-preview-texture ${isActive ? 'is-loaded' : 'is-missing'}`}
              title="此綁定列的特效解析狀態"
            >
              <span className="fx-preview-texture-name">
                {plan.effect.name}：{attachmentStatusText(plan, effectSource !== null)}
              </span>
            </div>
          )
        })}
      </div>
      <div className="fx-preview-canvas" ref={containerRef} />
      {!doc && <div className="fx-preview-empty">尚未載入 meshdesc</div>}
    </div>
  )
}

/**
 * Unit tests for the pure FX preview particle simulation
 * (src/renderer/src/fx/preview/particleModel.ts): track parsing/sampling,
 * color interpolation, emitter compilation, spawn/kill lifecycle, count
 * control and determinism with a seeded rng.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseEffectXml } from '../../src/core/fx/effectXml'
import {
  MAX_PARTICLES_PER_TYPE,
  compileEmitter,
  createInitialState,
  createSeededRng,
  parseTrack,
  particleColorOf,
  particleSizeOf,
  sampleColorFrames,
  sampleTrack,
  stepParticles,
  type CompiledEmitter
} from '../../src/renderer/src/fx/preview/particleModel'

const docOf = (emitterBody: string): ReturnType<typeof parseEffectXml> =>
  parseEffectXml(
    new TextEncoder().encode(
      `<?xml version="1.0" encoding="utf-8"?>\n` +
        `<EffectGroup classname="EffectGroup[10]" name="t">\n` +
        `<test_emitter classname="CEmitterType[10]">${emitterBody}</test_emitter>\n` +
        `</EffectGroup>`
    )
  )

const FULL_EMITTER = `
  <EmitterShape classname="CEmitterShapeSphere[10]" radius="0 300 0" position="1 2 3" />
  <EmissionAngleController classname="CEmissionAngleController[11]">0 90 </EmissionAngleController>
  <EffectType classname="CParticleType[10]" gravity_scale="2" align="screen" life_randomness="0.5">
    <Life classname="CLifeController[11]">0 400 </Life>
    <Number classname="CNumberController[11]">0 30 50 0 </Number>
    <Size classname="CSizeController[11]">0 76 </Size>
    <Speed classname="CSpeedController[11]">0 -500 </Speed>
    <Spin classname="CSpinController[11]">0 90 </Spin>
    <SizeOverLife classname="CSizeOverLifeController[11]">0 2 1 4 </SizeOverLife>
    <ColorOverLife classname="CColorOverLifeController[11]">0 FF000000 1 FFFFFFFF </ColorOverLife>
    <Texture tas_classname="tas_dynamicgrid[10]" texture="effect_a" tex_width="512" tex_height="256"
      x="0" y="128" width="128" height="128" column="2" row="2" ani_loop_per_sec="1" />
  </EffectType>`

const compiledOf = (body: string): CompiledEmitter => {
  const compiled = compileEmitter(docOf(body), 0)
  if (!compiled) throw new Error('expected emitter to compile')
  return compiled
}

describe('parseTrack / sampleTrack', () => {
  it('parses whitespace-separated time/value pairs', () => {
    expect(parseTrack('0 26 1500 30 3000 26 ')).toEqual([
      { time: 0, value: 26 },
      { time: 1500, value: 30 },
      { time: 3000, value: 26 }
    ])
  })

  it('drops non-finite pairs and tolerates empty text', () => {
    expect(parseTrack('')).toEqual([])
    expect(parseTrack('0 5 abc 9')).toEqual([{ time: 0, value: 5 }])
  })

  it('clamps outside the key range and interpolates linearly inside', () => {
    const track = parseTrack('100 10 300 30')
    expect(sampleTrack(track, 0, 0)).toBe(10)
    expect(sampleTrack(track, 500, 0)).toBe(30)
    expect(sampleTrack(track, 200, 0)).toBeCloseTo(20)
  })

  it('returns the fallback for an empty track', () => {
    expect(sampleTrack([], 50, 7)).toBe(7)
  })
})

describe('sampleColorFrames', () => {
  it('interpolates rgba linearly on 0..1 life', () => {
    const frames = [
      { time: 0, a: 0, r: 255, g: 0, b: 0 },
      { time: 1, a: 255, r: 0, g: 0, b: 255 }
    ]
    const mid = sampleColorFrames(frames, 0.5)
    expect(mid.r).toBeCloseTo(0.5)
    expect(mid.g).toBeCloseTo(0)
    expect(mid.b).toBeCloseTo(0.5)
    expect(mid.a).toBeCloseTo(0.5)
  })

  it('clamps before the first and after the last frame', () => {
    const frames = [{ time: 0.2, a: 255, r: 128, g: 128, b: 128 }]
    expect(sampleColorFrames(frames, 0).r).toBeCloseTo(128 / 255)
    expect(sampleColorFrames(frames, 1).a).toBeCloseTo(1)
  })

  it('returns opaque white for empty frames', () => {
    expect(sampleColorFrames([], 0.5)).toEqual({ r: 1, g: 1, b: 1, a: 1 })
  })
})

describe('compileEmitter', () => {
  it('returns null for an out-of-range emitter index', () => {
    expect(compileEmitter(docOf(''), 5)).toBeNull()
  })

  it('extracts shape, tracks, color frames and atlas cell', () => {
    const compiled = compiledOf(FULL_EMITTER)
    expect(compiled.name).toBe('test_emitter')
    expect(compiled.shape.kind).toBe('sphere')
    expect(compiled.shape.radius).toBe(300)
    expect(compiled.shape.position).toEqual([1, 2, 3])
    expect(compiled.effectTypes).toHaveLength(1)
    const effectType = compiled.effectTypes[0]
    expect(effectType.life).toEqual([{ time: 0, value: 400 }])
    expect(effectType.number).toEqual([
      { time: 0, value: 30 },
      { time: 50, value: 0 }
    ])
    expect(effectType.gravityScale).toBe(2)
    expect(effectType.lifeRandomness).toBe(0.5)
    expect(effectType.colorOverLife).toHaveLength(2)
    expect(effectType.atlas).toMatchObject({
      texture: 'effect_a',
      mode: 'dynamicgrid',
      texWidth: 512,
      texHeight: 256,
      x: 0,
      y: 128,
      width: 128,
      height: 128,
      column: 2,
      row: 2
    })
  })

  it('applies documented defaults when controllers are missing', () => {
    const compiled = compiledOf('<EffectType classname="CParticleType[10]" />')
    const effectType = compiled.effectTypes[0]
    expect(sampleTrack(effectType.life, 0, -1)).toBe(1000)
    expect(sampleTrack(effectType.number, 0, -1)).toBe(10)
    expect(sampleTrack(effectType.size, 0, -1)).toBe(1)
    expect(sampleTrack(effectType.speed, 0, -1)).toBe(0)
    expect(compiled.shape.kind).toBe('point')
    expect(effectType.atlas).toBeNull()
  })
})

describe('stepParticles', () => {
  it('spawns up to the Number target sampled at emitter time', () => {
    const compiled = compiledOf(FULL_EMITTER)
    const next = stepParticles(createInitialState(compiled), 16, compiled, createSeededRng(1))
    expect(next.timeMs).toBe(16)
    expect(next.effectTypes[0].particles).toHaveLength(30)
  })

  it('kills particles at end of life and stops spawning when target drops', () => {
    const compiled = compiledOf(FULL_EMITTER)
    let state = stepParticles(createInitialState(compiled), 16, compiled, createSeededRng(1))
    // Number falls to 0 after 50ms; max life is 400ms — run past both.
    for (let i = 0; i < 40; i++) state = stepParticles(state, 16, compiled, createSeededRng(i))
    expect(state.effectTypes[0].particles).toHaveLength(0)
  })

  it('caps the particle count per effect type', () => {
    const compiled = compiledOf(
      `<EffectType classname="CParticleType[10]"><Number>0 90000</Number></EffectType>`
    )
    const state = stepParticles(createInitialState(compiled), 16, compiled, createSeededRng(1))
    expect(state.effectTypes[0].particles).toHaveLength(MAX_PARTICLES_PER_TYPE)
  })

  it('does not mutate the previous state', () => {
    const compiled = compiledOf(FULL_EMITTER)
    const initial = createInitialState(compiled)
    const first = stepParticles(initial, 16, compiled, createSeededRng(1))
    const snapshot = JSON.stringify(first)
    stepParticles(first, 16, compiled, createSeededRng(2))
    expect(JSON.stringify(first)).toBe(snapshot)
    expect(initial.effectTypes[0].particles).toHaveLength(0)
  })

  it('is deterministic for a given seeded rng', () => {
    const compiled = compiledOf(FULL_EMITTER)
    const run = (): unknown => {
      let state = createInitialState(compiled)
      const rng = createSeededRng(42)
      for (let i = 0; i < 10; i++) state = stepParticles(state, 16, compiled, rng)
      return state
    }
    expect(run()).toEqual(run())
  })

  it('randomises spawn positions on a sphere shell via the rng', () => {
    const compiled = compiledOf(FULL_EMITTER)
    const state = stepParticles(createInitialState(compiled), 16, compiled, createSeededRng(7))
    const [first, second] = state.effectTypes[0].particles
    expect(first.x).not.toBeCloseTo(second.x)
    const distance = Math.hypot(first.x - 1, first.y - 2, first.z - 3)
    expect(distance).toBeGreaterThan(0)
    expect(distance).toBeLessThanOrEqual(300 + 1e-6)
  })
})

describe('per-particle derived attributes', () => {
  it('scales birth size by SizeOverLife at the current life fraction', () => {
    const compiled = compiledOf(FULL_EMITTER)
    const state = stepParticles(createInitialState(compiled), 16, compiled, createSeededRng(1))
    const particle = state.effectTypes[0].particles[0]
    const effectType = compiled.effectTypes[0]
    const frac = particle.age / particle.life
    const expected = particle.birthSize * sampleTrack(effectType.sizeOverLife, frac, 1)
    expect(particleSizeOf(particle, effectType)).toBeCloseTo(expected)
    expect(particle.birthSize).toBeCloseTo(76)
  })

  it('samples ColorOverLife at the current life fraction', () => {
    const compiled = compiledOf(FULL_EMITTER)
    const state = stepParticles(createInitialState(compiled), 16, compiled, createSeededRng(1))
    const particle = state.effectTypes[0].particles[0]
    const color = particleColorOf(particle, compiled.effectTypes[0])
    const frac = particle.age / particle.life
    expect(color.a).toBeCloseTo(1)
    expect(color.r).toBeCloseTo(frac, 2)
  })
})

// Real-corpus robustness: every emitter in the sample effects must compile
// and survive a few simulation steps without throwing. Runs only when the
// gitignored corpus directory is populated (mirrors tests/fx/fxCorpus.test.ts).
const FX_DIR = join(__dirname, '..', '..', 'samples', 'corpus', 'gfx', 'fx', 'effect')
const xmlFiles = existsSync(FX_DIR)
  ? readdirSync(FX_DIR).filter((name) => name.toLowerCase().endsWith('.xml'))
  : []

describe.skipIf(xmlFiles.length === 0)('fx preview corpus compile', () => {
  it('compiles and steps every corpus emitter without throwing', { timeout: 120_000 }, () => {
    const failures: string[] = []
    for (const name of xmlFiles) {
      try {
        const doc = parseEffectXml(new Uint8Array(readFileSync(join(FX_DIR, name))))
        for (let index = 0; index < doc.emitters.length; index++) {
          const compiled = compileEmitter(doc, index)
          if (!compiled) {
            failures.push(`${name}[${index}]: compileEmitter returned null`)
            continue
          }
          let state = createInitialState(compiled)
          const rng = createSeededRng(1)
          for (let step = 0; step < 5; step++) state = stepParticles(state, 16, compiled, rng)
        }
      } catch (error) {
        failures.push(`${name}: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
    expect(failures, failures.slice(0, 20).join('\n')).toEqual([])
  })
})

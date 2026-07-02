/**
 * Pure particle simulation for the FX preview (no three.js imports).
 * Public entry point: re-exports the track primitives (particleTracks.ts)
 * and emitter compiler (particleCompile.ts) alongside the stepper.
 *
 * The Mabinogi engine internals are undocumented; this module implements a
 * documented best-effort approximation with these assumptions:
 * - Track times are milliseconds of emitter time for Life/Number/Size/
 *   Speed/Spin/Angle and a 0..1 life fraction for *OverLife tracks;
 *   sampling clamps outside the key range and lerps inside.
 * - Emission spawns up to the Number target (sampled at step start, capped
 *   at MAX_PARTICLES_PER_TYPE); newborn particles integrate from the next
 *   step. Velocity is a random direction inside a cone around +Y whose
 *   half-angle comes from EmissionAngleController (default 45 deg), scaled
 *   by the Speed track (units/second; negative speed inverts direction).
 * - life_randomness shortens each particle's life by up to that fraction;
 *   gravity is 980 units/s^2 * gravity_scale * GravityOverLife along -Y.
 * - Color = ColorOverLife(lifeFrac) multiplied by the first `Color`
 *   controller keyframe (tint); size = Size-at-birth * SizeOverLife.
 * - CEmitterShapeLine/Rect are approximated as points; circle spawns on a
 *   uniform XZ disc, sphere on the shell, hemisphere on the upper shell.
 * - State is immutable: every step returns new arrays/objects (plain
 *   objects instead of typed arrays; <= 500 particles per type keeps this
 *   cheap and unit-test friendly).
 */
import type { CompiledEffectType, CompiledEmitter, CompiledShape } from './particleCompile'
import { DEFAULT_EMISSION_ANGLE_DEG } from './particleCompile'
import type { Rgba } from './particleTracks'
import { sampleColorFrames, sampleTrack } from './particleTracks'

export type {
  AtlasCell,
  CompiledEffectType,
  CompiledEmitter,
  CompiledShape,
  ShapeKind
} from './particleCompile'
export { compileEmitter, DEFAULT_EMISSION_ANGLE_DEG } from './particleCompile'
export type { Rgba, Track, TrackPoint } from './particleTracks'
export { createSeededRng, parseTrack, sampleColorFrames, sampleTrack } from './particleTracks'

export const MAX_PARTICLES_PER_TYPE = 500

const GRAVITY_UNITS_PER_S2 = 980
const DEG_TO_RAD = Math.PI / 180

export interface Particle {
  readonly age: number
  readonly life: number
  readonly x: number
  readonly y: number
  readonly z: number
  readonly dirX: number
  readonly dirY: number
  readonly dirZ: number
  readonly birthSpeed: number
  readonly birthSize: number
  readonly rotation: number
  readonly spinSpeed: number
  readonly gravityVelocityY: number
}

export interface EffectTypeState {
  readonly particles: readonly Particle[]
}

export interface ParticleState {
  readonly timeMs: number
  readonly effectTypes: readonly EffectTypeState[]
}

export function createInitialState(compiled: CompiledEmitter): ParticleState {
  return { timeMs: 0, effectTypes: compiled.effectTypes.map(() => ({ particles: [] })) }
}

type Vec3 = readonly [number, number, number]

function spawnOffset(shape: CompiledShape, rng: () => number): Vec3 {
  if (shape.kind === 'point' || shape.radius <= 0) return [0, 0, 0]
  if (shape.kind === 'circle') {
    const angle = rng() * Math.PI * 2
    const radius = shape.radius * Math.sqrt(rng())
    return [Math.cos(angle) * radius, 0, Math.sin(angle) * radius]
  }
  // Sphere / hemisphere shell.
  const yUnit = shape.kind === 'hemisphere' ? rng() : rng() * 2 - 1
  const phi = rng() * Math.PI * 2
  const ring = Math.sqrt(Math.max(0, 1 - yUnit * yUnit))
  return [
    Math.cos(phi) * ring * shape.radius,
    yUnit * shape.radius,
    Math.sin(phi) * ring * shape.radius
  ]
}

/** Random unit direction inside a cone of `halfAngleDeg` around +Y. */
function coneDirection(halfAngleDeg: number, rng: () => number): Vec3 {
  const cosMin = Math.cos(Math.min(Math.abs(halfAngleDeg), 180) * DEG_TO_RAD)
  const cosTheta = cosMin + (1 - cosMin) * rng()
  const sinTheta = Math.sqrt(Math.max(0, 1 - cosTheta * cosTheta))
  const phi = rng() * Math.PI * 2
  return [Math.cos(phi) * sinTheta, cosTheta, Math.sin(phi) * sinTheta]
}

function spawnParticle(
  compiled: CompiledEmitter,
  effectType: CompiledEffectType,
  timeMs: number,
  rng: () => number
): Particle {
  const [ox, oy, oz] = spawnOffset(compiled.shape, rng)
  const [px, py, pz] = compiled.shape.position
  const halfAngle = sampleTrack(compiled.emissionAngle, timeMs, DEFAULT_EMISSION_ANGLE_DEG)
  const [dirX, dirY, dirZ] = coneDirection(halfAngle, rng)
  const baseLife = Math.max(1, sampleTrack(effectType.life, timeMs, 1000))
  const lifeShrink = Math.min(Math.max(effectType.lifeRandomness, 0), 1) * rng()
  return {
    age: 0,
    life: baseLife * (1 - lifeShrink),
    x: px + ox,
    y: py + oy,
    z: pz + oz,
    dirX,
    dirY,
    dirZ,
    birthSpeed: sampleTrack(effectType.speed, timeMs, 0),
    birthSize: sampleTrack(effectType.size, timeMs, 1),
    rotation: sampleTrack(effectType.angle, timeMs, 0) * DEG_TO_RAD,
    spinSpeed: sampleTrack(effectType.spin, timeMs, 0) * DEG_TO_RAD,
    gravityVelocityY: 0
  }
}

function integrateParticle(
  particle: Particle,
  effectType: CompiledEffectType,
  dtSec: number
): Particle {
  const frac = Math.min(particle.age / particle.life, 1)
  const speedNow = particle.birthSpeed * sampleTrack(effectType.speedOverLife, frac, 1)
  const gravityPull =
    GRAVITY_UNITS_PER_S2 *
    effectType.gravityScale *
    sampleTrack(effectType.gravityOverLife, frac, 1)
  const gravityVelocityY = particle.gravityVelocityY - gravityPull * dtSec
  return {
    ...particle,
    age: particle.age + dtSec * 1000,
    x: particle.x + particle.dirX * speedNow * dtSec,
    y: particle.y + particle.dirY * speedNow * dtSec + gravityVelocityY * dtSec,
    z: particle.z + particle.dirZ * speedNow * dtSec,
    rotation:
      particle.rotation +
      particle.spinSpeed * sampleTrack(effectType.spinOverLife, frac, 1) * dtSec,
    gravityVelocityY
  }
}

/**
 * Advance the simulation by dtMs: age/move/kill existing particles, then
 * spawn up to the Number target sampled at step start. Pure: returns a new
 * state; determinism requires an injected rng.
 */
export function stepParticles(
  state: ParticleState,
  dtMs: number,
  compiled: CompiledEmitter,
  rng: () => number
): ParticleState {
  const dtSec = dtMs / 1000
  const effectTypes = compiled.effectTypes.map((effectType, index) => {
    const previous = state.effectTypes[index]?.particles ?? []
    const survivors = previous
      .filter((particle) => particle.age + dtMs < particle.life)
      .map((particle) => integrateParticle(particle, effectType, dtSec))
    const target = Math.min(
      MAX_PARTICLES_PER_TYPE,
      Math.max(0, Math.round(sampleTrack(effectType.number, state.timeMs, 10)))
    )
    const spawned: Particle[] = []
    for (let i = survivors.length; i < target; i++) {
      spawned.push(spawnParticle(compiled, effectType, state.timeMs, rng))
    }
    return { particles: [...survivors, ...spawned] }
  })
  return { timeMs: state.timeMs + dtMs, effectTypes }
}

/** Current render size: birth size scaled by SizeOverLife(lifeFrac). */
export function particleSizeOf(particle: Particle, effectType: CompiledEffectType): number {
  const frac = Math.min(particle.age / particle.life, 1)
  return particle.birthSize * sampleTrack(effectType.sizeOverLife, frac, 1)
}

/** Current render color: ColorOverLife(lifeFrac) multiplied by the tint. */
export function particleColorOf(particle: Particle, effectType: CompiledEffectType): Rgba {
  const frac = Math.min(particle.age / particle.life, 1)
  const color = sampleColorFrames(effectType.colorOverLife, frac)
  const { tint } = effectType
  return { r: color.r * tint.r, g: color.g * tint.g, b: color.b * tint.b, a: color.a * tint.a }
}

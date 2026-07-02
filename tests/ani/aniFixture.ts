/**
 * Hand-built Mabinogi .ani file fixtures for tests. Layout follows the
 * community 010 Editor template, verified against samples/corpus/**\/*.ani:
 * "pa!\0" magic + 2 version bytes + header fields, then AniBone records
 * (24-byte header + frameCount x 36-byte AniFrame), then an optional second
 * AniBone array whose count is header unk10. Consumed by tests/ani/*.test.ts.
 */
import { BinaryWriter } from '../../src/core/binary/cursor'

export interface AniFrameFixture {
  readonly time: number
  readonly px: number
  readonly py: number
  readonly pz: number
  readonly unk: number
  readonly qx: number
  readonly qy: number
  readonly qz: number
  readonly qw: number
}

export interface AniBoneFixture {
  readonly unk39?: number
  readonly unk34?: number
  readonly time: number
  readonly frames: readonly AniFrameFixture[]
  /** Written as the bone frameCount field; defaults to frames.length. */
  readonly frameCountOverride?: number
  readonly unk37?: number
  readonly unk38?: number
}

export interface AniFixtureOptions {
  /** 4-byte signature; defaults to the valid "pa!\0". */
  readonly magic?: string
  readonly version?: readonly [number, number]
  readonly shorts?: readonly [number, number, number, number]
  readonly unk5?: number
  readonly unk13?: number
  readonly unk14?: number
  readonly bones: readonly AniBoneFixture[]
  readonly secondBones?: readonly AniBoneFixture[]
}

export function makeFrame(overrides: Partial<AniFrameFixture> = {}): AniFrameFixture {
  return { time: 0, px: 0, py: 0, pz: 0, unk: 0, qx: 0, qy: 0, qz: 0, qw: 1, ...overrides }
}

function writeBone(w: BinaryWriter, bone: AniBoneFixture): void {
  w.i32(bone.unk39 ?? 0)
  w.i16(bone.frameCountOverride ?? bone.frames.length)
  w.i16(bone.unk34 ?? 0)
  w.i32(bone.time)
  w.i32(bone.frames.length * 36)
  w.i32(bone.unk37 ?? 0)
  w.i32(bone.unk38 ?? 1)
  for (const frame of bone.frames) {
    w.i32(frame.time)
    w.f32(frame.px)
    w.f32(frame.py)
    w.f32(frame.pz)
    w.f32(frame.unk)
    w.f32(frame.qx)
    w.f32(frame.qy)
    w.f32(frame.qz)
    w.f32(frame.qw)
  }
}

export function buildAniFixture(options: AniFixtureOptions): Uint8Array {
  const w = new BinaryWriter()
  const magic = options.magic ?? 'pa!\0'
  w.bytes(Uint8Array.from(magic, (c) => c.charCodeAt(0) & 0xff))
  const [versionA, versionB] = options.version ?? [1, 3]
  w.u8(versionA)
  w.u8(versionB)
  const shorts = options.shorts ?? [0, 0, 30, 160]
  for (const value of shorts) w.i16(value)
  w.i32(options.unk5 ?? 4800)
  w.i32(options.bones.length)
  for (let i = 0; i < 4; i += 1) w.i32(0)
  w.i32(options.secondBones?.length ?? 0)
  w.i32(0)
  w.i32(0)
  w.f32(options.unk13 ?? 0)
  w.f32(options.unk14 ?? 1)
  for (const bone of options.bones) writeBone(w, bone)
  for (const bone of options.secondBones ?? []) writeBone(w, bone)
  return w.toUint8Array()
}

/**
 * Hand-built Mabinogi .frm skeleton file fixtures for tests. Layout follows
 * the community 010 Editor template, verified against samples/corpus/**\/*.frm:
 * "pf!\0" magic + 2 version bytes + int16 boneCount, then 260-byte bone
 * records (3 x 64-byte matrix, 32-byte name, id, parentId, int16 unk,
 * 2 x 16-byte quaternion), then a trailer. Consumed by tests/frm/*.test.ts
 * and tests/viewport/skeleton.test.ts.
 */
import { BinaryWriter, makeFixedString } from '../../src/core/binary/cursor'

export const IDENTITY_MATRIX: readonly number[] = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]

/** Row-major translation matrix matching the on-disk convention (t at 3/7/11). */
export function translationMatrix(x: number, y: number, z: number): readonly number[] {
  return [1, 0, 0, x, 0, 1, 0, y, 0, 0, 1, z, 0, 0, 0, 1]
}

/** Row-major inverse of translationMatrix(x, y, z). */
export function inverseTranslationMatrix(x: number, y: number, z: number): readonly number[] {
  return translationMatrix(-x, -y, -z)
}

export interface FrmBoneFixture {
  readonly name: string
  readonly id: number
  readonly parentId: number
  readonly unk1?: number
  readonly globalToLocal?: readonly number[]
  readonly localToGlobal?: readonly number[]
  readonly link?: readonly number[]
  readonly quat1?: readonly [number, number, number, number]
  readonly quat2?: readonly [number, number, number, number]
}

export interface FrmFixtureOptions {
  /** 4-byte signature; defaults to the valid "pf!\0". */
  readonly magic?: string
  readonly version?: readonly [number, number]
  readonly bones: readonly FrmBoneFixture[]
  /** Written as the boneCount field; defaults to bones.length. */
  readonly boneCountOverride?: number
  /** Trailer payload after the int32 size prefix; defaults to empty. */
  readonly trailerPayload?: Uint8Array
}

function writeMatrix(w: BinaryWriter, values: readonly number[]): void {
  for (let i = 0; i < 16; i += 1) w.f32(values[i] ?? 0)
}

function writeBone(w: BinaryWriter, bone: FrmBoneFixture): void {
  writeMatrix(w, bone.globalToLocal ?? IDENTITY_MATRIX)
  writeMatrix(w, bone.localToGlobal ?? IDENTITY_MATRIX)
  writeMatrix(w, bone.link ?? IDENTITY_MATRIX)
  w.fixedString(makeFixedString(bone.name, 32), 32)
  w.u8(bone.id)
  w.u8(bone.parentId)
  w.i16(bone.unk1 ?? 0)
  for (const value of bone.quat1 ?? [0, 0, 0, 1]) w.f32(value)
  for (const value of bone.quat2 ?? [0, 0, 0, 1]) w.f32(value)
}

export function buildFrmFixture(options: FrmFixtureOptions): Uint8Array {
  const w = new BinaryWriter()
  const magic = options.magic ?? 'pf!\0'
  w.bytes(Uint8Array.from(magic, (c) => c.charCodeAt(0) & 0xff))
  const [versionA, versionB] = options.version ?? [1, 0]
  w.u8(versionA)
  w.u8(versionB)
  w.i16(options.boneCountOverride ?? options.bones.length)
  for (const bone of options.bones) writeBone(w, bone)
  const payload = options.trailerPayload ?? new Uint8Array(0)
  w.i32(payload.byteLength)
  w.bytes(payload)
  return w.toUint8Array()
}

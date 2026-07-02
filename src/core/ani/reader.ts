/**
 * Read-only parser for Mabinogi .ani skeletal keyframe animations, built on
 * BinaryReader (src/core/binary/cursor.ts, little-endian). Layout follows the
 * community 010 Editor template and was verified against all corpus samples:
 * "pa!\0" + version bytes + header, AniBone[boneCount], then an optional
 * second AniBone array (header unk10). Frame blocks are skipped by
 * transformsSize, which is authoritative when frameCount disagrees.
 * Consumed by tests/ani/reader.test.ts and the 動畫 inspector UI.
 */
import { BinaryReader } from '../binary/cursor'
import type { AniBone, AniFile, AniFrame, AniHeader } from './types'
import { ANI_FRAME_SIZE } from './types'

export class AniParseError extends Error {
  constructor(
    message: string,
    readonly offset: number
  ) {
    super(`${message} (offset ${offset})`)
    this.name = 'AniParseError'
  }
}

const ANI_MAGIC = 'pa!\0'

function readHeader(r: BinaryReader): AniHeader {
  const raw = r.bytes(4)
  const magic = String.fromCharCode(raw[0], raw[1], raw[2], raw[3])
  if (magic !== ANI_MAGIC) {
    throw new AniParseError(`bad ani signature "${magic}"`, 0)
  }
  return {
    version: [r.u8(), r.u8()],
    unk1: r.i16(),
    unk2: r.i16(),
    unk3: r.i16(),
    unk4: r.i16(),
    unk5: r.i32(),
    boneCount: r.i32(),
    unk6: r.i32(),
    unk7: r.i32(),
    unk8: r.i32(),
    unk9: r.i32(),
    secondBoneCount: r.i32(),
    unk11: r.i32(),
    unk12: r.i32(),
    unk13: r.f32(),
    unk14: r.f32()
  }
}

function readBone(r: BinaryReader): AniBone {
  const start = r.offset
  const unk39 = r.i32()
  const frameCount = r.i16()
  const unk34 = r.i16()
  const timeMs = r.i32()
  const transformsSize = r.i32()
  const unk37 = r.i32()
  const unk38 = r.i32()
  if (transformsSize < 0 || transformsSize > r.remaining) {
    throw new AniParseError(
      `bone frame block size ${transformsSize} exceeds remaining ${r.remaining} bytes`,
      start
    )
  }
  return {
    unk39,
    frameCount,
    unk34,
    timeMs,
    transformsSize,
    unk37,
    unk38,
    frames: r.bytes(transformsSize),
    sizeMismatch: transformsSize !== frameCount * ANI_FRAME_SIZE
  }
}

function readBones(r: BinaryReader, count: number, what: string): AniBone[] {
  if (count < 0 || count * 24 > r.remaining) {
    throw new AniParseError(`implausible ${what} count ${count}`, r.offset)
  }
  const bones: AniBone[] = []
  for (let i = 0; i < count; i += 1) bones.push(readBone(r))
  return bones
}

export function readAni(data: Uint8Array): AniFile {
  const r = new BinaryReader(data)
  try {
    const header = readHeader(r)
    const bones = readBones(r, header.boneCount, 'bone')
    const secondaryBones = readBones(r, header.secondBoneCount, 'secondary bone')
    return { header, bones, secondaryBones }
  } catch (error) {
    if (error instanceof RangeError) {
      throw new AniParseError(`unexpected end of file: ${error.message}`, r.offset)
    }
    throw error
  }
}

/** Keyframes actually stored in the bone's frame block (authoritative). */
export function storedFrameCount(bone: AniBone): number {
  return Math.floor(bone.frames.byteLength / ANI_FRAME_SIZE)
}

/** Decode one keyframe from a bone's raw frame block. */
export function readAniFrame(bone: AniBone, index: number): AniFrame {
  if (index < 0 || index >= storedFrameCount(bone)) {
    throw new RangeError(`frame index ${index} out of range 0..${storedFrameCount(bone) - 1}`)
  }
  const view = new DataView(
    bone.frames.buffer,
    bone.frames.byteOffset + index * ANI_FRAME_SIZE,
    ANI_FRAME_SIZE
  )
  return {
    time: view.getInt32(0, true),
    position: {
      x: view.getFloat32(4, true),
      y: view.getFloat32(8, true),
      z: view.getFloat32(12, true)
    },
    unk: view.getFloat32(16, true),
    rotation: {
      x: view.getFloat32(20, true),
      y: view.getFloat32(24, true),
      z: view.getFloat32(28, true),
      w: view.getFloat32(32, true)
    }
  }
}

/** Total animation duration: the longest bone track time across both arrays. */
export function aniDurationMs(file: AniFile): number {
  let max = 0
  for (const bone of [...file.bones, ...file.secondaryBones]) {
    if (bone.timeMs > max) max = bone.timeMs
  }
  return max
}

/** Sum of stored keyframes across both bone arrays. */
export function aniTotalKeyframes(file: AniFile): number {
  let total = 0
  for (const bone of [...file.bones, ...file.secondaryBones]) {
    total += storedFrameCount(bone)
  }
  return total
}

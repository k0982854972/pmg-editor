/**
 * Data model for Mabinogi .ani skeletal keyframe animation files, following
 * the community 010 Editor template and verified against samples/corpus.
 * Unknown fields keep their template names (unkN). Produced by
 * src/core/ani/reader.ts and consumed by the 動畫 inspector UI
 * (src/renderer/src/ani/AniWorkspace.tsx).
 */

/** Byte size of one serialized AniFrame record. */
export const ANI_FRAME_SIZE = 36

export interface Vec3 {
  readonly x: number
  readonly y: number
  readonly z: number
}

export interface Quat {
  readonly x: number
  readonly y: number
  readonly z: number
  readonly w: number
}

/** One decoded keyframe: time + position + unknown float + rotation quaternion. */
export interface AniFrame {
  readonly time: number
  readonly position: Vec3
  readonly unk: number
  readonly rotation: Quat
}

export interface AniHeader {
  /** Two raw version bytes right after the "pa!\0" signature (observed 1, 3). */
  readonly version: readonly [number, number]
  readonly unk1: number
  readonly unk2: number
  readonly unk3: number
  readonly unk4: number
  readonly unk5: number
  readonly boneCount: number
  readonly unk6: number
  readonly unk7: number
  readonly unk8: number
  readonly unk9: number
  /** Template unk10: element count of the optional second AniBone array. */
  readonly secondBoneCount: number
  readonly unk11: number
  readonly unk12: number
  readonly unk13: number
  readonly unk14: number
}

export interface AniBone {
  readonly unk39: number
  /** Declared keyframe count; trust transformsSize when they disagree. */
  readonly frameCount: number
  readonly unk34: number
  /** Track length as stored in the file (template calls it time, likely ms). */
  readonly timeMs: number
  /** Byte size of the frame block; authoritative for skipping. */
  readonly transformsSize: number
  readonly unk37: number
  readonly unk38: number
  /** Raw frame block bytes; decode individual frames with readAniFrame(). */
  readonly frames: Uint8Array
  /** True when transformsSize !== frameCount * ANI_FRAME_SIZE. */
  readonly sizeMismatch: boolean
}

export interface AniFile {
  readonly header: AniHeader
  readonly bones: readonly AniBone[]
  /** Second AniBone array present when header.secondBoneCount is non-zero. */
  readonly secondaryBones: readonly AniBone[]
}

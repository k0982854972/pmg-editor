/**
 * Data model for Mabinogi .frm skeleton files, following the community
 * 010 Editor template (frm.bt) and verified against samples/corpus/**\/*.frm:
 * "pf!\0" magic + 2 version bytes + int16 boneCount, then 260-byte bone
 * records, then a partially-decoded trailer kept verbatim. Matrix fields stay
 * raw (decode via readMatrix from src/core/pmg/access.ts). Produced by
 * src/core/frm/reader.ts and consumed by the viewport skeleton builder.
 */
import type { FixedString } from '../binary/cursor'

/** Byte size of one serialized bone record: 3 matrices + name + ids + quats. */
export const FRM_BONE_SIZE = 260

/** Byte size of one raw 4x4 float matrix field. */
export const FRM_MATRIX_SIZE = 64

/** parentId marker used by root bones in every corpus sample. */
export const FRM_ROOT_PARENT_ID = 0xff

export interface FrmQuat {
  readonly x: number
  readonly y: number
  readonly z: number
  readonly w: number
}

export interface FrmBone {
  /** 64 bytes: 16 LE f32, row-major with translation at indices 3/7/11. */
  readonly globalToLocal: Uint8Array
  /** 64 bytes: inverse of globalToLocal (bind pose world transform). */
  readonly localToGlobal: Uint8Array
  /** 64 bytes: template "link" matrix, purpose partially decoded. */
  readonly link: Uint8Array
  /** 32-byte bone name; "_" prefix = animated, "-" prefix = helper. */
  readonly name: FixedString
  /** Bone id; equals the array index in every corpus sample. */
  readonly id: number
  /** Parent bone id, or FRM_ROOT_PARENT_ID (0xFF) for roots. */
  readonly parentId: number
  readonly unk1: number
  /** Template unk2; may contain non-finite garbage (seen in corpus). */
  readonly quat1: FrmQuat
  /** Template unk3; may contain non-finite garbage (seen in corpus). */
  readonly quat2: FrmQuat
}

export interface FrmFile {
  /** Two raw version bytes after the "pf!\0" signature (observed 1, 0). */
  readonly version: readonly [number, number]
  readonly bones: readonly FrmBone[]
  /**
   * Everything after the bone table, verbatim. Starts with int32 unk1Size
   * (= trailer.byteLength - 4 in every corpus sample) but stays undecoded.
   */
  readonly trailer: Uint8Array
}

/** True for bones that have no parent (0xFF marker or self-parented). */
export function isFrmRootBone(bone: FrmBone): boolean {
  return bone.parentId === FRM_ROOT_PARENT_ID || bone.parentId === bone.id
}

/**
 * Read-only parser for Mabinogi .frm skeleton files, built on BinaryReader
 * (src/core/binary/cursor.ts, little-endian). Layout follows the community
 * 010 Editor template and was verified against all samples/corpus skeletons:
 * "pf!\0" + 2 version bytes + int16 boneCount, FRM_BONE_SIZE-byte bone
 * records, then a partially-decoded trailer kept verbatim. Consumed by
 * tests/frm/*.test.ts and the viewport skeleton builder
 * (src/renderer/src/viewport/skeleton.ts).
 */
import { BinaryReader } from '../binary/cursor'
import type { FrmBone, FrmFile, FrmQuat } from './types'
import { FRM_BONE_SIZE, FRM_MATRIX_SIZE } from './types'

export class FrmParseError extends Error {
  constructor(
    message: string,
    readonly offset: number
  ) {
    super(`${message} (offset ${offset})`)
    this.name = 'FrmParseError'
  }
}

const FRM_MAGIC = 'pf!\0'
const BONE_NAME_SIZE = 32

function readQuat(r: BinaryReader): FrmQuat {
  return { x: r.f32(), y: r.f32(), z: r.f32(), w: r.f32() }
}

function readBone(r: BinaryReader): FrmBone {
  return {
    globalToLocal: r.bytes(FRM_MATRIX_SIZE),
    localToGlobal: r.bytes(FRM_MATRIX_SIZE),
    link: r.bytes(FRM_MATRIX_SIZE),
    name: r.fixedString(BONE_NAME_SIZE),
    id: r.u8(),
    parentId: r.u8(),
    unk1: r.i16(),
    quat1: readQuat(r),
    quat2: readQuat(r)
  }
}

export function readFrm(data: Uint8Array): FrmFile {
  const r = new BinaryReader(data)
  try {
    const raw = r.bytes(4)
    const magic = String.fromCharCode(raw[0], raw[1], raw[2], raw[3])
    if (magic !== FRM_MAGIC) {
      throw new FrmParseError(`bad frm signature "${magic}"`, 0)
    }
    const version: readonly [number, number] = [r.u8(), r.u8()]
    const boneCount = r.i16()
    if (boneCount < 0 || boneCount * FRM_BONE_SIZE > r.remaining) {
      throw new FrmParseError(`implausible bone count ${boneCount}`, r.offset - 2)
    }
    const bones: FrmBone[] = []
    for (let i = 0; i < boneCount; i += 1) bones.push(readBone(r))
    return { version, bones, trailer: r.bytes(r.remaining) }
  } catch (error) {
    if (error instanceof RangeError) {
      throw new FrmParseError(`unexpected end of file: ${error.message}`, r.offset)
    }
    throw error
  }
}

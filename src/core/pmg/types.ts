/**
 * PMG data model. Geometry blocks are kept as raw bytes (sliced verbatim from
 * the file) so that an untouched model always serializes byte-identically;
 * typed access goes through access.ts helpers.
 */
import type { FixedString } from '../binary/cursor'

export type PmVersion = '1.7' | '2.0' | '3.0'

/** 204-byte mesh header entry inside a mesh group. */
export interface MeshHeaderInfo {
  readonly meshSize: number
  readonly boneName: FixedString
  readonly meshName: FixedString
  readonly jointName: FixedString
  readonly index: number
  readonly unk9: number
}

/** The 20-int32 count table. Sizes are recomputed on write from the raw blocks. */
export interface MeshCounts {
  readonly indexCount: number
  readonly faceCount: number
  readonly stripIndexCount: number
  readonly stripFaceCount: number
  readonly vertexCount: number
  readonly skinCount: number
  readonly physicsCount: number
  readonly isAnimated: number
  readonly morphFrameSize: number
  readonly morphFrameCount: number
  readonly unk18: number
  readonly unk19: number
  readonly unk20: number
  readonly unk21: number
  readonly unk22: number
  readonly indicesSize: number
  readonly stripIndicesSize: number
  readonly verticesSize: number
  readonly skinsSize: number
  readonly unk23: number
}

/** One `pm!` block. */
export interface PmMesh {
  readonly version: PmVersion
  readonly headerInfo: MeshHeaderInfo
  readonly boneName: FixedString
  readonly meshName: FixedString
  readonly jointName: FixedString
  readonly stateName: FixedString
  readonly normalName: FixedString
  readonly colorName: FixedString
  readonly textureName: FixedString
  /** v3.0 only: extra string between normalName and colorName. */
  readonly unk25: FixedString | null
  /** 64 bytes each: 16 LE f32 (bone-local / world transform). */
  readonly matrix1: Uint8Array
  readonly matrix2: Uint8Array
  readonly index: number
  readonly unk8: Uint8Array
  readonly isTextureMapped: number
  readonly unk10: Uint8Array
  readonly counts: MeshCounts
  /** Bounding block payload (typically 60 bytes = 5 float3), verbatim. */
  readonly bounding: Uint8Array
  /** Triangle-list indices, LE u16, verbatim. */
  readonly indices: Uint8Array
  /** Triangle-strip indices, LE u16, verbatim. */
  readonly stripIndices: Uint8Array
  /** 36-byte vertex records, verbatim. */
  readonly vertices: Uint8Array
  /** 16-byte skin records, verbatim. */
  readonly skins: Uint8Array
  /** Opaque 32-byte physics records, verbatim. */
  readonly physics: Uint8Array
  /** Everything after physics up to the block's `size` (morph data etc.), verbatim. */
  readonly trailer: Uint8Array
}

export interface MeshGroup {
  readonly name: FixedString
  readonly unk2: FixedString
  readonly meshes: readonly PmMesh[]
}

export interface PmgFile {
  /** File version bytes (expected 02 01), verbatim. */
  readonly fileVersion: Uint8Array
  readonly name: FixedString
  readonly unk1: Uint8Array
  /** Bytes between the structural header end and headerSize, verbatim. */
  readonly headerPadding: Uint8Array
  readonly groups: readonly MeshGroup[]
}

export interface Vertex {
  readonly x: number
  readonly y: number
  readonly z: number
  readonly nx: number
  readonly ny: number
  readonly nz: number
  readonly b: number
  readonly g: number
  readonly r: number
  readonly a: number
  readonly u: number
  readonly v: number
}

export interface Skin {
  readonly vertexIndex: number
  readonly unkA: number
  readonly weight: number
  readonly unkB: number
}

export const VERTEX_STRIDE = 36
export const SKIN_STRIDE = 16
export const PHYSICS_STRIDE = 32
export const MESH_HEADER_SIZE = 204

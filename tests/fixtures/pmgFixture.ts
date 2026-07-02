/**
 * Hand-rolled PMG binary fixtures built field-by-field from the reverse-engineered
 * format spec. Intentionally independent of src/core writer code so that reader
 * and writer are both tested against the spec, not against each other.
 */

export type FixtureVersion = '1.7' | '2.0' | '3.0'

export interface FixtureMeshOptions {
  version: FixtureVersion
  boneName?: string
  meshName?: string
  jointName?: string
  stateName?: string
  normalName?: string
  colorName?: string
  textureName?: string
  unk25?: string
  trailer?: number[]
  physicsRecordCount?: number
}

export interface FixtureFileOptions {
  meshes: FixtureMeshOptions[]
  headerPadding?: number
}

export const FIXTURE_NAMES = {
  model: 'TestModel',
  group: 'group0',
  bone: 'Bip01',
  mesh: 'test_mesh_a',
  joint: 'Bip01 Head',
  state: 'alpha_state',
  normal: 'norm0',
  color: 'b1',
  texture: 'tex_diffuse',
  unk25: 'extra25'
} as const

export const FIXTURE_MESH_INDEX = 5
export const FIXTURE_UNK9 = 7
export const FIXTURE_IS_TEXTURE_MAPPED = 1

/** f32-exact values so tests can compare with === */
export const FIXTURE_VERTICES = [
  { x: 1, y: 2, z: 3, nx: 0, ny: 0, nz: 1, b: 10, g: 20, r: 30, a: 40, u: 0.25, v: 0.75 },
  { x: 4, y: 5, z: 6, nx: 1, ny: 0, nz: 0, b: 11, g: 21, r: 31, a: 41, u: 0.5, v: 0.125 },
  { x: 7, y: 8, z: 9, nx: 0, ny: 1, nz: 0, b: 12, g: 22, r: 32, a: 42, u: 0.75, v: 0.375 }
] as const

export const FIXTURE_INDICES = [0, 1, 2] as const
export const FIXTURE_STRIP_INDICES = [2, 1, 0] as const
export const FIXTURE_SKINS = [{ vertexIndex: 2, unkA: 0, weight: 0.5, unkB: 1 }] as const

/** matrix1[i] = i * 0.5, matrix2[i] = 100 + i (all f32-exact) */
export const fixtureMatrix1 = (): number[] => Array.from({ length: 16 }, (_, i) => i * 0.5)
export const fixtureMatrix2 = (): number[] => Array.from({ length: 16 }, (_, i) => 100 + i)

export const FIXTURE_BOUNDING_FLOATS = [1, 2, 3, ...Array.from({ length: 12 }, () => 0)]

const UNK1_FILL = 0xab
const UNK2_FILL = 0xcd
const UNK8_FILL = 0x11
const UNK10_FILL = 0x22
const PHYSICS_FILL = 0x33
const PADDING_FILL = 0xee

class Buf {
  private bytes: number[] = []

  get length(): number {
    return this.bytes.length
  }

  u8(...values: number[]): this {
    this.bytes.push(...values)
    return this
  }

  fill(value: number, count: number): this {
    for (let i = 0; i < count; i++) this.bytes.push(value)
    return this
  }

  i16(value: number): this {
    this.bytes.push(value & 0xff, (value >> 8) & 0xff)
    return this
  }

  i32(value: number): this {
    this.bytes.push(value & 0xff, (value >> 8) & 0xff, (value >> 16) & 0xff, (value >> 24) & 0xff)
    return this
  }

  f32(value: number): this {
    const view = new DataView(new ArrayBuffer(4))
    view.setFloat32(0, value, true)
    for (let i = 0; i < 4; i++) this.bytes.push(view.getUint8(i))
    return this
  }

  ascii(text: string): this {
    for (const ch of text) this.bytes.push(ch.charCodeAt(0) & 0xff)
    return this
  }

  fixedStr(text: string, length: number): this {
    this.ascii(text)
    return this.fill(0, length - text.length)
  }

  lpStr(text: string): this {
    if (text.length === 0) return this.i32(0)
    this.i32(text.length + 1)
    this.ascii(text)
    return this.u8(0)
  }

  raw(data: readonly number[] | Uint8Array): this {
    for (const b of data) this.bytes.push(b)
    return this
  }

  patchI32(pos: number, value: number): this {
    this.bytes[pos] = value & 0xff
    this.bytes[pos + 1] = (value >> 8) & 0xff
    this.bytes[pos + 2] = (value >> 16) & 0xff
    this.bytes[pos + 3] = (value >> 24) & 0xff
    return this
  }

  out(): Uint8Array {
    return Uint8Array.from(this.bytes)
  }
}

const versionBytes = (version: FixtureVersion): [number, number] => {
  if (version === '1.7') return [1, 7]
  if (version === '2.0') return [2, 0]
  return [3, 0]
}

export function buildMeshBlock(opts: FixtureMeshOptions): Uint8Array {
  const bone = opts.boneName ?? FIXTURE_NAMES.bone
  const mesh = opts.meshName ?? FIXTURE_NAMES.mesh
  const joint = opts.jointName ?? FIXTURE_NAMES.joint
  const state = opts.stateName ?? FIXTURE_NAMES.state
  const normal = opts.normalName ?? FIXTURE_NAMES.normal
  const color = opts.colorName ?? FIXTURE_NAMES.color
  const texture = opts.textureName ?? FIXTURE_NAMES.texture
  const physicsCount = opts.physicsRecordCount ?? 0
  const trailer = opts.trailer ?? []
  const isV17 = opts.version === '1.7'

  const b = new Buf()
  b.ascii('pm!').u8(0)
  b.u8(...versionBytes(opts.version))
  const sizePos = b.length
  b.i32(0)

  if (isV17) {
    b.fixedStr(bone, 32)
    b.fixedStr(mesh, 128)
    b.fixedStr(joint, 32)
    b.fixedStr(state, 32)
    b.fixedStr(normal, 32)
    b.fixedStr(color, 32)
  }

  for (const v of fixtureMatrix1()) b.f32(v)
  for (const v of fixtureMatrix2()) b.f32(v)
  b.i32(FIXTURE_MESH_INDEX)
  b.fill(UNK8_FILL, 8)
  if (isV17) b.fixedStr(texture, 32)
  b.i32(FIXTURE_IS_TEXTURE_MAPPED)
  b.fill(UNK10_FILL, 36)

  // count table: 20 int32
  b.i32(FIXTURE_INDICES.length) // indexCount
  b.i32(FIXTURE_INDICES.length / 3) // faceCount
  b.i32(FIXTURE_STRIP_INDICES.length) // stripIndexCount
  b.i32(FIXTURE_STRIP_INDICES.length - 2) // stripFaceCount
  b.i32(FIXTURE_VERTICES.length) // vertexCount
  b.i32(FIXTURE_SKINS.length) // skinCount
  b.i32(physicsCount)
  b.i32(0) // isAnimated
  b.i32(0) // morphFrameSize
  b.i32(0) // morphFrameCount
  b.i32(0).i32(0).i32(0).i32(0) // unk18-21
  b.i32(0) // unk22
  b.i32(FIXTURE_INDICES.length * 2) // indicesSize
  b.i32(FIXTURE_STRIP_INDICES.length * 2) // stripIndicesSize
  b.i32(FIXTURE_VERTICES.length * 36) // verticesSize
  b.i32(FIXTURE_SKINS.length * 16) // skinsSize
  b.i32(0) // unk23

  if (!isV17) {
    b.lpStr(bone)
    b.lpStr(mesh)
    b.lpStr(joint)
    b.lpStr(state)
    b.lpStr(normal)
    if (opts.version === '3.0') b.lpStr(opts.unk25 ?? FIXTURE_NAMES.unk25)
    b.lpStr(color)
    b.lpStr(texture)
  }

  b.i32(60)
  for (const v of FIXTURE_BOUNDING_FLOATS) b.f32(v)

  for (const i of FIXTURE_INDICES) b.i16(i)
  for (const i of FIXTURE_STRIP_INDICES) b.i16(i)
  for (const v of FIXTURE_VERTICES) {
    b.f32(v.x).f32(v.y).f32(v.z)
    b.f32(v.nx).f32(v.ny).f32(v.nz)
    b.u8(v.b, v.g, v.r, v.a)
    b.f32(v.u).f32(v.v)
  }
  for (const s of FIXTURE_SKINS) {
    b.i32(s.vertexIndex).i32(s.unkA).f32(s.weight).i32(s.unkB)
  }
  b.fill(PHYSICS_FILL, physicsCount * 32)
  b.raw(trailer)

  b.patchI32(sizePos, b.length)
  return b.out()
}

export function buildPmgFixture(opts: FixtureFileOptions): Uint8Array {
  const padding = opts.headerPadding ?? 0
  const blocks = opts.meshes.map(buildMeshBlock)

  const b = new Buf()
  b.ascii('pmg').u8(0)
  b.u8(2, 1)
  const headerSizePos = b.length
  b.i32(0)
  b.fixedStr(FIXTURE_NAMES.model, 32)
  b.fill(UNK1_FILL, 96)
  b.i32(1) // one mesh group

  b.fixedStr(FIXTURE_NAMES.group, 32)
  b.fill(UNK2_FILL, 32)
  b.i32(opts.meshes.length)
  opts.meshes.forEach((m, i) => {
    b.i32(blocks[i].length) // meshSize
    b.fixedStr(m.boneName ?? FIXTURE_NAMES.bone, 32)
    b.fixedStr(m.meshName ?? FIXTURE_NAMES.mesh, 128)
    b.fixedStr(m.jointName ?? FIXTURE_NAMES.joint, 32)
    b.i32(FIXTURE_MESH_INDEX)
    b.i32(FIXTURE_UNK9)
  })

  b.fill(PADDING_FILL, padding)
  b.patchI32(headerSizePos, b.length)
  for (const block of blocks) b.raw(block)
  return b.out()
}

export const FIXTURE_FILLS = {
  unk1: UNK1_FILL,
  unk2: UNK2_FILL,
  unk8: UNK8_FILL,
  unk10: UNK10_FILL,
  physics: PHYSICS_FILL,
  padding: PADDING_FILL
} as const

/**
 * Little-endian binary cursor utilities shared by all PMG format code.
 * Strings are decoded as latin1 so every byte round-trips losslessly;
 * the raw bytes stay authoritative for writing.
 */

export interface FixedString {
  /** Decoded text up to the first NUL. */
  readonly text: string
  /** Exact field bytes (fixed-size field, or LP payload after the length prefix). */
  readonly raw: Uint8Array
}

const LATIN1 = new TextDecoder('latin1')

export function decodeText(raw: Uint8Array): string {
  const nul = raw.indexOf(0)
  return LATIN1.decode(nul === -1 ? raw : raw.subarray(0, nul))
}

export function encodeLatin1(text: string): Uint8Array {
  const out = new Uint8Array(text.length)
  for (let i = 0; i < text.length; i++) out[i] = text.charCodeAt(i) & 0xff
  return out
}

/** Build a FixedString for a fixed-size field: text + NUL padding to `length`. */
export function makeFixedString(text: string, length: number): FixedString {
  if (text.length >= length) {
    throw new Error(`string "${text}" does not fit in ${length}-byte field (needs NUL)`) // fail fast at edit time
  }
  const raw = new Uint8Array(length)
  raw.set(encodeLatin1(text))
  return { text, raw }
}

/** Build a FixedString for a length-prefixed field: no NUL terminator, empty allowed. */
export function makeLpString(text: string): FixedString {
  return { text, raw: encodeLatin1(text) }
}

export class BinaryReader {
  private readonly view: DataView
  private off = 0

  constructor(private readonly data: Uint8Array) {
    this.view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  }

  get offset(): number {
    return this.off
  }

  get remaining(): number {
    return this.data.byteLength - this.off
  }

  seek(offset: number): void {
    this.check(offset - this.off, 'seek')
    this.off = offset
  }

  private check(size: number, what: string): void {
    if (size < 0 || this.off + size > this.data.byteLength) {
      throw new RangeError(`out of bounds reading ${what} at offset ${this.off}`)
    }
  }

  u8(): number {
    this.check(1, 'u8')
    return this.view.getUint8(this.off++)
  }

  i16(): number {
    this.check(2, 'i16')
    const v = this.view.getInt16(this.off, true)
    this.off += 2
    return v
  }

  u16(): number {
    this.check(2, 'u16')
    const v = this.view.getUint16(this.off, true)
    this.off += 2
    return v
  }

  i32(): number {
    this.check(4, 'i32')
    const v = this.view.getInt32(this.off, true)
    this.off += 4
    return v
  }

  f32(): number {
    this.check(4, 'f32')
    const v = this.view.getFloat32(this.off, true)
    this.off += 4
    return v
  }

  bytes(count: number): Uint8Array {
    this.check(count, `bytes(${count})`)
    const out = this.data.slice(this.off, this.off + count)
    this.off += count
    return out
  }

  fixedString(length: number): FixedString {
    const raw = this.bytes(length)
    return { text: decodeText(raw), raw }
  }

  lpString(): FixedString {
    const length = this.i32()
    if (length < 0 || length > this.remaining) {
      throw new RangeError(`invalid LP string length ${length} at offset ${this.off - 4}`)
    }
    const raw = this.bytes(length)
    return { text: decodeText(raw), raw }
  }
}

export class BinaryWriter {
  private chunks: Uint8Array[] = []
  private size = 0

  get length(): number {
    return this.size
  }

  private push(chunk: Uint8Array): void {
    this.chunks.push(chunk)
    this.size += chunk.byteLength
  }

  u8(value: number): void {
    this.push(Uint8Array.of(value & 0xff))
  }

  i16(value: number): void {
    const buf = new Uint8Array(2)
    new DataView(buf.buffer).setInt16(0, value, true)
    this.push(buf)
  }

  i32(value: number): void {
    const buf = new Uint8Array(4)
    new DataView(buf.buffer).setInt32(0, value, true)
    this.push(buf)
  }

  f32(value: number): void {
    const buf = new Uint8Array(4)
    new DataView(buf.buffer).setFloat32(0, value, true)
    this.push(buf)
  }

  bytes(data: Uint8Array): void {
    this.push(data)
  }

  /** Write a fixed-size field from its authoritative raw bytes. */
  fixedString(value: FixedString, length: number): void {
    if (value.raw.byteLength !== length) {
      throw new Error(`fixed string field expects ${length} bytes, got ${value.raw.byteLength}`)
    }
    this.push(value.raw)
  }

  /** Write an LP string: i32 payload length then the payload bytes. */
  lpString(value: FixedString): void {
    this.i32(value.raw.byteLength)
    this.push(value.raw)
  }

  toUint8Array(): Uint8Array {
    const out = new Uint8Array(this.size)
    let off = 0
    for (const chunk of this.chunks) {
      out.set(chunk, off)
      off += chunk.byteLength
    }
    return out
  }
}

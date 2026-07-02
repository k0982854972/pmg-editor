/**
 * Encoding detection and (de|en)coding for Mabinogi XML assets, which ship
 * as UTF-8 or UTF-16 (usually LE with BOM). The detected encoding is kept
 * on the parsed document so serialization can reproduce it, BOM included.
 */

export type XmlEncodingName = 'utf-8' | 'utf-16le' | 'utf-16be'

export interface XmlEncoding {
  readonly name: XmlEncodingName
  readonly hasBom: boolean
}

/** Sniff BOM, then BOM-less UTF-16 byte patterns, then default to UTF-8. */
export function detectXmlEncoding(bytes: Uint8Array): XmlEncoding {
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return { name: 'utf-16le', hasBom: true }
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return { name: 'utf-16be', hasBom: true }
  }
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return { name: 'utf-8', hasBom: true }
  }
  // "<" as a UTF-16 code unit: 3C 00 (LE) or 00 3C (BE).
  if (bytes.length >= 2 && bytes[0] === 0x3c && bytes[1] === 0x00) {
    return { name: 'utf-16le', hasBom: false }
  }
  if (bytes.length >= 2 && bytes[0] === 0x00 && bytes[1] === 0x3c) {
    return { name: 'utf-16be', hasBom: false }
  }
  return { name: 'utf-8', hasBom: false }
}

/** Decode bytes to text; TextDecoder skips the BOM itself. */
export function decodeXmlBytes(bytes: Uint8Array, encoding: XmlEncoding): string {
  return new TextDecoder(encoding.name).decode(bytes)
}

/** Encode text back to bytes in the stored encoding, restoring the BOM. */
export function encodeXmlText(text: string, encoding: XmlEncoding): Uint8Array {
  if (encoding.name === 'utf-8') {
    const body = new TextEncoder().encode(text)
    if (!encoding.hasBom) return body
    const out = new Uint8Array(body.length + 3)
    out.set([0xef, 0xbb, 0xbf])
    out.set(body, 3)
    return out
  }

  const littleEndian = encoding.name === 'utf-16le'
  const bomUnits = encoding.hasBom ? 1 : 0
  const out = new Uint8Array((text.length + bomUnits) * 2)
  const view = new DataView(out.buffer)
  if (encoding.hasBom) view.setUint16(0, 0xfeff, littleEndian)
  for (let i = 0; i < text.length; i++) {
    view.setUint16((i + bomUnits) * 2, text.charCodeAt(i), littleEndian)
  }
  return out
}

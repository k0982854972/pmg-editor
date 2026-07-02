/**
 * Box-filter downsampling for DDS mip chain regeneration.
 * Pure module; consumed by ddsEncode.ts.
 */

export interface RgbaLevel {
  readonly rgba: Uint8Array
  readonly width: number
  readonly height: number
}

/** Halve an RGBA8 image with a 2x2 box filter (edges clamped). */
export function downsampleBox(rgba: Uint8Array, width: number, height: number): RgbaLevel {
  const nextWidth = Math.max(1, width >> 1)
  const nextHeight = Math.max(1, height >> 1)
  const out = new Uint8Array(nextWidth * nextHeight * 4)

  for (let y = 0; y < nextHeight; y += 1) {
    const y0 = Math.min(y * 2, height - 1)
    const y1 = Math.min(y * 2 + 1, height - 1)
    for (let x = 0; x < nextWidth; x += 1) {
      const x0 = Math.min(x * 2, width - 1)
      const x1 = Math.min(x * 2 + 1, width - 1)
      const o = (y * nextWidth + x) * 4
      for (let c = 0; c < 4; c += 1) {
        const sum =
          rgba[(y0 * width + x0) * 4 + c] +
          rgba[(y0 * width + x1) * 4 + c] +
          rgba[(y1 * width + x0) * 4 + c] +
          rgba[(y1 * width + x1) * 4 + c]
        out[o + c] = Math.round(sum / 4)
      }
    }
  }
  return { rgba: out, width: nextWidth, height: nextHeight }
}

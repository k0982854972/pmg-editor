/**
 * PNG <-> RGBA8 conversion via the DOM canvas (renderer only).
 * Consumed by DdsWorkspace.tsx for 從 PNG 取代 and 匯出 PNG.
 */
import type { DdsPixels } from './ddsReducer'

function make2dContext(width: number, height: number): CanvasRenderingContext2D {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('無法建立 2D 畫布')
  return context
}

/** Decode PNG bytes into tightly packed, non-premultiplied RGBA8. */
export async function decodePngBytes(bytes: Uint8Array): Promise<DdsPixels> {
  const buffer = new Uint8Array(bytes).buffer
  const blob = new Blob([buffer], { type: 'image/png' })
  const bitmap = await createImageBitmap(blob, {
    premultiplyAlpha: 'none',
    colorSpaceConversion: 'none'
  })
  try {
    const context = make2dContext(bitmap.width, bitmap.height)
    context.drawImage(bitmap, 0, 0)
    const image = context.getImageData(0, 0, bitmap.width, bitmap.height)
    return {
      width: bitmap.width,
      height: bitmap.height,
      rgba: new Uint8Array(image.data.buffer, 0, bitmap.width * bitmap.height * 4)
    }
  } finally {
    bitmap.close()
  }
}

/** Encode RGBA8 pixels as PNG bytes. */
export async function encodePixelsToPng(pixels: DdsPixels): Promise<Uint8Array> {
  const context = make2dContext(pixels.width, pixels.height)
  const image = new ImageData(new Uint8ClampedArray(pixels.rgba), pixels.width, pixels.height)
  context.putImageData(image, 0, 0)
  const blob = await new Promise<Blob | null>((resolve) =>
    context.canvas.toBlob(resolve, 'image/png')
  )
  if (!blob) throw new Error('PNG 編碼失敗')
  return new Uint8Array(await blob.arrayBuffer())
}

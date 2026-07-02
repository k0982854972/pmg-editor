/**
 * Pure DDS workspace state: current file bytes, parsed header info, decoded
 * mip-0 preview pixels, dirty flag. Mirrors fxReducer; all updates are
 * immutable. Consumed by DdsWorkspace.tsx via useReducer.
 */
import type { DdsInfo } from '../../../core/dds/ddsFormat'

export interface DdsPixels {
  readonly width: number
  readonly height: number
  readonly rgba: Uint8Array
}

export interface DdsState {
  /** Raw DDS file bytes (original or with replaced pixel data). */
  readonly data: Uint8Array | null
  readonly filePath: string | null
  readonly info: DdsInfo | null
  /** Decoded mip 0, or null when the format could not be decoded. */
  readonly pixels: DdsPixels | null
  /** Why the preview is unavailable (decode failure), if applicable. */
  readonly decodeError: string | null
  readonly isDirty: boolean
  readonly error: string | null
}

export const initialDdsState: DdsState = {
  data: null,
  filePath: null,
  info: null,
  pixels: null,
  decodeError: null,
  isDirty: false,
  error: null
}

export type DdsAction =
  | {
      readonly type: 'ddsLoaded'
      readonly path: string
      readonly data: Uint8Array
      readonly info: DdsInfo
      readonly pixels: DdsPixels | null
      readonly decodeError: string | null
    }
  | { readonly type: 'ddsSaved'; readonly path: string }
  | { readonly type: 'pixelsReplaced'; readonly data: Uint8Array; readonly pixels: DdsPixels }
  | { readonly type: 'errorRaised'; readonly message: string }
  | { readonly type: 'errorCleared' }

export function ddsReducer(state: DdsState, action: DdsAction): DdsState {
  switch (action.type) {
    case 'ddsLoaded':
      return {
        data: action.data,
        filePath: action.path,
        info: action.info,
        pixels: action.pixels,
        decodeError: action.decodeError,
        isDirty: false,
        error: null
      }
    case 'ddsSaved':
      return { ...state, filePath: action.path, isDirty: false, error: null }
    case 'pixelsReplaced':
      if (!state.data) return state
      return { ...state, data: action.data, pixels: action.pixels, isDirty: true, error: null }
    case 'errorRaised':
      return { ...state, error: action.message }
    case 'errorCleared':
      return { ...state, error: null }
  }
}

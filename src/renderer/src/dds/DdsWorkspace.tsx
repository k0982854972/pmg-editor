/**
 * DDS texture workspace (貼圖 tab): open/save DDS, canvas preview of the
 * decoded mip 0 over a checkerboard, format info sidebar, PNG export and
 * same-size PNG pixel replacement that re-encodes into the original DDS
 * format (header bytes preserved verbatim by src/core/dds/ddsEncode.ts).
 * Exposes window.__openDdsPath in dev builds for smoke tests.
 */
import { useEffect, useReducer, useRef, useState } from 'react'
import { decodeDds } from '../../../core/dds/ddsDecode'
import { encodeUnsupportedReason, replaceDdsPixels } from '../../../core/dds/ddsEncode'
import type { DdsInfo } from '../../../core/dds/ddsFormat'
import { describeDds, parseDdsHeader } from '../../../core/dds/ddsFormat'
import type { DdsAction, DdsPixels } from './ddsReducer'
import { ddsReducer, initialDdsState } from './ddsReducer'
import { decodePngBytes, encodePixelsToPng } from './pngCanvas'

const basenameOf = (path: string): string => path.split(/[\\/]/).pop() ?? path

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : '未知錯誤')

const REPLACE_TOOLTIP =
  '以同尺寸 PNG 圖片取代像素，重新編碼為原本的 DDS 壓縮格式，檔頭與格式完全保留'

const MIN_ZOOM = 0.25
const MAX_ZOOM = 8

function loadDdsAction(path: string, data: Uint8Array): DdsAction {
  const info = parseDdsHeader(data)
  let pixels: DdsPixels | null = null
  let decodeError: string | null = null
  try {
    pixels = decodeDds(data)
  } catch (error) {
    decodeError = messageOf(error)
  }
  return { type: 'ddsLoaded', path, data, info, pixels, decodeError }
}

function DdsPreview({ pixels, zoom }: { pixels: DdsPixels; zoom: number }): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.width = pixels.width
    canvas.height = pixels.height
    const context = canvas.getContext('2d')
    if (!context) return
    const image = new ImageData(new Uint8ClampedArray(pixels.rgba), pixels.width, pixels.height)
    context.putImageData(image, 0, 0)
  }, [pixels])

  return (
    <canvas
      ref={canvasRef}
      className="dds-canvas"
      style={{ width: pixels.width * zoom, height: pixels.height * zoom }}
    />
  )
}

function DdsInfoPanel({
  info,
  byteLength
}: {
  info: DdsInfo
  byteLength: number
}): React.JSX.Element {
  return (
    <>
      <h2 className="panel-title">貼圖資訊</h2>
      <dl className="info-grid">
        <dt>摘要</dt>
        <dd>{describeDds(info)}</dd>
        <dt>格式</dt>
        <dd>{info.format.label}</dd>
        <dt>尺寸</dt>
        <dd>
          {info.width}×{info.height}
        </dd>
        <dt>Mipmap 數</dt>
        <dd>{info.mipMapCount}</dd>
        <dt>檔案大小</dt>
        <dd>{byteLength.toLocaleString()} bytes</dd>
      </dl>
      <p className="dds-note">格式將完整保留：儲存時檔頭位元組與壓縮格式與原檔完全一致。</p>
    </>
  )
}

export function DdsWorkspace(): React.JSX.Element {
  const [state, dispatch] = useReducer(ddsReducer, initialDdsState)
  const [zoom, setZoom] = useState(1)

  // Dev-only hook so automated smoke tests can load a file without the dialog.
  useEffect(() => {
    if (!import.meta.env.DEV) return undefined
    const devWindow = window as unknown as {
      __openDdsPath?: (path: string) => Promise<void>
    }
    devWindow.__openDdsPath = async (path: string): Promise<void> => {
      const result = await window.api.openDdsPath(path)
      if (!result) return
      dispatch(loadDdsAction(result.path, new Uint8Array(result.data)))
    }
    return () => {
      delete devWindow.__openDdsPath
    }
  }, [])

  const handleOpen = async (): Promise<void> => {
    try {
      const result = await window.api.openDds()
      if (!result) return
      dispatch(loadDdsAction(result.path, new Uint8Array(result.data)))
    } catch (error) {
      dispatch({ type: 'errorRaised', message: `開啟失敗：${messageOf(error)}` })
    }
  }

  const handleSaveAs = async (): Promise<void> => {
    if (!state.data) return
    try {
      const defaultName = state.filePath ? basenameOf(state.filePath) : 'texture.dds'
      const savedPath = await window.api.saveDdsAs(defaultName, state.data)
      if (!savedPath) return
      dispatch({ type: 'ddsSaved', path: savedPath })
    } catch (error) {
      dispatch({ type: 'errorRaised', message: `儲存失敗：${messageOf(error)}` })
    }
  }

  const handleSave = async (): Promise<void> => {
    if (!state.data) return
    if (!state.filePath) {
      await handleSaveAs()
      return
    }
    try {
      await window.api.saveDds(state.filePath, state.data)
      dispatch({ type: 'ddsSaved', path: state.filePath })
    } catch (error) {
      dispatch({ type: 'errorRaised', message: `儲存失敗：${messageOf(error)}` })
    }
  }

  const handleExportPng = async (): Promise<void> => {
    if (!state.pixels) return
    try {
      const png = await encodePixelsToPng(state.pixels)
      const base = state.filePath ? basenameOf(state.filePath).replace(/\.dds$/i, '') : 'texture'
      await window.api.exportPng(`${base}.png`, png)
    } catch (error) {
      dispatch({ type: 'errorRaised', message: `匯出 PNG 失敗：${messageOf(error)}` })
    }
  }

  const handleReplaceFromPng = async (): Promise<void> => {
    if (!state.data || !state.info) return
    try {
      const result = await window.api.importPng()
      if (!result) return
      const png = await decodePngBytes(new Uint8Array(result.data))
      if (png.width !== state.info.width || png.height !== state.info.height) {
        dispatch({
          type: 'errorRaised',
          message: `尺寸不符：PNG 為 ${png.width}×${png.height}，DDS 為 ${state.info.width}×${state.info.height}`
        })
        return
      }
      const replaced = replaceDdsPixels(state.data, png.rgba, png.width, png.height)
      dispatch({ type: 'pixelsReplaced', data: replaced, pixels: png })
    } catch (error) {
      dispatch({ type: 'errorRaised', message: `取代失敗：${messageOf(error)}` })
    }
  }

  const replaceBlockedReason = state.info ? encodeUnsupportedReason(state.info) : null
  const canReplace = state.data !== null && state.info !== null && replaceBlockedReason === null

  return (
    <div className="dds-workspace">
      <div className="fx-toolbar">
        <button type="button" title="開啟 .dds 貼圖檔案" onClick={() => void handleOpen()}>
          開啟 DDS
        </button>
        <button
          type="button"
          title="將目前的 DDS 內容寫回原檔案，檔頭與壓縮格式完全保留"
          disabled={!state.data}
          onClick={() => void handleSave()}
        >
          儲存
        </button>
        <button
          type="button"
          title="將目前的 DDS 內容另存為新檔案"
          disabled={!state.data}
          onClick={() => void handleSaveAs()}
        >
          另存新檔
        </button>
        <button
          type="button"
          title="將解碼後的第一層 (mip 0) 影像匯出為 PNG 圖片"
          disabled={!state.pixels}
          onClick={() => void handleExportPng()}
        >
          匯出 PNG
        </button>
        <button
          type="button"
          title={replaceBlockedReason ?? REPLACE_TOOLTIP}
          disabled={!canReplace}
          onClick={() => void handleReplaceFromPng()}
        >
          從 PNG 取代
        </button>
        <label className="dds-zoom" title="調整預覽縮放比例">
          縮放
          <input
            type="range"
            min={MIN_ZOOM}
            max={MAX_ZOOM}
            step={0.25}
            value={zoom}
            onChange={(event) => setZoom(Number(event.target.value))}
          />
          {Math.round(zoom * 100)}%
        </label>
        <span className="toolbar-file">
          {state.filePath ? basenameOf(state.filePath) : '未開啟檔案'}
          {state.isDirty && (
            <span className="dirty-dot" title="未儲存變更">
              ●
            </span>
          )}
        </span>
        {state.error && (
          <span className="toolbar-error" title={state.error}>
            <span className="toolbar-error-text">{state.error}</span>
            <button
              type="button"
              className="error-dismiss"
              title="關閉錯誤訊息"
              onClick={() => dispatch({ type: 'errorCleared' })}
            >
              ✕
            </button>
          </span>
        )}
      </div>
      <div className="dds-body">
        <div className="dds-preview">
          {state.pixels ? (
            <DdsPreview pixels={state.pixels} zoom={zoom} />
          ) : state.decodeError ? (
            <p className="dds-decode-error">無法預覽：{state.decodeError}</p>
          ) : (
            <p className="dds-empty">開啟 DDS 檔案以預覽貼圖</p>
          )}
        </div>
        <aside className="dds-sidebar">
          {state.info ? (
            <DdsInfoPanel info={state.info} byteLength={state.data?.byteLength ?? 0} />
          ) : (
            <p className="panel-empty">尚未開啟檔案</p>
          )}
        </aside>
      </div>
    </div>
  )
}

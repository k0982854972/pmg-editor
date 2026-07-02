/**
 * ANI animation inspector workspace (動畫 tab): read-only view of a Mabinogi
 * .ani file parsed by src/core/ani/reader.ts. Shows header info (version,
 * bone track count, total duration, keyframe total), a bone track table and,
 * for the selected bone, a keyframe table plus an inline SVG position-curve
 * sparkline. No playback (needs FRM skeleton support) and no editing.
 * Exposes window.__openAniPath in dev builds for smoke tests.
 */
import { useEffect, useMemo, useState } from 'react'
import type { AniBone, AniFile, AniFrame } from '../../../core/ani/types'
import {
  aniDurationMs,
  aniTotalKeyframes,
  readAni,
  readAniFrame,
  storedFrameCount
} from '../../../core/ani/reader'

const basenameOf = (path: string): string => path.split(/[\\/]/).pop() ?? path

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : '未知錯誤')

const KEYFRAME_ROW_CAP = 200
const SPARK_WIDTH = 320
const SPARK_HEIGHT = 96
const SPARK_PAD = 4

const AXIS_SERIES = [
  { key: 'x', label: 'X', color: '#ff7b72' },
  { key: 'y', label: 'Y', color: '#7ee787' },
  { key: 'z', label: 'Z', color: '#79c0ff' }
] as const

interface BoneRow {
  readonly label: string
  readonly bone: AniBone
}

interface AniState {
  readonly filePath: string | null
  readonly file: AniFile | null
  readonly byteLength: number
  readonly error: string | null
}

const round3 = (value: number): string => value.toFixed(3)

function boneFrames(bone: AniBone): AniFrame[] {
  const count = storedFrameCount(bone)
  const frames: AniFrame[] = []
  for (let i = 0; i < count; i += 1) frames.push(readAniFrame(bone, i))
  return frames
}

function polylinePoints(frames: readonly AniFrame[], axis: 'x' | 'y' | 'z'): string {
  const times = frames.map((f) => f.time)
  const minTime = Math.min(...times)
  const timeSpan = Math.max(1, Math.max(...times) - minTime)
  let min = Infinity
  let max = -Infinity
  for (const frame of frames) {
    for (const series of AXIS_SERIES) {
      const v = frame.position[series.key]
      if (v < min) min = v
      if (v > max) max = v
    }
  }
  const span = Math.max(1e-6, max - min)
  const plotW = SPARK_WIDTH - SPARK_PAD * 2
  const plotH = SPARK_HEIGHT - SPARK_PAD * 2
  return frames
    .map((frame) => {
      const x = SPARK_PAD + ((frame.time - minTime) / timeSpan) * plotW
      const y = SPARK_PAD + (1 - (frame.position[axis] - min) / span) * plotH
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
}

function AniSparkline({ frames }: { frames: readonly AniFrame[] }): React.JSX.Element {
  if (frames.length < 2) {
    return <p className="ani-spark-empty">關鍵影格不足，無法繪製位置曲線</p>
  }
  return (
    <div className="ani-sparkline" title="所選骨骼的位置分量隨時間變化曲線（共用同一數值刻度）">
      <svg
        width={SPARK_WIDTH}
        height={SPARK_HEIGHT}
        viewBox={`0 0 ${SPARK_WIDTH} ${SPARK_HEIGHT}`}
        role="img"
      >
        {AXIS_SERIES.map((series) => (
          <polyline
            key={series.key}
            points={polylinePoints(frames, series.key)}
            fill="none"
            stroke={series.color}
            strokeWidth={1.5}
          />
        ))}
      </svg>
      <div className="ani-legend">
        {AXIS_SERIES.map((series) => (
          <span key={series.key} className="ani-legend-item">
            <span className="ani-legend-swatch" style={{ background: series.color }} />
            {series.label}
          </span>
        ))}
      </div>
    </div>
  )
}

function AniInfoPanel({
  file,
  byteLength
}: {
  file: AniFile
  byteLength: number
}): React.JSX.Element {
  return (
    <>
      <h2 className="panel-title">動畫資訊</h2>
      <dl className="info-grid">
        <dt>版本</dt>
        <dd>
          {file.header.version[0]}.{file.header.version[1]}
        </dd>
        <dt>骨骼軌道數</dt>
        <dd>
          {file.header.boneCount}
          {file.header.secondBoneCount > 0 && `（+ 次要 ${file.header.secondBoneCount}）`}
        </dd>
        <dt>總時間長度</dt>
        <dd>{aniDurationMs(file).toLocaleString()} ms</dd>
        <dt>關鍵影格總數</dt>
        <dd>{aniTotalKeyframes(file).toLocaleString()}</dd>
        <dt>檔案大小</dt>
        <dd>{byteLength.toLocaleString()} bytes</dd>
      </dl>
      <p className="ani-note">播放預覽需要 FRM 骨架支援（規劃中）。</p>
    </>
  )
}

function KeyframeTable({ frames }: { frames: readonly AniFrame[] }): React.JSX.Element {
  const rows = frames.slice(0, KEYFRAME_ROW_CAP)
  return (
    <div className="ani-keyframes">
      <table className="ani-table">
        <thead>
          <tr>
            <th>#</th>
            <th>時間</th>
            <th>位置 X</th>
            <th>位置 Y</th>
            <th>位置 Z</th>
            <th>旋轉 X</th>
            <th>旋轉 Y</th>
            <th>旋轉 Z</th>
            <th>旋轉 W</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((frame, index) => (
            <tr key={index}>
              <td>{index}</td>
              <td>{frame.time}</td>
              <td>{round3(frame.position.x)}</td>
              <td>{round3(frame.position.y)}</td>
              <td>{round3(frame.position.z)}</td>
              <td>{round3(frame.rotation.x)}</td>
              <td>{round3(frame.rotation.y)}</td>
              <td>{round3(frame.rotation.z)}</td>
              <td>{round3(frame.rotation.w)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {frames.length > KEYFRAME_ROW_CAP && (
        <p className="ani-cap-note">
          僅顯示前 {KEYFRAME_ROW_CAP} 筆，共 {frames.length.toLocaleString()} 筆關鍵影格
        </p>
      )}
    </div>
  )
}

export function AniWorkspace(): React.JSX.Element {
  const [state, setState] = useState<AniState>({
    filePath: null,
    file: null,
    byteLength: 0,
    error: null
  })
  const [selectedBone, setSelectedBone] = useState<number | null>(null)

  const loadAni = (path: string, data: Uint8Array): void => {
    try {
      setState({ filePath: path, file: readAni(data), byteLength: data.byteLength, error: null })
      setSelectedBone(null)
    } catch (error) {
      setState((previous) => ({ ...previous, error: `解析失敗：${messageOf(error)}` }))
    }
  }

  // Dev-only hook so automated smoke tests can load a file without the dialog.
  useEffect(() => {
    if (!import.meta.env.DEV) return undefined
    const devWindow = window as unknown as {
      __openAniPath?: (path: string) => Promise<void>
    }
    devWindow.__openAniPath = async (path: string): Promise<void> => {
      const result = await window.api.openAniPath(path)
      if (!result) return
      loadAni(result.path, new Uint8Array(result.data))
    }
    return () => {
      delete devWindow.__openAniPath
    }
  }, [])

  const handleOpen = async (): Promise<void> => {
    try {
      const result = await window.api.openAni()
      if (!result) return
      loadAni(result.path, new Uint8Array(result.data))
    } catch (error) {
      setState((previous) => ({ ...previous, error: `開啟失敗：${messageOf(error)}` }))
    }
  }

  const boneRows = useMemo<BoneRow[]>(() => {
    if (!state.file) return []
    return [
      ...state.file.bones.map((bone, i) => ({ label: `${i}`, bone })),
      ...state.file.secondaryBones.map((bone, i) => ({ label: `次 ${i}`, bone }))
    ]
  }, [state.file])

  const selectedRow = selectedBone !== null ? (boneRows[selectedBone] ?? null) : null
  const selectedFrames = useMemo(
    () => (selectedRow ? boneFrames(selectedRow.bone) : []),
    [selectedRow]
  )

  return (
    <div className="ani-workspace">
      <div className="fx-toolbar">
        <button
          type="button"
          title="開啟 .ani 動畫檔案（唯讀檢視）"
          onClick={() => void handleOpen()}
        >
          開啟 ANI
        </button>
        <span className="toolbar-file">
          {state.filePath ? basenameOf(state.filePath) : '未開啟檔案'}
        </span>
        {state.error && (
          <span className="toolbar-error" title={state.error}>
            <span className="toolbar-error-text">{state.error}</span>
            <button
              type="button"
              className="error-dismiss"
              title="關閉錯誤訊息"
              onClick={() => setState((previous) => ({ ...previous, error: null }))}
            >
              ✕
            </button>
          </span>
        )}
      </div>
      <div className="ani-body">
        <aside className="ani-sidebar">
          {state.file ? (
            <>
              <AniInfoPanel file={state.file} byteLength={state.byteLength} />
              <h2 className="panel-title">骨骼軌道</h2>
              <table className="ani-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>影格數</th>
                    <th>時間長度</th>
                  </tr>
                </thead>
                <tbody>
                  {boneRows.map((row, index) => (
                    <tr
                      key={index}
                      className={index === selectedBone ? 'ani-bone-row selected' : 'ani-bone-row'}
                      title="點選以檢視此骨骼軌道的關鍵影格"
                      onClick={() => setSelectedBone(index)}
                    >
                      <td>{row.label}</td>
                      <td>
                        {storedFrameCount(row.bone)}
                        {row.bone.sizeMismatch && (
                          <span title="frameCount 與 transformsSize 不一致，以 transformsSize 為準">
                            {' '}
                            ⚠
                          </span>
                        )}
                      </td>
                      <td>{row.bone.timeMs.toLocaleString()} ms</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : (
            <p className="panel-empty">尚未開啟檔案</p>
          )}
        </aside>
        <div className="ani-main">
          {selectedRow ? (
            <>
              <h2 className="panel-title">
                骨骼 {selectedRow.label} 關鍵影格（{selectedFrames.length.toLocaleString()} 筆）
              </h2>
              <AniSparkline frames={selectedFrames} />
              <KeyframeTable frames={selectedFrames} />
            </>
          ) : (
            <p className="ani-empty">
              {state.file ? '點選左側骨骼軌道以檢視關鍵影格' : '開啟 ANI 檔案以檢視動畫結構'}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

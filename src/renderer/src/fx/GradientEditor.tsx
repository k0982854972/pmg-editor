/**
 * ColorOverLife / ColorOverDistance keyframe editor: CSS gradient preview
 * strip plus per-stop time / RGB swatch / alpha rows. Commits the whole
 * keyframe list upward (formatColorKeyframes happens in ParamEditor).
 */
import type { ColorKeyframe } from '../../../core/fx/colorOverLife'
import {
  addMidpointStop,
  buildGradientCss,
  removeStop,
  replaceStop,
  rgbHexOf,
  withRgbHex
} from './gradientModel'

interface GradientEditorProps {
  readonly frames: readonly ColorKeyframe[]
  readonly onCommit: (frames: readonly ColorKeyframe[]) => void
}

const clampByte = (n: number): number => Math.min(255, Math.max(0, Math.round(n)))
const clamp01 = (n: number): number => Math.min(1, Math.max(0, n))

export function GradientEditor({ frames, onCommit }: GradientEditorProps): React.JSX.Element {
  const commitStop = (index: number, patch: Partial<ColorKeyframe>): void => {
    onCommit(replaceStop(frames, index, patch))
  }

  return (
    <div className="fx-gradient">
      <div
        className="fx-gradient-preview"
        style={{ background: buildGradientCss(frames) }}
        title="漸層預覽"
      />
      <ul className="fx-gradient-stops">
        {frames.map((frame, index) => (
          <li key={index} className="fx-gradient-stop">
            <input
              type="number"
              className="fx-stop-time"
              aria-label="時間"
              min={0}
              max={1}
              step={0.01}
              value={frame.time}
              onChange={(event) => {
                const time = Number(event.target.value)
                if (Number.isFinite(time)) commitStop(index, { time: clamp01(time) })
              }}
            />
            <input
              type="color"
              className="fx-stop-color"
              aria-label="顏色"
              value={rgbHexOf(frame)}
              onChange={(event) =>
                onCommit(replaceStop(frames, index, withRgbHex(frame, event.target.value)))
              }
            />
            <input
              type="number"
              className="fx-stop-alpha"
              aria-label="透明度"
              min={0}
              max={255}
              step={1}
              value={frame.a}
              onChange={(event) => {
                const alpha = Number(event.target.value)
                if (Number.isFinite(alpha)) commitStop(index, { a: clampByte(alpha) })
              }}
            />
            <button
              type="button"
              className="fx-stop-delete"
              onClick={() => onCommit(removeStop(frames, index))}
            >
              刪除
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        className="fx-gradient-add"
        onClick={() => onCommit(addMidpointStop(frames))}
      >
        新增停駐點
      </button>
    </div>
  )
}

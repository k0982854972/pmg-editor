/**
 * Presentational control strip for FRM skeleton + ANI animation playback in
 * the 模型 tab viewport. All playback state lives in Viewport.tsx; this
 * component only renders the buttons, speed selector, time slider and the
 * skeleton/animation status line. Styles: .anim-* in assets/main.css.
 */

export const ANIM_SPEED_OPTIONS = [0.25, 0.5, 1, 2] as const

export interface AnimControlsProps {
  readonly skeletonLabel: string | null
  readonly animLabel: string | null
  readonly warning: string | null
  readonly hasSkeleton: boolean
  readonly hasPlayback: boolean
  readonly isPlaying: boolean
  readonly speed: number
  readonly timeMs: number
  readonly durationMs: number
  readonly onLoadFrm: () => void
  readonly onUnloadFrm: () => void
  readonly onLoadAni: () => void
  readonly onUnloadAni: () => void
  readonly onTogglePlay: () => void
  readonly onSpeedChange: (speed: number) => void
  readonly onSeek: (timeMs: number) => void
}

const formatSeconds = (ms: number): string => `${(ms / 1000).toFixed(1)} 秒`

export function AnimControls(props: AnimControlsProps): React.JSX.Element {
  return (
    <div className="anim-bar">
      <div className="anim-controls">
        <button
          type="button"
          className="toggle"
          title="載入 FRM 骨架檔，將模型網格綁定到骨骼"
          onClick={props.onLoadFrm}
        >
          載入骨架
        </button>
        {props.hasSkeleton && (
          <button
            type="button"
            className="toggle"
            title="卸除骨架，回到靜態顯示"
            onClick={props.onUnloadFrm}
          >
            卸除骨架
          </button>
        )}
        <button
          type="button"
          className="toggle"
          title="載入 ANI 動畫檔（需先載入骨架）"
          onClick={props.onLoadAni}
          disabled={!props.hasSkeleton}
        >
          載入動畫
        </button>
        {props.hasPlayback && (
          <>
            <button
              type="button"
              className="toggle"
              title="卸除動畫，回到綁定姿勢"
              onClick={props.onUnloadAni}
            >
              卸除動畫
            </button>
            <button
              type="button"
              className={props.isPlaying ? 'toggle active' : 'toggle'}
              title="播放或暫停動畫"
              onClick={props.onTogglePlay}
            >
              {props.isPlaying ? '暫停' : '播放'}
            </button>
            <select
              className="anim-speed"
              title="播放速度倍率"
              value={String(props.speed)}
              onChange={(event) => props.onSpeedChange(Number(event.target.value))}
            >
              {ANIM_SPEED_OPTIONS.map((option) => (
                <option key={option} value={String(option)}>
                  {option}x
                </option>
              ))}
            </select>
            <input
              type="range"
              className="anim-time"
              title="拖曳以調整動畫時間"
              min={0}
              max={Math.max(1, Math.floor(props.durationMs))}
              step={1}
              value={Math.floor(props.timeMs)}
              onChange={(event) => props.onSeek(Number(event.target.value))}
            />
            <span className="anim-clock">
              {formatSeconds(props.timeMs)} / {formatSeconds(props.durationMs)}
            </span>
          </>
        )}
      </div>
      <div className="anim-status">
        <span title="目前載入的骨架狀態">骨架：{props.skeletonLabel ?? '未載入'}</span>
        <span title="目前載入的動畫狀態">動畫：{props.animLabel ?? '未載入'}</span>
        {props.warning && (
          <span className="anim-warning" title="骨架與模型或動畫之間的不一致">
            {props.warning}
          </span>
        )}
      </div>
    </div>
  )
}

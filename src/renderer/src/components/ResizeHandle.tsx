/**
 * Vertical drag handle (col-resize) for user-resizable side panels in the FX
 * workspace. The parent owns the width state (see usePersistedPanelWidth);
 * the handle reports clamped widths while dragging via pointer capture.
 */
import { useRef } from 'react'
import { clampPanelWidth } from './panelWidth'

interface ResizeHandleProps {
  /** Which side of the handle the resized panel sits on. */
  readonly panelSide: 'left' | 'right'
  readonly width: number
  readonly minWidth: number
  readonly maxWidth: number
  readonly onWidthChange: (width: number) => void
  readonly ariaLabel: string
}

interface DragState {
  readonly startX: number
  readonly startWidth: number
}

export function ResizeHandle({
  panelSide,
  width,
  minWidth,
  maxWidth,
  onWidthChange,
  ariaLabel
}: ResizeHandleProps): React.JSX.Element {
  const dragRef = useRef<DragState | null>(null)

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>): void => {
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = { startX: event.clientX, startWidth: width }
  }

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>): void => {
    const drag = dragRef.current
    if (!drag) return
    const delta = event.clientX - drag.startX
    const next = panelSide === 'left' ? drag.startWidth + delta : drag.startWidth - delta
    onWidthChange(clampPanelWidth(next, minWidth, maxWidth))
  }

  const handlePointerEnd = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (!dragRef.current) return
    dragRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  return (
    <div
      className="ui-resize-handle"
      role="separator"
      aria-orientation="vertical"
      aria-label={ariaLabel}
      title="拖曳調整寬度"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
    />
  )
}

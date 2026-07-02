/**
 * Text input that commits on blur/Enter and reverts on Escape.
 * Shared by ParamEditor and AttachmentPanel field rows.
 */
import { useState } from 'react'

interface CommitInputProps {
  readonly value: string
  readonly onCommit: (value: string) => void
  readonly className?: string
  readonly ariaLabel?: string
}

export function CommitInput({
  value,
  onCommit,
  className,
  ariaLabel
}: CommitInputProps): React.JSX.Element {
  const [draft, setDraft] = useState(value)
  const [lastValue, setLastValue] = useState(value)

  // Re-sync when the committed value changes externally (adjust-state-in-render).
  if (lastValue !== value) {
    setLastValue(value)
    setDraft(value)
  }

  const commit = (): void => {
    if (draft !== value) onCommit(draft)
  }

  return (
    <input
      type="text"
      className={className}
      aria-label={ariaLabel}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          commit()
        } else if (event.key === 'Escape') {
          setDraft(value)
        }
      }}
    />
  )
}

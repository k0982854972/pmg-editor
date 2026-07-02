/**
 * Pure helpers for the suggestion combobox (bone / effect-name inputs in the
 * meshdesc rows): case-insensitive substring filtering and wrap-around
 * keyboard highlight movement.
 */

/** Case-insensitive substring filter; an empty/whitespace query keeps all options. */
export function filterComboboxOptions(
  options: readonly string[],
  query: string
): readonly string[] {
  const needle = query.trim().toLowerCase()
  if (needle === '') return options
  return options.filter((option) => option.toLowerCase().includes(needle))
}

/**
 * Move the active highlight by one step with wrap-around.
 * `current` of -1 means "no highlight yet": ArrowDown starts at the first
 * option, ArrowUp at the last. Returns -1 when there are no options.
 */
export function moveActiveIndex(optionCount: number, current: number, step: 1 | -1): number {
  if (optionCount <= 0) return -1
  if (current < 0 || current >= optionCount) return step === 1 ? 0 : optionCount - 1
  return (current + step + optionCount) % optionCount
}

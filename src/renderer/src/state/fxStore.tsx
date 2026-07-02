/**
 * React provider wiring over the pure fxReducer.
 * Consumed by App.tsx; read access goes through useFx (fxContext.ts).
 */
import { useMemo, useReducer } from 'react'
import type { ReactNode } from 'react'
import { FxContext } from './fxContext'
import { fxReducer, initialFxState } from './fxReducer'

export function FxProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [state, dispatch] = useReducer(fxReducer, initialFxState)
  const value = useMemo(() => ({ state, dispatch }), [state])
  return <FxContext.Provider value={value}>{children}</FxContext.Provider>
}

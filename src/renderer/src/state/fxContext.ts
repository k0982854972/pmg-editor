/**
 * FX context + useFx hook, kept apart from the provider component so
 * react-refresh sees component-only modules (same split as editorContext).
 */
import { createContext, useContext } from 'react'
import type { Dispatch } from 'react'
import type { FxAction, FxState } from './fxReducer'

export interface FxContextValue {
  readonly state: FxState
  readonly dispatch: Dispatch<FxAction>
}

export const FxContext = createContext<FxContextValue | null>(null)

export function useFx(): FxContextValue {
  const value = useContext(FxContext)
  if (!value) throw new Error('useFx must be used within FxProvider')
  return value
}

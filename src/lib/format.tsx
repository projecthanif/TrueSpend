import { createContext, use, type ReactNode } from 'react'
import { makeFormatters, type Formatters } from './money'

/**
 * Currency formatting is decided once, from the statement, and read by every
 * view. A context keeps `naira()`-style helpers out of the components without
 * threading a formatter prop through all of them.
 */
const FormatContext = createContext<Formatters>(makeFormatters('NGN'))

export function FormatProvider({ currency, children }: { currency: string; children: ReactNode }) {
  return <FormatContext value={makeFormatters(currency)}>{children}</FormatContext>
}

export const useFormat = () => use(FormatContext)

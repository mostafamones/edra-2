import { createContext, useContext, useLayoutEffect } from 'react'
import type { ColorValue } from 'react-native'
import type { HeaderProps, SheetProps } from '../../features/sessions/screens/platform.ts'

export type FeatureSheetProps = SheetProps & {
  /** Assessments only reports user dismissals; Sessions also reports controlled dismissal. */
  notifyOnClose?: boolean
  /** Full-screen cover fill behind the status bar and header; defaults to the plain page background. */
  background?: ColorValue
}

export const SheetContext = createContext(false)

/** Set by an iOS page sheet that draws its own SwiftUI navigation bar from the content's `Header`. */
export const SheetBarContext = createContext<((bar: HeaderProps | undefined) => void) | undefined>(undefined)

/** Sheet content's `Header` under `SheetBarContext`: hands its props to the sheet bar and renders nothing. */
export function SheetHeader(props: HeaderProps) {
  const setBar = useContext(SheetBarContext)
  useLayoutEffect(() => { setBar?.(props) })
  useLayoutEffect(() => () => setBar?.(undefined), [setBar])
  return null
}

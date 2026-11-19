import { createContext } from 'react'
import type { SheetProps } from '../../features/sessions/screens/platform.ts'

export type FeatureSheetProps = SheetProps & {
  /** Assessments only reports user dismissals; Sessions also reports controlled dismissal. */
  notifyOnClose?: boolean
}

export const SheetContext = createContext(false)

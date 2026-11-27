import type { ComponentProps, ReactNode } from 'react'
import type { StyleProp, ViewStyle } from 'react-native'
import type { AssessmentPlatform } from '../../features/assignments/platform.ts'
import type { MenuProps } from '../../features/sessions/screens/platform.ts'

export type CapsuleProps = ComponentProps<AssessmentPlatform['GlassCapsule']>

export type PopupProps = Omit<MenuProps, 'accessibilityLabel'> & {
  accessibilityLabel?: string
  longPress?: boolean
  style?: StyleProp<ViewStyle>
  children: ReactNode
}

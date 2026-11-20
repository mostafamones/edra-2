import { DynamicColorIOS, Platform, PlatformColor, useColorScheme, type ColorValue, type TextStyle } from 'react-native'

/** The SwiftUI colours the Swift views use: iOS semantic colours on iOS, their published light/dark values on Android. */
const NAMES = {
  groupedBackground: ['systemGroupedBackground', '#F2F2F7', '#000000'],
  secondaryGroupedBackground: ['secondarySystemGroupedBackground', '#FFFFFF', '#1C1C1E'],
  background: ['systemBackground', '#FFFFFF', '#000000'],
  secondaryFill: ['secondarySystemFill', 'rgba(120,120,128,0.16)', 'rgba(120,120,128,0.32)'],
  tertiaryFill: ['tertiarySystemFill', 'rgba(118,118,128,0.12)', 'rgba(118,118,128,0.24)'],
  label: ['label', '#000000', '#FFFFFF'],
  secondaryLabel: ['secondaryLabel', 'rgba(60,60,67,0.6)', 'rgba(235,235,245,0.6)'],
  separator: ['separator', 'rgba(60,60,67,0.29)', 'rgba(84,84,88,0.6)'],
  red: ['systemRed', '#FF3B30', '#FF453A'],
  orange: ['systemOrange', '#FF9500', '#FF9F0A'],
  green: ['systemGreen', '#34C759', '#30D158'],
  gray: ['systemGray', '#8E8E93', '#8E8E93'],
} as const

/** Edra green. Not `PlatformColor('AccentColor')`: the generated Expo catalog has no AccentColor, which draws nothing. */
const ACCENT = { light: '#008236', dark: '#026630' }

const ACCENT_TEXT = { light: ACCENT.light, dark: '#30D158' }

export type Colors = Readonly<Record<keyof typeof NAMES | 'white' | 'accent' | 'accentText', ColorValue>>

const ios: Colors = {
  ...(Object.fromEntries(Object.entries(NAMES).map(([key, [name]]) => [key, PlatformColor(name)])) as Record<keyof typeof NAMES, ColorValue>),
  accent: Platform.OS === 'ios' ? DynamicColorIOS(ACCENT) : ACCENT.light,
  accentText: Platform.OS === 'ios' ? DynamicColorIOS(ACCENT_TEXT) : ACCENT_TEXT.light,
  white: '#FFFFFF',
}
const android = (dark: boolean): Colors => ({
  ...(Object.fromEntries(Object.entries(NAMES).map(([key, [, light, night]]) => [key, dark ? night : light])) as Record<keyof typeof NAMES, ColorValue>),
  accent: dark ? ACCENT.dark : ACCENT.light,
  accentText: dark ? ACCENT_TEXT.dark : ACCENT_TEXT.light,
  white: '#FFFFFF',
})
const LIGHT = Platform.OS === 'ios' ? ios : android(false)
const DARK = Platform.OS === 'ios' ? ios : android(true)

export function useColors(): Colors {
  return useColorScheme() === 'dark' ? DARK : LIGHT
}

/** SwiftUI text styles at the default content size; RN scales them with Dynamic Type / font scale. */
const style = (fontSize: number, lineHeight: number, fontWeight: TextStyle['fontWeight'] = '400'): TextStyle => ({ fontSize, lineHeight, fontWeight })
export const font = {
  title2Bold: style(22, 28, '700'),
  title3: style(20, 25),
  title3Semibold: style(20, 25, '600'),
  headline: style(17, 22, '600'),
  body: style(17, 22),
  bodyMedium: style(17, 22, '500'),
  bodySemibold: style(17, 22, '600'),
  subheadline: style(15, 20),
  subheadlineMedium: style(15, 20, '500'),
  subheadlineSemibold: style(15, 20, '600'),
  footnote: style(13, 18),
  footnoteSemibold: style(13, 18, '600'),
  caption: style(12, 16),
  captionSemibold: style(12, 16, '600'),
} as const

/** `.monospacedDigit()` */
export const digits: TextStyle = { fontVariant: ['tabular-nums'] }

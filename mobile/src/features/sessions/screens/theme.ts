import { DynamicColorIOS, Platform, PlatformColor, StyleSheet, useColorScheme, type ColorValue } from 'react-native'
import type { AttendanceStatus } from '../contract.ts'

export interface Colors {
  label: ColorValue
  secondary: ColorValue
  background: ColorValue
  /** `systemGroupedBackground` behind inset-grouped lists. */
  grouped: ColorValue
  /** `.fill.tertiary` card fill. */
  fill: ColorValue
  /** `secondarySystemGroupedBackground` tile/camera box. */
  tile: ColorValue
  /** `.thinMaterial` banners (opaque approximation; glass belongs to the foundation). */
  material: ColorValue
  separator: ColorValue
  accent: ColorValue
  /** Accent for text and glyphs on plain backgrounds; the dark AccentColor is too dim for that. */
  accentText: ColorValue
  onAccent: ColorValue
  red: ColorValue
  orange: ColorValue
  green: ColorValue
  cyan: ColorValue
  blue: ColorValue
}

// AccentColor from the iOS asset catalog: light #008236, dark #026630.
const ios: Colors = {
  label: PlatformColor('label'),
  secondary: PlatformColor('secondaryLabel'),
  background: PlatformColor('systemBackground'),
  grouped: PlatformColor('systemGroupedBackground'),
  fill: PlatformColor('tertiarySystemFill'),
  tile: PlatformColor('secondarySystemGroupedBackground'),
  material: PlatformColor('secondarySystemBackground'),
  separator: PlatformColor('separator'),
  accent: PlatformColor('AccentColor'),
  // DynamicColorIOS throws off iOS; this object is built on every platform.
  accentText: Platform.OS === 'ios' ? DynamicColorIOS({ light: '#008236', dark: '#30D158' }) : '#008236',
  onAccent: '#FFFFFF',
  red: PlatformColor('systemRed'),
  orange: PlatformColor('systemOrange'),
  green: PlatformColor('systemGreen'),
  cyan: PlatformColor('systemCyan'),
  blue: PlatformColor('systemBlue'),
}

const androidLight: Colors = {
  label: '#1C1B1F',
  secondary: '#5F6368',
  background: '#FFFFFF',
  grouped: '#F6F7F9',
  fill: '#F1F2F4',
  tile: '#F1F2F4',
  material: '#F1F2F4',
  separator: '#DADCE0',
  accent: '#008236',
  accentText: '#008236',
  onAccent: '#FFFFFF',
  red: '#D93025',
  orange: '#E37400',
  green: '#1E8E3E',
  cyan: '#0097A7',
  blue: '#1A73E8',
}

const androidDark: Colors = {
  ...androidLight,
  label: '#E6E1E5',
  secondary: '#A8ABB0',
  background: '#121212',
  grouped: '#121212',
  fill: '#24262A',
  tile: '#1E2023',
  material: '#24262A',
  separator: '#3C4043',
  accent: '#2E9F5B',
  accentText: '#81C995',
  red: '#F28B82',
  orange: '#FDB863',
  green: '#81C995',
  cyan: '#78D9EC',
  blue: '#8AB4F8',
}

/** Semantic colors: iOS system colors (dark mode and contrast handled natively); Android light/dark pairs. */
export function useColors(): Colors {
  const scheme = useColorScheme()
  if (Platform.OS === 'ios') return ios
  return scheme === 'dark' ? androidDark : androidLight
}

export function statusTint(status: AttendanceStatus, colors: Colors): ColorValue {
  switch (status) {
    case 'late':
      return colors.orange
    case 'absent':
      return colors.red
    case 'excused':
      return colors.blue
    case 'present':
      return colors.accentText
    default:
      return colors.secondary
  }
}

/** iOS default text styles at the Large content size; RN scales them with the system text size. */
export const type = StyleSheet.create({
  title: { fontSize: 28, lineHeight: 34, fontWeight: '700' },
  title2: { fontSize: 22, lineHeight: 28, fontWeight: '700' },
  title3: { fontSize: 20, lineHeight: 25, fontWeight: '700' },
  headline: { fontSize: 17, lineHeight: 22, fontWeight: '600' },
  body: { fontSize: 17, lineHeight: 22 },
  subheadline: { fontSize: 15, lineHeight: 20 },
  footnote: { fontSize: 13, lineHeight: 18 },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '600' },
})

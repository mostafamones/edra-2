import { Image, type ColorValue } from 'react-native'
import { useBoldText } from './boldText.ts'
import { useColors } from '../../features/sessions/screens/theme.ts'

const sources: Record<string, number> = {
  'add-01': require('./icons/add-01.png'),
  'bubble-chat': require('./icons/bubble-chat.png'),
  'book-open-01': require('./icons/book-open-01.png'),
  'calendar-clock': require('./icons/calendar-clock.png'),
  'cancel-01': require('./icons/cancel-01.png'),
  'checkmark-circle-02': require('./icons/checkmark-circle-02.png'),
  'chevron-left': require('./icons/chevron-left.png'),
  'chevron-right': require('./icons/chevron-right.png'),
  'circle': require('./icons/circle.png'),
  'clock-01': require('./icons/clock-01.png'),
  'code': require('./icons/code.png'),
  'file-edit': require('./icons/file-edit.png'),
  'flash-off': require('./icons/flash-off.png'),
  'flash': require('./icons/flash.png'),
  'globe-02': require('./icons/globe-02.png'),
  'home-01': require('./icons/home-01.png'),
  'graduation-cap': require('./icons/graduation-cap.png'),
  'logout-01': require('./icons/logout-01.png'),
  'microscope': require('./icons/microscope.png'),
  'more-horizontal': require('./icons/more-horizontal.png'),
  'music-note-01': require('./icons/music-note-01.png'),
  'paint-board': require('./icons/paint-board.png'),
  'scan': require('./icons/scan.png'),
  'school-01': require('./icons/school-01.png'),
  'search-01': require('./icons/search-01.png'),
  'tick-02': require('./icons/tick-02.png'),
  'trophy': require('./icons/trophy.png'),
  'user-add-01': require('./icons/user-add-01.png'),
  'user-circle': require('./icons/user-circle.png'),
  'user-x': require('./icons/user-x.png'),
  'users': require('./icons/users.png'),
}

// The same glyphs at the heavier Bold Text stroke (`npm run sync:icons`).
const boldSources: Record<string, number> = {
  'add-01': require('./icons/bold/add-01.png'),
  'bubble-chat': require('./icons/bold/bubble-chat.png'),
  'book-open-01': require('./icons/bold/book-open-01.png'),
  'calendar-clock': require('./icons/bold/calendar-clock.png'),
  'cancel-01': require('./icons/bold/cancel-01.png'),
  'checkmark-circle-02': require('./icons/bold/checkmark-circle-02.png'),
  'chevron-left': require('./icons/bold/chevron-left.png'),
  'chevron-right': require('./icons/bold/chevron-right.png'),
  'circle': require('./icons/bold/circle.png'),
  'clock-01': require('./icons/bold/clock-01.png'),
  'code': require('./icons/bold/code.png'),
  'file-edit': require('./icons/bold/file-edit.png'),
  'flash-off': require('./icons/bold/flash-off.png'),
  'flash': require('./icons/bold/flash.png'),
  'globe-02': require('./icons/bold/globe-02.png'),
  'home-01': require('./icons/bold/home-01.png'),
  'graduation-cap': require('./icons/bold/graduation-cap.png'),
  'logout-01': require('./icons/bold/logout-01.png'),
  'microscope': require('./icons/bold/microscope.png'),
  'more-horizontal': require('./icons/bold/more-horizontal.png'),
  'music-note-01': require('./icons/bold/music-note-01.png'),
  'paint-board': require('./icons/bold/paint-board.png'),
  'scan': require('./icons/bold/scan.png'),
  'school-01': require('./icons/bold/school-01.png'),
  'search-01': require('./icons/bold/search-01.png'),
  'tick-02': require('./icons/bold/tick-02.png'),
  'trophy': require('./icons/bold/trophy.png'),
  'user-add-01': require('./icons/bold/user-add-01.png'),
  'user-circle': require('./icons/bold/user-circle.png'),
  'user-x': require('./icons/bold/user-x.png'),
  'users': require('./icons/bold/users.png'),
}

export function featureIconSource(name: string, bold = false) {
  const catalog = bold ? boldSources : sources
  return catalog[name.replace(/^hugeicons-/, '')] ?? catalog['school-01']!
}

/** The iOS asset catalog name of the same Hugeicon, for native SwiftUI images such as menu items. */
export function featureIconAsset(name: string, bold = false) {
  const key = name.replace(/^hugeicons-/, '')
  return `hugeicons-${key in sources ? key : 'school-01'}${bold ? '-bold' : ''}`
}

export function FeatureIcon({ name, size = 22, color }: { name: string; size?: number; color?: ColorValue }) {
  const colors = useColors()
  const bold = useBoldText()
  return <Image source={featureIconSource(name, bold)} accessible={false} style={{ width: size, height: size, tintColor: color ?? colors.label }} />
}

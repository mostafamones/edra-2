import { Image, type ColorValue } from 'react-native'
import { useColors } from '../../features/sessions/screens/theme.ts'

const sources: Record<string, number> = {
  'add-01': require('./icons/add-01.png'),
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
  'user-x': require('./icons/user-x.png'),
  'users': require('./icons/users.png'),
}

export function featureIconSource(name: string) {
  return sources[name.replace(/^hugeicons-/, '')] ?? sources['school-01']
}

export function FeatureIcon({ name, size = 22, color }: { name: string; size?: number; color?: ColorValue }) {
  const colors = useColors()
  return <Image source={featureIconSource(name)} accessible={false} style={{ width: size, height: size, tintColor: color ?? colors.label }} />
}

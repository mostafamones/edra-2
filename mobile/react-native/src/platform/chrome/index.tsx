import { useContext } from 'react'
import { ActionSheetIOS, Alert, Linking, Platform } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { AssessmentPlatform } from '../../features/assignments/platform.ts'
import type { Dialog, SessionsPlatform } from '../../features/sessions/screens/platform.ts'
import { assessmentCamera } from '../camera/index.tsx'
import { NavigationBar } from './Bars'
import { GlassButton, GlassCapsule, Popup, Segmented } from './Controls'
import { FeatureIcon } from './FeatureIcon.tsx'
import { Header } from './InlineBar.tsx'
import { FeatureSheet } from './Sheet'
import { SheetBarContext, SheetContext, SheetHeader } from './sheetTypes.ts'

export { FeatureIcon }

export type FeatureChromeOptions = {
  /** The foundation owns the assessment workspace tab navigation and native search role. */
  Tabs: AssessmentPlatform['Tabs']
  hasSearchTab: boolean
  useIsFocused: SessionsPlatform['useIsFocused']
  /** The foundation can add tab bar clearance on its tab routes. */
  useRouteBottomInset: SessionsPlatform['useBottomInset']
  /** The pushed Sessions route's stack header. Sheets have their own feature bar. */
  RouteHeader: SessionsPlatform['Header']
}

export function createFeatureChrome(options: FeatureChromeOptions): { assessments: AssessmentPlatform; sessions: SessionsPlatform } {
  const camera = assessmentCamera((on) => <FeatureIcon name={on ? 'flash' : 'flash-off'} color="#FFFFFF" />)
  return {
    assessments: {
      Menu: Popup,
      Icon: FeatureIcon,
      NavigationBar,
      Tabs: options.Tabs,
      hasSearchTab: options.hasSearchTab,
      Sheet: ({ presentation, ...props }) => <FeatureSheet {...props} fullScreen={presentation === 'fullScreen'} />,
      Segmented,
      ContextMenu: ({ children, actions }) => actions.length ? (
        <Popup longPress items={actions.map((action, index) => ({ ...action, key: String(index) }))}>{children}</Popup>
      ) : <>{children}</>,
      GlassCapsule,
      ...camera,
    },
    sessions: {
      Icon: FeatureIcon,
      Header(props) {
        const sheetBar = useContext(SheetBarContext)
        const inSheet = useContext(SheetContext)
        const Bar = sheetBar ? SheetHeader : inSheet ? Header : options.RouteHeader
        return <Bar {...props} />
      },
      Sheet: (props) => <FeatureSheet {...props} notifyOnClose />,
      Menu: Popup,
      GlassButton,
      Camera: camera.Camera,
      requestCameraAccess: camera.requestCameraPermission,
      openSettings: () => void Linking.openSettings(),
      useIsFocused: options.useIsFocused,
      useBottomInset() {
        const inSheet = useContext(SheetContext)
        const { bottom } = useSafeAreaInsets()
        const routeInset = options.useRouteBottomInset()
        return inSheet ? bottom : routeInset
      },
      present,
    },
  }
}

function present({ style, title, message, actions, onDismiss }: Dialog) {
  const options = [...actions]
  if (style === 'actionSheet' && !options.some((action) => action.role === 'cancel')) {
    options.push({ title: 'Cancel', role: 'cancel', onPress: onDismiss })
  }
  if (style === 'actionSheet' && Platform.OS === 'ios') {
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title, message,
        options: options.map((action) => action.title),
        cancelButtonIndex: options.findIndex((action) => action.role === 'cancel'),
        destructiveButtonIndex: options.flatMap((action, index) => action.role === 'destructive' ? [index] : []),
      },
      (index) => {
        const action = options[index]
        if (action?.onPress) action.onPress()
        else if (!action || action.role === 'cancel') onDismiss?.()
      },
    )
    return
  }
  Alert.alert(title, message, options.map((action) => ({
    text: action.title, style: action.role, onPress: action.onPress,
  })), { cancelable: true, onDismiss })
}

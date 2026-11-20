import { useIsFocused } from '@react-navigation/native'
import { createFeatureChrome } from '../platform/chrome'
import { useRouteBottomInset } from './AppChrome.tsx'
import { NativeHeader } from './NativeHeader.tsx'
import { AssessmentNavigationBar, hasWorkspaceSearchTab, WorkspaceTabs } from './WorkspaceNavigation.tsx'

export { appChrome } from './AppChrome.tsx'

const { sessions, assessments } = createFeatureChrome({
  Tabs: WorkspaceTabs,
  hasSearchTab: hasWorkspaceSearchTab,
  useIsFocused,
  useRouteBottomInset,
  RouteHeader: NativeHeader,
})

export const featureChrome = {
  sessions,
  assessments: { ...assessments, NavigationBar: AssessmentNavigationBar },
}

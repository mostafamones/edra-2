import { NavigationContainer, NavigationIndependentTree, useIsFocused, useTheme } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { createContext, useContext, useLayoutEffect } from 'react'
import type { BarItem, NavigationBarProps, TabsProps } from '../features/assignments/platform.ts'
import type { BarItem as HeaderItem, SearchBar } from '../features/sessions/screens/platform.ts'
import { hasSearchTabs } from '../chrome/platform'
import { NavigationBar as SheetBar } from '../platform/chrome/Bars'
import { useBoldText } from '../platform/chrome/boldText.ts'
import { barIconSource, pageBackground, TabBottomArea } from './AppChrome.tsx'
import { createNativeTabsNavigator } from './createNativeTabsNavigator.tsx'
import { NativeHeader } from './NativeHeader.tsx'
import type { WorkspaceTabsParamList } from './routes.ts'

const Tabs = createNativeTabsNavigator<WorkspaceTabsParamList>()
const Stack = createNativeStackNavigator()
const ROUTES = { students: 'StudentsTab', scan: 'ScanTab', search: 'SearchTab' } as const
const WorkspaceHeader = createContext<{ search?: SearchBar } | null>(null)
const defaultHeader = {}
// Every workspace pane (Students, Scan) is a grouped page.
const paneOptions = { title: '', headerBackVisible: false, ...pageBackground('systemGroupedBackground') }

function asHeaderItem(item?: BarItem | null): HeaderItem | undefined {
  if (!item) return undefined
  if (item.kind === 'progress') return { title: 'In progress', busy: true, onPress: () => {} }
  if (item.kind === 'icon') return { title: item.label, icon: item.icon, disabled: item.disabled, onPress: item.onPress }
  return { ...item, role: item.prominent ? 'confirm' : undefined }
}

export function AssessmentNavigationBar(props: NavigationBarProps) {
  const workspace = useContext(WorkspaceHeader)
  if (!workspace) return <SheetBar {...props} />

  const { title, leading, trailing, search, children } = props
  const field = workspace.search ?? (search ? {
    value: search.text, onChange: search.onChange, placeholder: search.prompt, alwaysVisible: true,
  } : undefined)
  return (
    <>
      <NativeHeader title={title} leading={asHeaderItem(leading)} trailing={asHeaderItem(trailing)} search={field} />
      <TabBottomArea>{children}</TabBottomArea>
    </>
  )
}

function ScanContent({ render }: Pick<TabsProps, 'render'>) {
  return useIsFocused() ? render('scan') : null
}

export function WorkspaceTabs({ tabs, selected, onSelect, searchText, onSearchText, searchPrompt, render }: TabsProps) {
  const theme = useTheme()
  const bold = useBoldText()
  // The feature contract identifies confirmation by its checkmark on the search-role item.
  const actionTab = tabs.find((tab) => tab.search && tab.icon === 'tick-02')
  const hasSelected = tabs.some((tab) => tab.pane === selected)
  // When Search becomes Announce, keep the query so changing lists cannot clear the selection.
  const active = hasSelected && selected !== actionTab?.pane ? selected : 'students'

  useLayoutEffect(() => {
    if (!hasSelected) onSelect('students')
  }, [hasSelected, onSelect])

  return (
    <NavigationIndependentTree>
      <NavigationContainer theme={theme}>
        <Tabs.Navigator initialRouteName={ROUTES[active]} selectedRoute={ROUTES[active]} backBehavior="none"
          onSelectRoute={(route) => {
            const tab = tabs.find(({ pane }) => ROUTES[pane] === route)
            if (tab) onSelect(tab.pane)
          }}>
          {tabs.map((tab) => {
            const { pane, icon, title, search } = tab
            const announce = tab === actionTab
            const header = search && !announce
              ? { search: { value: searchText, onChange: onSearchText, placeholder: searchPrompt } }
              : defaultHeader
            return (
              <Tabs.Screen key={pane} name={ROUTES[pane]} options={{
                title,
                icon: barIconSource(icon, bold),
                role: search ? 'search' : undefined,
                activatesSearch: search && !announce,
                action: announce ? () => onSelect(pane) : undefined,
              }}>
                {() => (
                  <Stack.Navigator screenOptions={paneOptions}>
                    <Stack.Screen name="WorkspacePane">
                      {() => (
                        <WorkspaceHeader.Provider value={header}>
                          {announce ? null : pane === 'scan' ? <ScanContent render={render} /> : render(pane)}
                        </WorkspaceHeader.Provider>
                      )}
                    </Stack.Screen>
                  </Stack.Navigator>
                )}
              </Tabs.Screen>
            )
          })}
        </Tabs.Navigator>
      </NavigationContainer>
    </NavigationIndependentTree>
  )
}

export const hasWorkspaceSearchTab = hasSearchTabs

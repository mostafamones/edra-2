import { CommonActions, type NavigationHelpers, type ParamListBase, type StackNavigationState } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { useEffect, useRef, type ReactNode } from 'react'
import { Image, Platform, StyleSheet } from 'react-native'
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context'
import { SafeAreaView } from 'react-native-screens/experimental'
import type { AppChrome, StackProps, TabsProps } from '../app/contract.ts'
import { AcademyMenu } from '../chrome/AcademyMenu'
import { PageHeader } from '../chrome/PageHeader'
import { featureIconSource } from '../platform/chrome/FeatureIcon.tsx'
import { pointSized } from './barIcon.ts'
import { createNativeTabsNavigator } from './createNativeTabsNavigator.tsx'
import type { ShellTabsParamList } from './routes.ts'

const ShellTabs = createNativeTabsNavigator<ShellTabsParamList>()
const NativeStack = createNativeStackNavigator()
const SHELL_ROUTES = { sessions: 'SessionsTab', assessments: 'AssessmentsTab' } as const
const ROOT = 'Root'
const empty = () => null

/** A catalog icon declared at the native bar item's point size. */
export const barIconSource = (name: string) => pointSized(Image.resolveAssetSource(featureIconSource(name))!)

function Tabs({ selected, onSelect, tabs, academy }: TabsProps) {
  return (
    <ShellTabs.Navigator
      initialRouteName={SHELL_ROUTES[selected]}
      selectedRoute={SHELL_ROUTES[selected]}
      onSelectRoute={(name) => {
        const tab = tabs.find(({ key }) => SHELL_ROUTES[key] === name)
        if (tab) onSelect(tab.key)
      }}
      backBehavior="none"
    >
      {tabs.map(({ key, title, icon, content }) => (
        <ShellTabs.Screen key={key} name={SHELL_ROUTES[key]} options={{ title, icon: barIconSource(icon) }}>
          {() => Platform.OS === 'android' ? <TabBottomArea>{content}</TabBottomArea> : content}
        </ShellTabs.Screen>
      ))}
      <ShellTabs.Screen
        name="AcademyAction"
        component={empty}
        options={{
          title: academy.title,
          icon: barIconSource(academy.icon),
          accessibilityLabel: academy.accessibilityLabel,
          role: 'search',
          action: academy.onPress,
          testID: 'academy-tab',
        }}
      />
    </ShellTabs.Navigator>
  )
}

/** Native insets include the tab interface on Android and the controller's safe area on iOS. */
export function TabBottomArea({ children }: { children: ReactNode }) {
  return <SafeAreaView style={styles.fill} edges={{ bottom: true }}>{children}</SafeAreaView>
}

function RouteContent({ children }: { children: ReactNode }) {
  return Platform.OS === 'ios' ? <SafeAreaProvider>{children}</SafeAreaProvider> : children
}

export function useRouteBottomInset() {
  const { bottom } = useSafeAreaInsets()
  // Android's native inset view already moves the whole page above the tab bar.
  return Platform.OS === 'ios' ? bottom : 0
}

function Stack({ root, routes, onPop }: StackProps) {
  return (
    <NativeStack.Navigator
      screenOptions={{ headerBackButtonDisplayMode: 'minimal' }}
      layout={({ state, navigation, children }) => (
        <StackState state={state} navigation={navigation} routes={routes} onPop={onPop}>
          {children}
        </StackState>
      )}
    >
      <NativeStack.Screen name={ROOT} options={{ headerShown: false }}>{() => root}</NativeStack.Screen>
      {routes.map(({ key, element }) => (
        <NativeStack.Screen key={key} name={`Route:${key}`} options={{ title: '' }}>
          {() => <RouteContent>{element}</RouteContent>}
        </NativeStack.Screen>
      ))}
    </NativeStack.Navigator>
  )
}

function StackState({ state, navigation, routes, onPop, children }: Pick<StackProps, 'routes' | 'onPop'> & {
  state: StackNavigationState<ParamListBase>
  navigation: NavigationHelpers<ParamListBase>
  children: ReactNode
}) {
  const synchronized = useRef<readonly string[] | null>(null)
  // The navigator commits added/removed screen definitions before processing this reset.
  useEffect(() => {
    const desired = [ROOT, ...routes.map(({ key }) => `Route:${key}`)]
    const active = state.routes.slice(0, state.index + 1)
    const samePrefix = active.every((route, index) => route.name === desired[index])
    if (samePrefix && active.length === desired.length) {
      synchronized.current = desired
      return
    }

    const previous = synchronized.current
    synchronized.current = null
    if (
      previous?.length === desired.length && previous.every((name, index) => name === desired[index])
      && samePrefix && active.length < desired.length
    ) {
      // The desired path stayed the same, and native shortened a previously synchronized path.
      onPop(active.length - 1)
      return
    }

    const keys = new Map(active.map((route) => [route.name, route.key]))
    navigation.dispatch({
      ...CommonActions.reset({
        ...state,
        index: desired.length - 1,
        routes: desired.map((name) => ({ name, key: keys.get(name) })),
      }),
      target: state.key,
    })
  }, [navigation, onPop, routes, state])
  return children
}

export const appChrome: AppChrome = { Tabs, Stack, PageHeader, AcademyMenu }

const styles = StyleSheet.create({ fill: { flex: 1 } })

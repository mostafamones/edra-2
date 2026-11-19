import {
  createNavigatorFactory,
  type DefaultNavigatorOptions,
  type NavigatorTypeBagBase,
  type ParamListBase,
  type StaticConfig,
  type TabActionHelpers,
  TabActions,
  type TabNavigationState,
  TabRouter,
  type TabRouterOptions,
  type TypedNavigator,
  useNavigationBuilder,
} from "@react-navigation/native";
import { useState } from "react";
import { type ImageSourcePropType, Platform, PlatformColor } from "react-native";
import { Tabs } from "react-native-screens";

import { hasSearchTabs } from "../chrome/platform";

/** Route adapter onto react-native-screens' native tabs (UITabBarController / Material bottom navigation). */
export type NativeTabsOptions = {
  title?: string;
  /** Template image; tinted by the system. */
  icon?: ImageSourcePropType;
  /** iOS 26.1+: UISearchTab (detached trailing circle). Fixed for the tab's lifetime. */
  role?: "search";
  /** Search-role tab: selecting it focuses the header search bar of the stack inside it. */
  activatesSearch?: boolean;
  /** Action tab: native selection is prevented; a press calls this instead. Stacks stay untouched. */
  action?: () => void;
  accessibilityLabel?: string;
  /** Also the native tab item's accessibility identifier, for UI tests. */
  testID?: string;
};

type Props = DefaultNavigatorOptions<
  ParamListBase,
  string | undefined,
  TabNavigationState<ParamListBase>,
  NativeTabsOptions,
  Record<string, never>,
  unknown
> &
  TabRouterOptions;

function NativeTabsNavigator({ id, initialRouteName, backBehavior, children, screenOptions, screenListeners, layout }: Props) {
  const { state, descriptors, navigation, NavigationContent } = useNavigationBuilder<
    TabNavigationState<ParamListBase>,
    TabRouterOptions,
    TabActionHelpers<ParamListBase>,
    NativeTabsOptions,
    Record<string, never>
  >(TabRouter, { id, initialRouteName, backBehavior, children, screenOptions, screenListeners, layout });
  // Last provenance native acknowledged; JS requests build on it so stale ones are rejected.
  const [provenance, setProvenance] = useState(0);
  const focused = state.routes[state.index]!;

  return (
    <NavigationContent>
      <Tabs.Host
        navStateRequest={{ selectedScreenKey: focused.key, baseProvenance: provenance }}
        rejectStaleNavStateUpdates
        ios={Platform.OS === "ios" ? { tabBarTintColor: PlatformColor("systemBlue") } : undefined}
        onTabSelected={({ nativeEvent }) => {
          setProvenance(nativeEvent.provenance);
          const route = state.routes.find((r) => r.key === nativeEvent.selectedScreenKey);
          if (route && route.key !== focused.key) {
            navigation.dispatch({ ...TabActions.jumpTo(route.name), target: state.key });
          }
        }}
        onTabSelectionRejected={({ nativeEvent }) => setProvenance(nativeEvent.provenance)}
        onTabSelectionPrevented={({ nativeEvent }) => descriptors[nativeEvent.preventedScreenKey]?.options.action?.()}
      >
        {state.routes.map((route) => {
          const { options, render } = descriptors[route.key]!;
          const icon = options.icon ? { type: "imageSource" as const, imageSource: options.icon } : undefined;
          return (
            <Tabs.Screen
              key={route.key}
              screenKey={route.key}
              title={options.title ?? route.name}
              preventNativeSelection={options.action != null}
              tabBarItemAccessibilityLabel={options.accessibilityLabel}
              tabBarItemTestID={options.testID}
              ios={{
                role: hasSearchTabs ? options.role : undefined,
                automaticallyActivatesSearch: options.activatesSearch,
                icon: icon && { ...icon, renderingMode: "template" },
              }}
              android={{ icon }}
            >
              {render()}
            </Tabs.Screen>
          );
        })}
      </Tabs.Host>
    </NavigationContent>
  );
}

type TypeBag<ParamList extends ParamListBase> = {
  ParamList: ParamList;
  NavigatorID: string | undefined;
  State: TabNavigationState<ParamList>;
  ScreenOptions: NativeTabsOptions;
  EventMap: Record<string, never>;
  NavigationList: Record<keyof ParamList, unknown>;
  Navigator: typeof NativeTabsNavigator;
};

export function createNativeTabsNavigator<
  const ParamList extends ParamListBase,
  const Bag extends NavigatorTypeBagBase = TypeBag<ParamList>,
  const Config extends StaticConfig<Bag> = StaticConfig<Bag>,
>(config?: Config): TypedNavigator<Bag, Config> {
  return createNavigatorFactory(NativeTabsNavigator)(config);
}

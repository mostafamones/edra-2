export type ShellTabsParamList = {
  OverviewTab: undefined;
  SessionsTab: undefined;
  AssessmentsTab: undefined;
  StudentsTab: undefined;
  ConcernsTab: undefined;
};

export type WorkspaceTabsParamList = {
  StudentsTab: undefined;
  ScanTab: undefined;
  SearchTab: undefined;
};

/**
 * iOS assignment workspace: a native-stack full-screen modal. react-native-screens gives a presented screen the only
 * `RCTSurfaceTouchHandler` and nested screens defer to it. Inside a React Native `Modal` (which has its own handler)
 * every nested native-stack screen attached a second one; that handler then failed and sent touchCancel for the same
 * touch, so no Pressable in the workspace (rows, pills) ever fired.
 */
export const modalRouteOptions = { presentation: 'fullScreenModal', headerShown: false, gestureEnabled: false } as const;

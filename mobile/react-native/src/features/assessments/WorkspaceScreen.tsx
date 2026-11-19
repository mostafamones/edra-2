import { StackActions, useIsFocused, useNavigation } from "@react-navigation/native";
import { createNativeStackNavigator, type NativeStackNavigationOptions, type NativeStackNavigationProp, type NativeStackScreenProps } from "@react-navigation/native-stack";
import { useEffect } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors } from "../../chrome/colors";
import { HeaderIconButton, HeaderTextButton } from "../../chrome/HeaderIconButton";
import { icons } from "../../chrome/icons";
import { hasSearchTabs } from "../../chrome/platform";
import { assignments } from "../../fixtures";
import { createNativeTabsNavigator } from "../../navigation/createNativeTabsNavigator";
import type { RootStackParamList, WorkspaceStackParamList, WorkspaceTabsParamList } from "../../navigation/routes";
import { AnnounceSheet } from "./AnnounceSheet";
import { MarkingSheet } from "./MarkingSheet";
import { StudentsPane } from "./StudentsPane";
import { workspacePanes } from "./workspaceModel";
import { useWorkspace, WorkspaceProvider } from "./WorkspaceState";

const Stack = createNativeStackNavigator<WorkspaceStackParamList>();
const Tabs = createNativeTabsNavigator<WorkspaceTabsParamList>();
const PaneStack = createNativeStackNavigator();

/** Full-screen workspace with its own tab bar; its state and sheets live and die with it. */
export function WorkspaceScreen({ route }: NativeStackScreenProps<RootStackParamList, "Workspace">) {
  const assignment = assignments.find((a) => a.id === route.params.assignmentId)!;
  return (
    <WorkspaceProvider assignment={assignment}>
      <Stack.Navigator>
        <Stack.Screen name="WorkspaceTabs" component={WorkspaceTabs} options={{ headerShown: false }} />
        <Stack.Screen name="Marking" component={MarkingSheet} options={{ presentation: "modal", headerShown: false }} />
        <Stack.Screen name="Announce" component={AnnounceSheet} options={{ presentation: "modal", headerShown: false }} />
      </Stack.Navigator>
    </WorkspaceProvider>
  );
}

function WorkspaceTabs() {
  const ws = useWorkspace();
  const navigation = useNavigation<NativeStackNavigationProp<WorkspaceStackParamList>>();
  const panes = workspacePanes(ws.assignment, ws.selecting, hasSearchTabs);
  const reviewSelection = () => navigation.navigate("Announce", { studentIds: [...ws.selection] });

  return (
    <Tabs.Navigator>
      <Tabs.Screen name="StudentsTab" component={StudentsTab} options={{ title: "Students", icon: icons.students }} />
      {panes.scan ? <Tabs.Screen name="ScanTab" component={ScanTab} options={{ title: "Scan", icon: icons.scan }} /> : null}
      {panes.searchTab ? (
        <Tabs.Screen
          name="SearchTab"
          component={SearchTab}
          options={{
            role: "search",
            activatesSearch: true,
            // While selecting, the search tab is the confirm action (never selected).
            title: ws.selecting ? "Announce selected" : "Search",
            icon: ws.selecting ? icons.check : icons.search,
            action: ws.selecting ? reviewSelection : undefined,
          }}
        />
      ) : null}
    </Tabs.Navigator>
  );
}

/** Navigation bar shared by every pane: assignment title, Back (or Cancel while selecting). */
function useHeader(): NativeStackNavigationOptions {
  const ws = useWorkspace();
  const navigation = useNavigation<NativeStackNavigationProp<WorkspaceStackParamList>>();
  const panes = workspacePanes(ws.assignment, ws.selecting, hasSearchTabs);
  return {
    title: ws.assignment.title,
    headerLeft: () =>
      ws.selecting ? (
        <HeaderIconButton icon={icons.close} label="Cancel selection" onPress={() => ws.setSelecting(false)} />
      ) : (
        <HeaderIconButton icon={icons.back} label="Back" onPress={() => navigation.dispatch(StackActions.popTo("Shell"))} />
      ),
    headerRight: panes.toolbarAnnounce
      ? () => (
          <HeaderTextButton
            title={`Announce ${ws.selection.size}`}
            disabled={ws.selection.size === 0}
            onPress={() => navigation.navigate("Announce", { studentIds: [...ws.selection] })}
          />
        )
      : undefined,
  };
}

function StudentsTab() {
  const ws = useWorkspace();
  const header = useHeader();
  return (
    <PaneStack.Navigator>
      <PaneStack.Screen
        name="Students"
        options={{
          ...header,
          // Without a search tab, search lives in this navigation bar (pre-iOS 26.1 and Android).
          headerSearchBarOptions: hasSearchTabs
            ? undefined
            : { placeholder: "Search students in this assessment...", onChangeText: (e) => ws.setSearch(e.nativeEvent.text) },
        }}
      >
        {() => <StudentsPane origin="row" />}
      </PaneStack.Screen>
    </PaneStack.Navigator>
  );
}

function SearchTab() {
  const ws = useWorkspace();
  const header = useHeader();
  return (
    <PaneStack.Navigator>
      <PaneStack.Screen
        name="Search"
        options={{
          ...header,
          headerSearchBarOptions: {
            placeholder: "Search students in this assessment...",
            onChangeText: (e) => ws.setSearch(e.nativeEvent.text),
          },
        }}
      >
        {() => <SearchPane />}
      </PaneStack.Screen>
    </PaneStack.Navigator>
  );
}

function SearchPane() {
  const { setSearch } = useWorkspace();
  const focused = useIsFocused();
  // Leaving search shows every student again.
  useEffect(() => {
    if (!focused) setSearch("");
  }, [focused, setSearch]);
  return <StudentsPane origin="search" />;
}

function ScanTab() {
  const header = useHeader();
  return (
    <PaneStack.Navigator>
      <PaneStack.Screen name="Scan" options={header} component={ScanPane} />
    </PaneStack.Navigator>
  );
}

/** Fixture scanner: the camera is not integrated; a simulated code opens the marking sheet. */
function ScanPane() {
  const ws = useWorkspace();
  const navigation = useNavigation<NativeStackNavigationProp<WorkspaceStackParamList>>();
  const next = ws.students.find((s) => s.status === "Not received") ?? ws.students[0]!;
  return (
    <View style={styles.scan}>
      <Pressable
        accessibilityRole="button"
        onPress={() => navigation.navigate("Marking", { studentId: next.id, origin: "scan" })}
        style={[styles.scanButton, { backgroundColor: colors.accent }]}
      >
        <Text style={{ color: colors.onAccent, fontSize: 17, fontWeight: "600" }}>Simulate scan · {next.code}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  scan: { flex: 1, backgroundColor: "#000", alignItems: "center", justifyContent: "flex-end", paddingBottom: 140 },
  scanButton: { paddingHorizontal: 20, paddingVertical: 12, borderRadius: 999 },
});

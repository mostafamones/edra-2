import { CommonActions, useNavigation } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useState } from "react";
import { View } from "react-native";

import { AcademyMenu } from "../../chrome/AcademyMenu";
import { icons } from "../../chrome/icons";
import { createNativeTabsNavigator } from "../../navigation/createNativeTabsNavigator";
import type { AssessmentsStackParamList, SessionsStackParamList, ShellTabsParamList } from "../../navigation/routes";
import { AssessmentsHome } from "../assessments/AssessmentsHome";
import { SessionScreen } from "../sessions/SessionScreen";
import { SessionsHome } from "../sessions/SessionsHome";
import { useAppSession } from "./AppSession";

const Tabs = createNativeTabsNavigator<ShellTabsParamList>();
const SessionsStack = createNativeStackNavigator<SessionsStackParamList>();
const AssessmentsStack = createNativeStackNavigator<AssessmentsStackParamList>();

/** Signed-in shell: Sessions and Assessments keep their own stacks; Academy is an action tab. */
export function ShellScreen() {
  const session = useAppSession();
  const navigation = useNavigation();
  const [menuOpen, setMenuOpen] = useState(false);

  const select = (id: string) => {
    setMenuOpen(false);
    if (id === session.academy.id) return;
    session.select(id);
    // A new academy resets both histories and pending presentations, returning to Sessions.
    navigation.dispatch(CommonActions.reset({ index: 0, routes: [{ name: "Shell" }] }));
  };

  return (
    <View style={{ flex: 1 }}>
      <Tabs.Navigator initialRouteName="SessionsTab">
        <Tabs.Screen name="SessionsTab" component={SessionsTab} options={{ title: "Sessions", icon: icons.sessions }} />
        <Tabs.Screen name="AssessmentsTab" component={AssessmentsTab} options={{ title: "Assessments", icon: icons.assessments }} />
        <Tabs.Screen
          name="AcademyAction"
          component={Empty}
          options={{
            title: "Academy",
            icon: icons.academy,
            role: "search",
            action: () => setMenuOpen(true),
            accessibilityLabel: `Switch academy, current: ${session.academy.name}`,
            testID: "academy-tab",
          }}
        />
      </Tabs.Navigator>
      <AcademyMenu
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        academies={session.academies}
        selectedId={session.academy.id}
        onSelect={select}
        onSignOut={() => {
          setMenuOpen(false);
          session.signOut();
        }}
      />
    </View>
  );
}

const Empty = () => null;

function SessionsTab() {
  return (
    <SessionsStack.Navigator>
      <SessionsStack.Screen name="SessionsHome" component={SessionsHome} options={{ headerShown: false, title: "Sessions" }} />
      <SessionsStack.Screen name="Session" component={SessionScreen} />
    </SessionsStack.Navigator>
  );
}

function AssessmentsTab() {
  return (
    <AssessmentsStack.Navigator>
      <AssessmentsStack.Screen name="AssessmentsHome" component={AssessmentsHome} options={{ headerShown: false, title: "Assessments" }} />
    </AssessmentsStack.Navigator>
  );
}

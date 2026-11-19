import { DarkTheme, DefaultTheme, NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { StatusBar } from "expo-status-bar";
import { useCallback, useState } from "react";
import { Pressable, Text, useColorScheme, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { colors } from "./chrome/colors";
import { WorkspaceScreen } from "./features/assessments/WorkspaceScreen";
import { StartSessionSheet } from "./features/sessions/StartSessionSheet";
import { AppSessionProvider } from "./features/shell/AppSession";
import { ShellScreen } from "./features/shell/ShellScreen";
import type { RootStackParamList } from "./navigation/routes";

const Root = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  const scheme = useColorScheme();
  const [signedIn, setSignedIn] = useState(true);
  const signOut = useCallback(() => setSignedIn(false), []);
  return (
    <SafeAreaProvider>
      <StatusBar style="auto" />
      {signedIn ? (
        <AppSessionProvider onSignOut={signOut}>
          <NavigationContainer theme={scheme === "dark" ? DarkTheme : DefaultTheme}>
            <Root.Navigator id="root">
              <Root.Screen name="Shell" component={ShellScreen} options={{ headerShown: false }} />
              <Root.Screen
                name="StartSession"
                component={StartSessionSheet}
                options={{ presentation: "formSheet", title: "Start session", sheetAllowedDetents: [0.5, 1], sheetGrabberVisible: true }}
              />
              <Root.Screen name="Workspace" component={WorkspaceScreen} options={{ presentation: "fullScreenModal", headerShown: false }} />
            </Root.Navigator>
          </NavigationContainer>
        </AppSessionProvider>
      ) : (
        // Fixture sign-in: a new account scope starts with fresh navigation and state.
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background }}>
          <Pressable accessibilityRole="button" onPress={() => setSignedIn(true)} style={{ padding: 16 }}>
            <Text style={{ color: colors.accent, fontSize: 17, fontWeight: "600" }}>Sign in</Text>
          </Pressable>
        </View>
      )}
    </SafeAreaProvider>
  );
}

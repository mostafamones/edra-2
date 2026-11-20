import { DarkTheme, DefaultTheme, NavigationContainer } from "@react-navigation/native";
import { StatusBar } from "expo-status-bar";
import { useColorScheme } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { EdraApp } from "./app/EdraApp";
import { appChrome, featureChrome } from "./navigation";
import { appServices } from "./platform/services";

export default function App() {
  const scheme = useColorScheme();

  return (
    <SafeAreaProvider>
      <StatusBar style="auto" />
      <NavigationContainer theme={scheme === "dark" ? DarkTheme : DefaultTheme}>
        <EdraApp
          chrome={appChrome}
          sessions={featureChrome.sessions}
          assessments={featureChrome.assessments}
          services={appServices}
        />
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

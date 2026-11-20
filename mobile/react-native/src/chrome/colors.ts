import { Platform, PlatformColor, useColorScheme } from "react-native";

// iOS semantic system colors (light/dark handled natively); Material-like light/dark pairs on Android.
const ios = {
  label: PlatformColor("label"),
  secondaryLabel: PlatformColor("secondaryLabel"),
  fill: PlatformColor("secondarySystemFill"),
  separator: PlatformColor("separator"),
  accent: PlatformColor("systemBlue"),
};
const androidLight = { label: "#1c1b1f", secondaryLabel: "#49454f", fill: "#e8def8", separator: "#cac4d0", accent: "#6750a4" };
const androidDark = { label: "#e6e1e5", secondaryLabel: "#cac4d0", fill: "#4a4458", separator: "#49454f", accent: "#d0bcff" };

export function useChromeColors() {
  const dark = useColorScheme() === "dark";
  return Platform.OS === "ios" ? ios : dark ? androidDark : androidLight;
}

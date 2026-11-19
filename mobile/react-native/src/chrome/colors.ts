import { Platform, PlatformColor } from "react-native";

// iOS semantic system colors; Material-like fixed values on Android until a theme is chosen.
const pick = (ios: string, android: string) => (Platform.OS === "ios" ? PlatformColor(ios) : android);

export const colors = {
  label: pick("label", "#1c1b1f"),
  secondaryLabel: pick("secondaryLabel", "#49454f"),
  background: pick("systemGroupedBackground", "#fef7ff"),
  card: pick("secondarySystemGroupedBackground", "#ffffff"),
  fill: pick("secondarySystemFill", "#e8def8"),
  separator: pick("separator", "#cac4d0"),
  accent: pick("systemBlue", "#6750a4"),
  destructive: pick("systemRed", "#b3261e"),
  onAccent: "#ffffff",
};

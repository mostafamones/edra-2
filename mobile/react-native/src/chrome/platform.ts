import { isLiquidGlassAvailable } from "expo-glass-effect";
import { Platform } from "react-native";

const [major = 0, minor = 0] = Platform.OS === "ios" ? String(Platform.Version).split(".").map(Number) : [];

/** System Liquid Glass (iOS 26+, unless the app opts into compatibility mode). */
export const hasLiquidGlass = Platform.OS === "ios" && isLiquidGlassAvailable();

/**
 * UISearchTab through the UITab API (react-native-screens: iOS 26.1+). Gates the detached
 * academy circle and the workspace search tab. Earlier iOS keeps the classic tab bar layout:
 * academy is a third tab item and workspace search lives in the navigation bar.
 */
export const hasSearchTabs = major > 26 || (major === 26 && minor >= 1);

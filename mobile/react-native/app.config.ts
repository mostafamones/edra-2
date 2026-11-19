import type { ExpoConfig } from "expo/config";

// Candidate identity: installs beside the legacy SwiftUI comparison build (com.mostafamones.edra*).
// The release identity is chosen at cutover, not here.
const bundleId = "com.mostafamones.edra.rn";

const config: ExpoConfig = {
  name: "Edra RN",
  slug: "edra-instructor",
  scheme: "edra-rn",
  version: "0.1.0",
  orientation: "portrait",
  ios: {
    // Android stays light until its theme (and expo-system-ui) is chosen.
    userInterfaceStyle: "automatic",
    bundleIdentifier: bundleId,
    supportsTablet: false,
    // Signing team stays local: EDRA_APPLE_TEAM_ID=XXXXXXXXXX npm run ios
    appleTeamId: process.env.EDRA_APPLE_TEAM_ID || undefined,
  },
  android: {
    package: bundleId,
  },
  plugins: [
    ["expo-build-properties", { ios: { deploymentTarget: "17.0" } }],
    "expo-dev-client",
  ],
};

export default config;

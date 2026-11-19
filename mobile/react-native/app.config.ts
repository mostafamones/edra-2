import type { ExpoConfig } from "expo/config";

const candidateId = "com.mostafamones.edra.rn";
const releaseId = "com.mostafamones.edra";
const releaseTeam = "39YK2DQP92";
const upgradeVerification = process.env.EDRA_IOS_IDENTITY === "upgrade";
const signingTeam = process.env.EDRA_APPLE_TEAM_ID || undefined;

if (upgradeVerification && signingTeam !== releaseTeam) {
  throw new Error("iOS upgrade verification requires EDRA_APPLE_TEAM_ID=39YK2DQP92 to match the Swift app's Keychain identity.");
}

const config: ExpoConfig = {
  name: "Edra RN",
  slug: "edra-instructor",
  scheme: "edra-rn",
  version: "0.1.0",
  orientation: "portrait",
  ios: {
    userInterfaceStyle: "automatic",
    bundleIdentifier: upgradeVerification ? releaseId : candidateId,
    supportsTablet: false,
    appleTeamId: signingTeam,
    infoPlist: {
      EdraSupabaseURL: process.env.EXPO_PUBLIC_EDRA_SUPABASE_URL ?? "",
      EdraSupabasePublishableKey: process.env.EXPO_PUBLIC_EDRA_SUPABASE_PUBLISHABLE_KEY ?? "",
      EdraAPIOrigin: process.env.EXPO_PUBLIC_EDRA_API_ORIGIN ?? "",
    },
  },
  android: {
    package: candidateId,
    blockedPermissions: [
      "android.permission.RECORD_AUDIO",
      "android.permission.READ_EXTERNAL_STORAGE",
      "android.permission.WRITE_EXTERNAL_STORAGE",
    ],
  },
  plugins: [
    ["expo-build-properties", { ios: { deploymentTarget: "17.0" }, android: { usesCleartextTraffic: false } }],
    "expo-dev-client",
    ["expo-camera", {
      cameraPermission: "Edra uses the camera to scan student cards for attendance.",
      microphonePermission: false,
      recordAudioAndroid: false,
    }],
    ["expo-secure-store", { faceIDPermission: false }],
    "./plugins/with-edra-ios.cjs",
  ],
};

export default config;

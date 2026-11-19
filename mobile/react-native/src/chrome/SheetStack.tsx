import { createNativeStackNavigator, type NativeStackNavigationOptions } from "@react-navigation/native-stack";
import type { ReactNode } from "react";

const Inner = createNativeStackNavigator();

/** One-screen native stack inside a sheet, so the sheet gets a native navigation bar. */
export function SheetStack({ options, children }: { options: NativeStackNavigationOptions; children: () => ReactNode }) {
  return (
    <Inner.Navigator>
      <Inner.Screen name="Sheet" options={{ headerTitleAlign: "center", ...options }}>
        {children}
      </Inner.Screen>
    </Inner.Navigator>
  );
}

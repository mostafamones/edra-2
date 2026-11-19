import type { ReactNode } from "react";
import { StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors } from "./colors";

/** Photos-style root header: large title, academy name beneath, optional trailing control. */
export function PageHeader({ title, subtitle, trailing }: { title: string; subtitle: string; trailing?: (diameter: number) => ReactNode }) {
  const { top } = useSafeAreaInsets();
  // Sizes measured from Photos on a 393 pt wide iPhone, scaled to this width (as the SwiftUI shell).
  const scale = useWindowDimensions().width / 393;
  return (
    <View style={[styles.header, { paddingTop: top + 8 }]}>
      <View style={styles.row}>
        <Text accessibilityRole="header" style={[styles.title, { fontSize: 29 * scale, color: colors.label }]}>
          {title}
        </Text>
        {trailing?.(43 * scale)}
      </View>
      <Text numberOfLines={1} style={[styles.subtitle, { color: colors.secondaryLabel }]}>
        {subtitle}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 20, paddingBottom: 14, gap: 2 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { fontWeight: "700" },
  subtitle: { fontSize: 15, fontWeight: "600" },
});

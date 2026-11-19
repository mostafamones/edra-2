import { GlassView } from "expo-glass-effect";
import { Image, type ImageSourcePropType, Platform, Pressable, StyleSheet, View } from "react-native";

import { colors } from "./colors";
import { hasLiquidGlass } from "./platform";

type Props = { icon: ImageSourcePropType; label: string; onPress: () => void; diameter?: number };

/**
 * Circular icon button. iOS 26+: interactive Liquid Glass (UIGlassEffect, isInteractive).
 * Earlier iOS: the bordered-circle fallback (system fill). Android: tonal Material circle.
 */
export function GlassButton({ icon, label, onPress, diameter = 43 }: Props) {
  const size = { width: diameter, height: diameter, borderRadius: diameter / 2 };
  const content = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      android_ripple={{ color: colors.separator, borderless: true }}
      style={({ pressed }) => [styles.center, size, !hasLiquidGlass && pressed && Platform.OS === "ios" && { opacity: 0.5 }]}
    >
      <Image source={icon} style={{ width: diameter * 0.45, height: diameter * 0.45, tintColor: colors.label }} />
    </Pressable>
  );
  if (hasLiquidGlass) {
    return (
      <GlassView isInteractive glassEffectStyle="regular" style={size}>
        {content}
      </GlassView>
    );
  }
  return <View style={[size, { backgroundColor: colors.fill }]}>{content}</View>;
}

const styles = StyleSheet.create({ center: { alignItems: "center", justifyContent: "center" } });

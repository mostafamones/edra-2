import { Image, type ImageSourcePropType, Pressable, Text } from "react-native";

import { colors } from "./colors";

/** Content for native navigation-bar items (iOS 26 wraps bar items in system glass). */
export function HeaderIconButton({ icon, label, onPress }: { icon: ImageSourcePropType; label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} hitSlop={8} onPress={onPress}>
      <Image source={icon} style={{ width: 22, height: 22, tintColor: colors.label }} />
    </Pressable>
  );
}

export function HeaderTextButton({ title, onPress, disabled, bold }: { title: string; onPress: () => void; disabled?: boolean; bold?: boolean }) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} hitSlop={8} onPress={onPress}>
      <Text style={{ fontSize: 17, fontWeight: bold ? "600" : "400", color: colors.accent, opacity: disabled ? 0.4 : 1 }}>{title}</Text>
    </Pressable>
  );
}

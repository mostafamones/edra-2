import { Modal, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AcademyMenuRows } from "./AcademyMenuRows";
import type { AcademyMenuProps } from "./AcademyMenu.types";
import { colors } from "./colors";

/** Android: Material-style menu surface above the trailing bottom-navigation item. */
export function AcademyMenu({ open, onClose, ...rows }: AcademyMenuProps) {
  const { bottom } = useSafeAreaInsets();
  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <Pressable accessibilityLabel="Close menu" style={StyleSheet.absoluteFill} onPress={onClose} />
      <View style={[styles.menu, { bottom: bottom + 88, backgroundColor: colors.card }]}>
        <AcademyMenuRows {...rows} />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  menu: { position: "absolute", right: 12, borderRadius: 4, elevation: 3, overflow: "hidden" },
});

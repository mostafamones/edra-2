import { Image, Pressable, StyleSheet, Text, View } from "react-native";

import type { Academy } from "../fixtures";
import { colors } from "./colors";
import { icons } from "./icons";

/** Menu rows shared by the iOS popover and the Android menu: academies (current checked), Sign out. */
export function AcademyMenuRows(props: {
  academies: Academy[];
  selectedId: string;
  onSelect: (id: string) => void;
  onSignOut: () => void;
}) {
  return (
    <View style={styles.list}>
      {props.academies.map((a) => {
        const checked = a.id === props.selectedId;
        return (
          <Pressable
            key={a.id}
            accessibilityRole="button"
            accessibilityState={{ selected: checked }}
            onPress={() => props.onSelect(a.id)}
            style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.fill }]}
          >
            <Image source={icons.academy} style={[styles.icon, { tintColor: colors.label }]} />
            <Text numberOfLines={1} style={[styles.text, { color: colors.label }]}>
              {a.name}
            </Text>
            {checked ? <Image source={icons.check} style={[styles.check, { tintColor: colors.accent }]} /> : null}
          </Pressable>
        );
      })}
      <View style={[styles.divider, { backgroundColor: colors.separator }]} />
      <Pressable
        accessibilityRole="button"
        onPress={props.onSignOut}
        style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.fill }]}
      >
        <Image source={icons.signOut} style={[styles.icon, { tintColor: colors.destructive }]} />
        <Text style={[styles.text, { color: colors.destructive }]}>Sign out</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  list: { paddingVertical: 8, minWidth: 250 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 11, minHeight: 44 },
  icon: { width: 22, height: 22 },
  check: { width: 18, height: 18 },
  text: { flex: 1, fontSize: 17 },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: 4 },
});

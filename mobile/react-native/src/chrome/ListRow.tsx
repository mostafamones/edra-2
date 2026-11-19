import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors } from "./colors";

/** Inset-grouped style row used by fixture lists. */
export function ListRow(props: { title: string; detail?: string; trailing?: ReactNode; leading?: ReactNode; onPress?: () => void; onLongPress?: () => void; selected?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={props.selected === undefined ? undefined : { selected: props.selected }}
      onPress={props.onPress}
      onLongPress={props.onLongPress}
      android_ripple={{ color: colors.separator }}
      style={({ pressed }) => [styles.row, { backgroundColor: colors.card }, pressed && { opacity: 0.6 }]}
    >
      {props.leading}
      <View style={styles.text}>
        <Text style={[styles.title, { color: colors.label }]}>{props.title}</Text>
        {props.detail ? <Text style={[styles.detail, { color: colors.secondaryLabel }]}>{props.detail}</Text> : null}
      </View>
      {props.trailing}
    </Pressable>
  );
}

export function EmptyState({ title }: { title: string }) {
  return (
    <View style={styles.empty}>
      <Text style={[styles.emptyText, { color: colors.secondaryLabel }]}>{title}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12, minHeight: 44 },
  text: { flex: 1, gap: 2 },
  title: { fontSize: 17, fontWeight: "500" },
  detail: { fontSize: 13 },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32 },
  emptyText: { fontSize: 17, fontWeight: "600" },
});

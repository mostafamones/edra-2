import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { FlatList, Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { colors } from "../../chrome/colors";
import { icons } from "../../chrome/icons";
import { EmptyState, ListRow } from "../../chrome/ListRow";
import type { WorkspaceStackParamList } from "../../navigation/routes";
import { announceable, filters, visibleStudents } from "./workspaceModel";
import { useWorkspace } from "./WorkspaceState";

/** Students list shared by the Students and Search panes. The empty state replaces the list. */
export function StudentsPane({ origin }: { origin: "row" | "search" }) {
  const ws = useWorkspace();
  const navigation = useNavigation<NativeStackNavigationProp<WorkspaceStackParamList>>();
  const rows = visibleStudents(ws.students, ws.filter, ws.search);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filtersBar} contentContainerStyle={styles.filters}>
        {filters.map((f) => {
          const on = ws.filter === f;
          return (
            <Pressable
              key={f}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              onPress={() => ws.setFilter(f)}
              style={[styles.chip, { backgroundColor: on ? colors.accent : colors.fill }]}
            >
              <Text style={{ fontSize: 15, fontWeight: "500", color: on ? colors.onAccent : colors.label }}>{f}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
      {rows.length === 0 ? (
        <EmptyState title={ws.search || ws.filter !== "All" ? "No matching students" : "No students"} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(s) => s.id}
          keyboardDismissMode="on-drag"
          ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: colors.separator, marginLeft: 16 }} />}
          renderItem={({ item }) => {
            const selected = ws.selection.has(item.id);
            const eligible = announceable(item);
            return (
              <ListRow
                title={item.name}
                detail={`${item.code} · ${item.group}`}
                selected={ws.selecting ? selected : undefined}
                leading={
                  ws.selecting ? (
                    <Image
                      source={selected ? icons.circleCheck : icons.circle}
                      style={{ width: 20, height: 20, tintColor: selected ? colors.accent : colors.secondaryLabel, opacity: eligible || selected ? 1 : 0.3 }}
                    />
                  ) : undefined
                }
                trailing={
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={{ color: colors.label, fontVariant: ["tabular-nums"] }}>{item.total ?? "–"} / 10</Text>
                    <Text style={{ fontSize: 13, color: colors.secondaryLabel }}>{item.status}</Text>
                  </View>
                }
                onPress={() => {
                  if (!ws.selecting) navigation.navigate("Marking", { studentId: item.id, origin });
                  else if (selected || eligible) ws.toggle(item.id);
                }}
                onLongPress={
                  ws.assignment.canMark && !ws.selecting
                    ? () => {
                        ws.setSelecting(true);
                        if (eligible) ws.toggle(item.id);
                      }
                    : undefined
                }
              />
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  filtersBar: { flexGrow: 0 },
  filters: { paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999 },
});

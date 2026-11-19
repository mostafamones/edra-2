import { useNavigation } from "@react-navigation/native";
import { FlatList, View } from "react-native";

import { colors } from "../../chrome/colors";
import { EmptyState, ListRow } from "../../chrome/ListRow";
import { PageHeader } from "../../chrome/PageHeader";
import { assignments } from "../../fixtures";
import { useAppSession } from "../shell/AppSession";

export function AssessmentsHome() {
  const { academy } = useAppSession();
  const navigation = useNavigation();
  const items = assignments.filter((a) => a.academyId === academy.id);
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <PageHeader title="Assessments" subtitle={academy.name} />
      {items.length === 0 ? (
        <EmptyState title="No assignments" />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(a) => a.id}
          contentInsetAdjustmentBehavior="automatic"
          ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: colors.separator, marginLeft: 16 }} />}
          renderItem={({ item }) => (
            <ListRow
              title={item.title}
              detail={[item.state === "closed" ? "Closed" : "Active", item.canMark ? null : "Read-only", item.codesEnabled ? "Codes" : null]
                .filter(Boolean)
                .join(" · ")}
              onPress={() => navigation.navigate("Workspace", { assignmentId: item.id })}
            />
          )}
        />
      )}
    </View>
  );
}

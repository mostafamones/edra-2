import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { FlatList, View } from "react-native";

import { colors } from "../../chrome/colors";
import { EmptyState, ListRow } from "../../chrome/ListRow";
import { schedules } from "../../fixtures";
import type { RootStackParamList } from "../../navigation/routes";
import { useAppSession } from "../shell/AppSession";

/** Native form sheet; a start lands on the Sessions tab with the new session pushed. */
export function StartSessionSheet({ navigation }: NativeStackScreenProps<RootStackParamList, "StartSession">) {
  const { academy } = useAppSession();
  const items = schedules.filter((s) => s.academyId === academy.id);
  if (items.length === 0) return <EmptyState title="No schedules today" />;
  return (
    <FlatList
      style={{ backgroundColor: colors.background }}
      data={items}
      keyExtractor={(s) => s.id}
      ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: colors.separator, marginLeft: 16 }} />}
      renderItem={({ item }) => (
        <ListRow
          title={item.title}
          detail={item.time}
          onPress={() =>
            navigation.popTo("Shell", { screen: "SessionsTab", params: { screen: "Session", params: { sessionId: item.id } } })
          }
        />
      )}
    />
  );
}

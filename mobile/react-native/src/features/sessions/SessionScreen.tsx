import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useLayoutEffect } from "react";
import { FlatList, View } from "react-native";

import { colors } from "../../chrome/colors";
import { ListRow } from "../../chrome/ListRow";
import { liveSessions, schedules, students } from "../../fixtures";
import type { SessionsStackParamList } from "../../navigation/routes";

/** Pushed onto the Sessions stack with the native navigation bar (fixture roster). */
export function SessionScreen({ route, navigation }: NativeStackScreenProps<SessionsStackParamList, "Session">) {
  const session = liveSessions.find((s) => s.id === route.params.sessionId);
  // Started from a schedule (fixture): no roster yet.
  const title = session?.title ?? schedules.find((s) => s.id === route.params.sessionId)?.title ?? "Session";
  useLayoutEffect(() => navigation.setOptions({ title }), [navigation, title]);
  return (
    <FlatList
      style={{ backgroundColor: colors.background }}
      contentInsetAdjustmentBehavior="automatic"
      data={students.slice(0, session?.total ?? 0)}
      keyExtractor={(s) => s.id}
      ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: colors.separator, marginLeft: 16 }} />}
      renderItem={({ item, index }) => (
        <ListRow title={item.name} detail={item.code} selected={index < (session?.present ?? 0)} />
      )}
    />
  );
}

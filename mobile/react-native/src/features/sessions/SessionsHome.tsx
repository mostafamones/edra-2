import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { FlatList, View } from "react-native";

import { colors } from "../../chrome/colors";
import { GlassButton } from "../../chrome/GlassButton";
import { icons } from "../../chrome/icons";
import { EmptyState, ListRow } from "../../chrome/ListRow";
import { PageHeader } from "../../chrome/PageHeader";
import { liveSessions } from "../../fixtures";
import type { SessionsStackParamList } from "../../navigation/routes";
import { useAppSession } from "../shell/AppSession";

export function SessionsHome() {
  const { academy } = useAppSession();
  const navigation = useNavigation<NativeStackNavigationProp<SessionsStackParamList>>();
  const root = useNavigation(); // root-typed; navigate() bubbles to the root stack
  const sessions = liveSessions.filter((s) => s.academyId === academy.id);
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <PageHeader
        title="Sessions"
        subtitle={academy.name}
        trailing={(d) => <GlassButton icon={icons.add} label="Start session" diameter={d} onPress={() => root.navigate("StartSession")} />}
      />
      {sessions.length === 0 ? (
        <EmptyState title="No live sessions" />
      ) : (
        <FlatList
          data={sessions}
          keyExtractor={(s) => s.id}
          contentInsetAdjustmentBehavior="automatic"
          ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: colors.separator, marginLeft: 16 }} />}
          renderItem={({ item }) => (
            <ListRow
              title={item.title}
              detail={`${item.room} · ${item.present}/${item.total} present`}
              onPress={() => navigation.push("Session", { sessionId: item.id })}
            />
          )}
        />
      )}
    </View>
  );
}

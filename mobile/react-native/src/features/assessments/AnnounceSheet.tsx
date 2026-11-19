import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { FlatList, Text, View } from "react-native";

import { colors } from "../../chrome/colors";
import { HeaderIconButton, HeaderTextButton } from "../../chrome/HeaderIconButton";
import { icons } from "../../chrome/icons";
import { ListRow } from "../../chrome/ListRow";
import { SheetStack } from "../../chrome/SheetStack";
import type { WorkspaceStackParamList } from "../../navigation/routes";
import { announceable } from "./workspaceModel";
import { useWorkspace } from "./WorkspaceState";

/** Confirms an announcement for the explicitly selected students. All or nothing. */
export function AnnounceSheet({ route, navigation }: NativeStackScreenProps<WorkspaceStackParamList, "Announce">) {
  const ws = useWorkspace();
  const chosen = ws.students.filter((s) => route.params.studentIds.includes(s.id));
  const blocked = chosen.length === 0 || chosen.some((s) => !announceable(s));
  return (
    <SheetStack
      options={{
        title: "Announce?",
        headerLeft: () => <HeaderIconButton icon={icons.close} label="Cancel" onPress={() => navigation.goBack()} />,
        headerRight: () => (
          <HeaderTextButton
            title="Announce"
            bold
            disabled={blocked}
            onPress={() => {
              ws.announce(chosen.map((s) => s.id));
              navigation.goBack();
            }}
          />
        ),
      }}
    >
      {() => (
        <FlatList
          style={{ backgroundColor: colors.background }}
          contentInsetAdjustmentBehavior="automatic"
          data={chosen}
          keyExtractor={(s) => s.id}
          ListHeaderComponent={
            <Text style={{ color: colors.secondaryLabel, padding: 16 }}>
              {chosen.length === 1 ? "1 student" : `${chosen.length} students`}
            </Text>
          }
          ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: colors.separator, marginLeft: 16 }} />}
          renderItem={({ item }) => (
            <ListRow
              title={item.name}
              detail={announceable(item) ? undefined : `${item.status} · not announceable`}
              trailing={<Text style={{ color: colors.label, fontVariant: ["tabular-nums"] }}>{item.total ?? "–"} / 10</Text>}
            />
          )}
        />
      )}
    </SheetStack>
  );
}

import { usePreventRemove } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { type ReactNode, useEffect, useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { colors } from "../../chrome/colors";
import { HeaderIconButton, HeaderTextButton } from "../../chrome/HeaderIconButton";
import { icons } from "../../chrome/icons";
import { SheetStack } from "../../chrome/SheetStack";
import type { WorkspaceStackParamList } from "../../navigation/routes";
import { useWorkspace } from "./WorkspaceState";

const QUESTIONS = 5; // one page of five questions, as on web

/**
 * Full-height native sheet. Save sits in the navigation bar, so the keyboard never covers it;
 * iOS insets the scroll view natively for the keyboard. A dirty sheet blocks swipe/back dismissal.
 */
export function MarkingSheet({ route, navigation }: NativeStackScreenProps<WorkspaceStackParamList, "Marking">) {
  const ws = useWorkspace();
  const student = ws.students.find((s) => s.id === route.params.studentId)!;
  const [marks, setMarks] = useState<string[]>(Array(QUESTIONS).fill(""));
  const [feedback, setFeedback] = useState("");
  const dirty = marks.some(Boolean) || feedback !== "";
  const valid = marks.every((m) => m === "" || (/^\d+(\.\d+)?$/.test(m) && Number(m) <= 2));
  const total = marks.reduce((sum, m) => sum + (Number(m) || 0), 0);

  const [saved, setSaved] = useState(false);
  const save = () => {
    ws.saveMarks(student.id, total.toFixed(1));
    setSaved(true);
  };
  // Leave after the commit that clears the dismissal guard.
  useEffect(() => {
    if (saved) navigation.goBack();
  }, [saved, navigation]);

  usePreventRemove(dirty && !saved, ({ data }) =>
    Alert.alert("Save marks?", undefined, [
      { text: "Keep editing", style: "cancel" },
      { text: "Discard", style: "destructive", onPress: () => navigation.dispatch(data.action) },
      { text: "Save", onPress: save },
    ]),
  );

  return (
    <SheetStack
      options={{
        title: student.name,
        headerLeft: () => <HeaderIconButton icon={icons.close} label="Cancel" onPress={() => navigation.goBack()} />,
        headerRight: () => <HeaderTextButton title="Save" bold disabled={!dirty || !valid} onPress={save} />,
      }}
    >
      {() => (
        <KeyboardSafe>
          <ScrollView
            style={{ backgroundColor: colors.background }}
            contentContainerStyle={styles.content}
            automaticallyAdjustKeyboardInsets
            keyboardDismissMode="interactive"
            keyboardShouldPersistTaps="handled"
          >
            <Text style={[styles.identity, { color: colors.secondaryLabel }]}>
              {student.code} · {student.group} · {route.params.origin}
            </Text>
            {marks.map((m, i) => (
              <View key={i} style={[styles.row, { backgroundColor: colors.card }]}>
                <Text style={[styles.label, { color: colors.label }]}>Question {i + 1}</Text>
                <TextInput
                  accessibilityLabel={`Question ${i + 1} mark out of 2`}
                  value={m}
                  onChangeText={(v) => setMarks((cur) => cur.map((x, j) => (j === i ? v : x)))}
                  keyboardType="decimal-pad"
                  placeholder="–"
                  placeholderTextColor={colors.secondaryLabel}
                  style={[styles.input, { color: colors.label }]}
                />
                <Text style={{ color: colors.secondaryLabel }}>/ 2</Text>
              </View>
            ))}
            {!valid ? <Text style={{ color: colors.destructive }}>Marks must be between 0 and 2.</Text> : null}
            <Text style={[styles.total, { color: colors.label }]}>Total {total.toFixed(1)} / 10</Text>
            <TextInput
              accessibilityLabel="Feedback"
              value={feedback}
              onChangeText={setFeedback}
              multiline
              placeholder="Feedback"
              placeholderTextColor={colors.secondaryLabel}
              style={[styles.feedback, { color: colors.label, backgroundColor: colors.card }]}
            />
          </ScrollView>
        </KeyboardSafe>
      )}
    </SheetStack>
  );
}

// iOS uses the scroll view's native keyboard insets; Android resizes with padding (edge-to-edge).
function KeyboardSafe({ children }: { children: ReactNode }) {
  if (Platform.OS === "ios") return children;
  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
      {children}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 10, paddingBottom: 40 },
  identity: { fontSize: 15 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, minHeight: 52, borderRadius: 10 },
  label: { flex: 1, fontSize: 17 },
  input: { width: 64, fontSize: 17, textAlign: "right", paddingVertical: 12 },
  total: { fontSize: 17, fontWeight: "600", marginTop: 6 },
  feedback: { minHeight: 120, fontSize: 17, borderRadius: 10, padding: 12, textAlignVertical: "top" },
});

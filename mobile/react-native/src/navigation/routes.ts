import type { NavigatorScreenParams } from "@react-navigation/native";

// Route contract. Workflow agents replace fixture screens behind these names; renaming a
// route or changing its params is a contract change (update README "Integration contract").

export type RootStackParamList = {
  Shell: NavigatorScreenParams<ShellTabsParamList> | undefined;
  /** formSheet over the shell. */
  StartSession: undefined;
  /** fullScreenModal with its own tab bar; owns workspace state for its lifetime. */
  Workspace: { assignmentId: string };
};

export type ShellTabsParamList = {
  SessionsTab: NavigatorScreenParams<SessionsStackParamList> | undefined;
  AssessmentsTab: NavigatorScreenParams<AssessmentsStackParamList> | undefined;
  /** Action tab: never selected; opens the academy popover. */
  AcademyAction: undefined;
};

export type SessionsStackParamList = {
  SessionsHome: undefined;
  Session: { sessionId: string };
};

export type AssessmentsStackParamList = {
  AssessmentsHome: undefined;
};

export type WorkspaceStackParamList = {
  WorkspaceTabs: NavigatorScreenParams<WorkspaceTabsParamList> | undefined;
  /** Full-height sheet; keyboard-safe Save lives in its navigation bar. */
  Marking: { studentId: string; origin: "row" | "search" | "scan" };
  Announce: { studentIds: string[] };
};

export type WorkspaceTabsParamList = {
  StudentsTab: undefined;
  ScanTab: undefined;
  SearchTab: undefined;
};

declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}

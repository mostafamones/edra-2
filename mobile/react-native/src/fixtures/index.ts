// Fixture-only data for chrome validation. No network, auth or Supabase access.
export type Academy = { id: string; name: string };
export type LiveSession = { id: string; academyId: string; title: string; room: string; present: number; total: number };
export type Schedule = { id: string; academyId: string; title: string; time: string };
export type Assignment = {
  id: string;
  academyId: string;
  title: string;
  state: "active" | "closed";
  canMark: boolean;
  codesEnabled: boolean;
};
export type Student = { id: string; name: string; code: string; group: string; total: string | null; status: string };

export const academies: Academy[] = [
  { id: "a1", name: "Nile Science Academy" },
  { id: "a2", name: "Cairo Language Centre" },
];

export const liveSessions: LiveSession[] = [
  { id: "s1", academyId: "a1", title: "Physics · Grade 11", room: "Hall B", present: 18, total: 24 },
  { id: "s2", academyId: "a1", title: "Chemistry · Grade 10", room: "Lab 2", present: 9, total: 20 },
  { id: "s3", academyId: "a2", title: "English B2", room: "Room 4", present: 12, total: 14 },
];

export const schedules: Schedule[] = [
  { id: "c1", academyId: "a1", title: "Biology · Grade 12", time: "16:00" },
  { id: "c2", academyId: "a1", title: "Maths · Grade 11", time: "18:00" },
  { id: "c3", academyId: "a2", title: "French A2", time: "17:30" },
];

export const assignments: Assignment[] = [
  { id: "w1", academyId: "a1", title: "Kinematics quiz", state: "active", canMark: true, codesEnabled: true },
  { id: "w2", academyId: "a1", title: "Stoichiometry sheet", state: "active", canMark: true, codesEnabled: false },
  { id: "w3", academyId: "a1", title: "Optics homework", state: "closed", canMark: false, codesEnabled: true },
  { id: "w4", academyId: "a2", title: "Reading check", state: "active", canMark: true, codesEnabled: true },
];

const names = ["Mariam Adel", "Omar Hassan", "Youssef Samir", "Nour Khaled", "Salma Tarek", "Karim Fathy",
  "Laila Mostafa", "Ahmed Nabil", "Hana Ibrahim", "Ziad Wael", "Farida Sherif", "Mostafa Reda"];

export const students: Student[] = names.map((name, i) => ({
  id: `st${i + 1}`,
  name,
  code: `E-${1040 + i}`,
  group: i % 2 ? "Group A" : "Group B",
  total: i % 3 === 0 ? null : (6 + (i % 5)).toFixed(1),
  status: i % 3 === 0 ? "Not received" : i % 3 === 1 ? "Marked" : "Announced",
}));

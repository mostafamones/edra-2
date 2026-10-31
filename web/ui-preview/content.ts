let failed = false;
export async function loadUnitPanels() {
  const state = new URLSearchParams(location.search).get("state");
  if (state === "loading") return new Promise<never>(() => {});
  if (state === "error" && !failed) { failed = true; return { history: { ok: false, message: "Service unavailable. Try again." }, assessments: { ok: true, value: [] }, sources: { ok: true, value: [] } }; }
  const document = { title: "C++ Fundamentals", description: "", accessDays: 7, items: [] };
  const by = { id: "preview-staff", name: "Yassin Tamer", avatarUrl: undefined };
  const history = state === "empty" || state === "error" ? { drafts: [], revisions: [] } : {
    drafts: [{ kind: "saved", document: { ...document, accessDays: 14 }, at: "2026-10-28T09:00:00Z", by }],
    revisions: [{ revision: 1, document, at: "2026-10-27T10:00:00Z", by }],
  };
  return { history: { ok: true, value: history }, assessments: { ok: true, value: [] }, sources: { ok: true, value: [] } };
}

const noWrite = async () => ({ ok: false as const, message: "Preview only. Changes are not saved." });
export const changeUnit = noWrite;
export const saveUnitVersion = noWrite;

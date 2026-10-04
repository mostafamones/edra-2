import { afterEach, describe, expect, it } from "vitest";

import { clearPendingImportFile, peekPendingImportFile, setPendingImportFile } from "./handoff";

afterEach(clearPendingImportFile);

describe("import file handoff", () => {
  it("only exposes the selected file in its academy", () => {
    const file = new File(["name,phone"], "students.csv", { type: "text/csv" });
    setPendingImportFile({ academyId: "academy-a", file, format: "csv" });

    expect(peekPendingImportFile("academy-a")?.file).toBe(file);
    expect(peekPendingImportFile("academy-b")).toBeNull();
  });

  it("does not retain the previous file after clearing or replacing it", () => {
    const file = new File(["[]"], "students.json", { type: "application/json" });
    setPendingImportFile({ academyId: "academy-a", file, format: "json" });
    clearPendingImportFile();
    expect(peekPendingImportFile("academy-a")).toBeNull();

    setPendingImportFile({ academyId: "academy-a", file, format: "json" });
    setPendingImportFile({ academyId: "academy-b", file, format: "json" });
    expect(peekPendingImportFile("academy-a")).toBeNull();
    expect(peekPendingImportFile("academy-b")?.format).toBe("json");
  });
});

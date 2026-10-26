// @vitest-environment jsdom
import { expect, it } from "vitest";
import { literalSearch } from "@/lib/search";
import { commandShortcut, matchesSearch, slashOpensSearch } from "./types";
const key = { key: "/", ctrlKey: false, metaKey: false, altKey: false, isComposing: false, defaultPrevented: false, repeat: false };
it("keeps slash as a secondary shortcut outside editors", () => {
  expect(slashOpensSearch(key, document.body)).toBe(true);
  expect(slashOpensSearch({ ...key, key: "k", ctrlKey: true }, document.body)).toBe(false);
  expect(slashOpensSearch({ ...key, metaKey: true }, document.body)).toBe(false);
  expect(slashOpensSearch({ ...key, isComposing: true }, document.body)).toBe(false);
});
it("recognizes Ctrl+K and Command+K without consuming Alt combinations, repeats or composition", () => {
  expect(commandShortcut({ ...key, key: "k", ctrlKey: true })).toBe(true);
  expect(commandShortcut({ ...key, key: "K", metaKey: true })).toBe(true);
  expect(commandShortcut({ ...key, key: "k" })).toBe(false);
  for (const modifier of ["altKey", "repeat", "isComposing", "defaultPrevented"] as const) {
    expect(commandShortcut({ ...key, key: "k", ctrlKey: true, [modifier]: true })).toBe(false);
  }
});
it.each(["input", "textarea", "select"])("does not capture slash inside %s", tag => {
  expect(slashOpensSearch(key, document.createElement(tag))).toBe(false);
});
it("preserves slash in rich-text editors, custom textboxes and dialogs", () => {
  const editor = document.createElement("div"); editor.setAttribute("contenteditable", "true");
  const child = document.createElement("span"); editor.append(child);
  expect(slashOpensSearch(key, child)).toBe(false);
  editor.removeAttribute("contenteditable"); editor.setAttribute("role", "textbox");
  expect(slashOpensSearch(key, child)).toBe(false);
  editor.setAttribute("role", "dialog"); expect(slashOpensSearch(key, child)).toBe(false);
});
it("normalizes Arabic variants and matches all query terms", () => {
  expect(matchesSearch("مُراجعة إحصاء", "مراجعه")).toBe(false);
  expect(matchesSearch("مُراجعة إحصاء", "مراجعة احصاء")).toBe(true);
  expect(matchesSearch("Create assignment", "ASSIGN create")).toBe(true);
});
it("treats SQL wildcard input as literal search text", () => {
  expect(literalSearch("10%_\\")).toBe("%10\\%\\_\\\\%");
});

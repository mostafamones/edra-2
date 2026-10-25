import { describe, expect, it } from "vitest";
import type { ContentItem } from "../types";
import { dropOptions, linkMaterial, materialTree, moveMaterial, placeMaterial, removeMaterial, unlinkMaterial } from "./tree";

const quiz: ContentItem = { id: "q", kind: "assessment", title: "Quiz", assessmentKind: "quiz", assessmentId: "quiz-1" };
const homework: ContentItem = { id: "h", kind: "assessment", title: "Homework", assessmentKind: "assignment", assessmentId: "hw-1" };
const video: ContentItem = { id: "v", kind: "explanation", title: "Intro", assetId: "a-v" };
const other: ContentItem = { id: "o", kind: "explanation", title: "Part two", assetId: "a-o" };
const sheet: ContentItem = { id: "s", kind: "document", title: "Sheet", assetId: "a-s" };
const answer: ContentItem = { id: "x", kind: "answer", title: "Solution", assetId: "a-x", assessmentKind: "quiz", assessmentId: "quiz-1" };
const notes: ContentItem = { id: "n", kind: "document", title: "Notes", assetId: "a-n", attached: true };
const isDocument = (item: ContentItem) => item.kind === "document" || item.assetId === "a-s" || item.assetId === "a-n";
const ids = (items: ContentItem[]) => items.map(i => i.id);
const shape = (items: ContentItem[]) => materialTree(items).map(n => [n.item.id, ids(n.children)]);

describe("material tree", () => {
  it("nests answers under their assessment and attached documents under the video before them", () => {
    expect(shape([answer, video, notes, quiz, sheet])).toEqual([["v", ["n"]], ["q", ["x"]], ["s", []]]);
    // An attached document with no video before it is shown on its own rather than lost.
    expect(shape([notes, video])).toEqual([["n", []], ["v", []]]);
  });
  it("offers attaching documents to videos, anything but assessments to assessments, and keeps assessments top-level", () => {
    const items = [video, quiz, answer, homework, sheet];
    expect(dropOptions(items, video, quiz, isDocument)).toEqual({ link: quiz, place: true });
    expect(dropOptions(items, video, answer, isDocument)).toEqual({ link: quiz, place: false });
    expect(dropOptions(items, answer, quiz, isDocument)).toEqual({ link: null, place: true });
    expect(dropOptions(items, answer, homework, isDocument).link).toBe(homework);
    expect(dropOptions(items, homework, answer, isDocument)).toEqual({ link: null, place: false });
    expect(dropOptions(items, sheet, video, isDocument).link).toBe(video);
    expect(dropOptions(items, quiz, video, isDocument).link).toBeNull();
    expect(dropOptions([video, other], other, video, isDocument)).toEqual({ link: null, place: true });
  });
  it("links material as the last child, converting its kind", () => {
    const answered = linkMaterial([sheet, quiz, answer, video], sheet, quiz, isDocument);
    expect(ids(answered)).toEqual(["q", "x", "s", "v"]);
    expect(answered[2]).toEqual({ ...sheet, kind: "answer", assessmentKind: "quiz", assessmentId: "quiz-1" });
    const attached = linkMaterial([video, quiz, answer, sheet], sheet, video, isDocument);
    expect(ids(attached)).toEqual(["v", "s", "q", "x"]);
    expect(attached[1]).toEqual({ ...sheet, attached: true });
    // An answer document moved onto a video becomes an attached document.
    expect(linkMaterial([video, quiz, { ...sheet, kind: "answer", assessmentKind: "quiz", assessmentId: "quiz-1" }], { ...sheet, kind: "answer", assessmentKind: "quiz", assessmentId: "quiz-1" }, video, isDocument)[1]).toEqual({ ...sheet, attached: true });
    // A video becoming an answer leaves its attached documents behind as standalone documents.
    expect(linkMaterial([video, notes, quiz], video, quiz, isDocument)).toEqual([{ id: "n", kind: "document", title: "Notes", assetId: "a-n" }, quiz, { ...video, kind: "answer", assessmentKind: "quiz", assessmentId: "quiz-1" }]);
    expect(linkMaterial([video, quiz], video, other, isDocument)).toEqual([video, quiz]);
  });
  it("detaches a child dropped among top-level material, restoring its kind", () => {
    const placed = placeMaterial([video, quiz, answer, sheet], "x", "v", false, isDocument);
    expect(ids(placed)).toEqual(["x", "v", "q", "s"]);
    expect(placed[0]).toEqual({ id: "x", kind: "explanation", title: "Solution", assetId: "a-x" });
    expect(unlinkMaterial([quiz, answer, video], "x", isDocument)[1].kind).toBe("explanation");
    expect(unlinkMaterial([video, notes, quiz], "n", isDocument)).toEqual([video, { id: "n", kind: "document", title: "Notes", assetId: "a-n" }, quiz]);
  });
  it("moves a parent together with its children and reorders children among themselves", () => {
    const second = { ...answer, id: "y" };
    expect(ids(placeMaterial([quiz, answer, second, video, notes], "q", "v", true, isDocument))).toEqual(["v", "n", "q", "x", "y"]);
    expect(ids(placeMaterial([quiz, answer, second], "y", "x", false, isDocument))).toEqual(["q", "y", "x"]);
    expect(placeMaterial([quiz, answer, homework], "h", "x", false, isDocument)).toEqual([quiz, answer, homework]);
  });
  it("moves one step among siblings and stays put at the ends", () => {
    const second = { ...notes, id: "m" };
    expect(ids(moveMaterial([video, notes, second, quiz], "v", 1, isDocument))).toEqual(["q", "v", "n", "m"]);
    expect(ids(moveMaterial([video, notes, second, quiz], "m", -1, isDocument))).toEqual(["v", "m", "n", "q"]);
    expect(moveMaterial([video, notes, quiz], "n", 1, isDocument)).toEqual([video, notes, quiz]);
    expect(moveMaterial([video, quiz], "v", -1, isDocument)).toEqual([video, quiz]);
  });
  it("keeps a removed parent's children as ordinary material", () => {
    expect(removeMaterial([quiz, answer, video], "q", isDocument)).toEqual([{ id: "x", kind: "explanation", title: "Solution", assetId: "a-x" }, video]);
    expect(removeMaterial([video, notes], "v", isDocument)).toEqual([{ id: "n", kind: "document", title: "Notes", assetId: "a-n" }]);
  });
});

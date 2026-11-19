import { expect, it } from "vitest";
import { findPrintedMarks, readMarkedChoices } from "./marked-choices";

it("matches a two-column math question by all its options and reads the highlight on the option text", () => {
  const word = (text: string, x: number, baseline: number, width = 10) => ({ text, x, baseline, width, height: 12 });
  const marked = word("O(n", 218, 110, 20);
  const groups = readMarkedChoices([
    word("a)", 200, 110), marked, word("3", 238, 106, 4), word(")", 242, 110, 4),
    word("b)", 320, 110), word("O(n²)", 338, 110),
    word("c)", 200, 124), word("O(n⁵)", 218, 124),
    word("d)", 320, 124), word("O(n)", 338, 124),
    word("for(;;)", 40, 110, 50),
  ], fragment => fragment === marked);
  const choices = ["O(n³)", "O(n^2)", "O(n⁵)", "O(n)"].map((text, index) => ({ key: "abcd"[index], text }));

  expect(findPrintedMarks(groups, choices)).toEqual(["A"]);
  expect(findPrintedMarks(groups, choices.map(option => ({ ...option, text: option.key === "a" ? "O(n⁴)" : option.text })))).toEqual([]);
  expect(findPrintedMarks([...groups, { ...groups[0], markedKeys: [] }], choices)).toEqual([]);
});

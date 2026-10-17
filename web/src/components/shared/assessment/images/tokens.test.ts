import { describe, expect, it } from "vitest";

import { imageIds, imageToken, questionImageCount, splitImages } from "./tokens";

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

describe("question image tokens", () => {
  it("splits text into text and image runs", () => {
    expect(splitImages(`See ${imageToken(A)} and${imageToken(B)}`)).toEqual([
      { type: "text", text: "See " }, { type: "image", id: A }, { type: "text", text: " and" }, { type: "image", id: B },
    ]);
    expect(splitImages("plain")).toEqual([{ type: "text", text: "plain" }]);
    expect(splitImages("")).toEqual([]);
  });

  it("ignores malformed tokens", () => {
    expect(imageIds("{{image:not-a-uuid}} {{image:AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA}}")).toEqual([]);
  });

  it("counts images across a question's text and choices", () => {
    expect(questionImageCount({ prompt: imageToken(A) + imageToken(B), choices: [{ label: imageToken(A) }, { label: "x" }] })).toBe(3);
  });
});

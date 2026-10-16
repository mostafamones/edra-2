import { describe, expect, it } from "vitest";
import { z } from "zod";

import { draftValidation } from "./draft-form";

type Values = { title: string; parts: { title: string }[] };

const { resolver, parse } = draftValidation<Values, { name: string; count: number }>({
  check: (values) => ({
    ...(values.title ? {} : { title: "Enter a title." }),
    ...Object.fromEntries(values.parts.flatMap((part, index) => (part.title ? [] : [[`parts.${index}.title`, "Name this part."]]))),
  }),
  toDraft: (values) => ({ name: values.title, count: values.parts.length }),
  schema: z.object({ name: z.string(), count: z.number().max(1, "Too many parts.") }),
});

const run = (values: Values) => resolver(values, undefined, { fields: {}, shouldUseNativeValidation: false });

describe("draftValidation", () => {
  it("nests field messages the way react-hook-form reads them", async () => {
    const result = await run({ title: "", parts: [{ title: "A" }, { title: "" }] });
    expect(result.errors).toMatchObject({ title: { message: "Enter a title." }, parts: [undefined, { title: { message: "Name this part." } }] });
  });

  it("falls back to the draft schema once the field checks pass", async () => {
    const result = await run({ title: "T", parts: [{ title: "A" }, { title: "B" }] });
    expect(result.errors).toMatchObject({ count: { message: "Too many parts." } });
    expect(parse({ title: "T", parts: [{ title: "A" }, { title: "B" }] })).toBeNull();
  });

  it("returns the draft for valid input", async () => {
    const values = { title: "T", parts: [{ title: "A" }] };
    expect(await run(values)).toEqual({ values: { name: "T", count: 1 }, errors: {} });
    expect(parse(values)).toEqual({ name: "T", count: 1 });
  });
});

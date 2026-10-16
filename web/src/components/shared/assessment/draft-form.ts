import type { FieldErrors, FieldValues, Resolver } from "react-hook-form";
import type { z } from "zod";

/** `parts.0.title` → `{ parts: [{ title }] }`, the nested shape react-hook-form reports errors in. */
function nest<V extends FieldValues>(flat: Record<string, string>): FieldErrors<V> {
  const root: Record<string, unknown> = {};
  for (const [path, message] of Object.entries(flat)) {
    const keys = path.split(".");
    let node = root;
    keys.forEach((key, position) => {
      if (position === keys.length - 1) {
        node[key] = { type: "validate", message };
        return;
      }
      const next = keys[position + 1];
      node[key] ??= /^\d+$/.test(next) ? [] : {};
      node = node[key] as Record<string, unknown>;
    });
  }
  return root as FieldErrors<V>;
}

/**
 * Validation for a form that has its own field checks (one message per path) and a draft schema that
 * decides what the server accepts. Builds the react-hook-form resolver and the quiet check automatic
 * saving uses; both give the same answer.
 */
export function draftValidation<V extends FieldValues, D>(config: {
  /** One message per field path, such as `parts.0.title`. */
  check: (values: V) => Record<string, string>;
  toDraft: (values: V) => D;
  schema: z.ZodType;
}): { resolver: Resolver<V, unknown, D>; parse: (values: V) => D | null } {
  const { check, toDraft, schema } = config;
  return {
    resolver: async (values) => {
      const flat = check(values);
      const draft = toDraft(values);
      if (Object.keys(flat).length === 0) {
        const parsed = schema.safeParse(draft);
        if (parsed.success) return { values: draft, errors: {} };
        for (const issue of parsed.error.issues) flat[issue.path.join(".") || "root"] ??= issue.message;
      }
      return { values: {}, errors: nest<V>(flat) };
    },
    parse: (values) => {
      if (Object.keys(check(values)).length > 0) return null;
      const draft = toDraft(values);
      return schema.safeParse(draft).success ? draft : null;
    },
  };
}

import { expect, it } from "vitest";
import { CARDS_PER_PAGE, PRINT_STATUSES, printCards, printPages, printSignature } from "./pages";

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const code = (i: number) => Array.from({ length: 8 }, (_, d) => ALPHABET[Math.floor(i / 31 ** d) % 31]).join("");
const batch = (n: number, status: "unused" | "redeemed" | "revoked" = "unused") => Array.from({ length: n }, (_, i) => ({ id: `c${i}`, code: code(i), prefix: "REG", status }));

it("offers the four statuses in order", () => expect(PRINT_STATUSES).toEqual(["unused", "redeemed", "revoked", "all"]));

it.each([[0, 0], [1, 1], [23, 1], [24, 1], [25, 2], [48, 2], [1000, 42]])("paginates %i coupons into %i sheets without loss or repetition", (count, sheets) => {
  const cards = printCards(batch(count), "unused");
  const pages = printPages(cards);
  expect(cards).toHaveLength(count);
  expect(pages).toHaveLength(sheets);
  expect(pages.every(page => page.length > 0 && page.length <= CARDS_PER_PAGE)).toBe(true);
  const flat = pages.flat();
  expect(flat.map(c => c.id)).toEqual(batch(count).map(c => c.id));
  expect(new Set(flat.map(c => c.label)).size).toBe(count);
  if (count) expect(pages.at(-1)).toHaveLength(count - (sheets - 1) * CARDS_PER_PAGE);
});

it("selects by status in source order and keeps all on All", () => {
  const codes = [...batch(3), ...batch(2, "redeemed"), ...batch(1, "revoked")].map((c, i) => ({ ...c, id: `x${i}`, code: code(i) }));
  expect(printCards(codes, "unused").map(c => c.id)).toEqual(["x0", "x1", "x2"]);
  expect(printCards(codes, "redeemed").map(c => c.id)).toEqual(["x3", "x4"]);
  expect(printCards(codes, "revoked").map(c => [c.id, c.status])).toEqual([["x5", "revoked"]]);
  expect(printCards(codes, "all").map(c => c.id)).toEqual(codes.map(c => c.id));
});

it("formats each code with its original issued prefix", () => {
  const cards = printCards([{ id: "a", code: "AB7K9M3R", prefix: "OLD", status: "unused" }, { id: "b", code: "CD7K9M3R", prefix: "NEW", status: "unused" }], "all");
  expect(cards.map(c => c.label)).toEqual(["OLD-AB7K-9M3R", "NEW-CD7K-9M3R"]);
});

it("changes the signature when the printable content changes", () => {
  const before = printCards(batch(2), "all");
  expect(printSignature(before)).toBe(printSignature(printCards(batch(2), "all")));
  expect(printSignature(before)).not.toBe(printSignature(printCards([batch(2)[0], { ...batch(2)[1], status: "revoked" }], "all")));
});

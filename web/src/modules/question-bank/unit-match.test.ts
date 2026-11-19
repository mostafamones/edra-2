import { expect, it } from "vitest";
import type { BankUnit } from "./bank-contract";
import { suggestUnit } from "./unit-match";

const unit = (id: string, title: string, labels: string[] = []): BankUnit => ({ id, title, labels, state: "draft" });

it("uses unique titles or bounded label matches and refuses ambiguous or overly broad links", () => {
  const queues = unit("queues", "Data structures 2", ["Stacks and queues"]);
  const stacks = unit("stacks", "Stacks");
  expect(suggestUnit("Stacks & queues", [stacks, queues])?.id).toBe("queues");
  expect(suggestUnit("stacks", [stacks, queues])?.id).toBe("stacks");
  expect(suggestUnit("Stacks and queues", [queues, unit("duplicate", "Practice", ["Stacks and queues"])] )).toBeUndefined();
  expect(suggestUnit("Queues", [queues])).toBeUndefined();
  expect(suggestUnit(null, [stacks])).toBeUndefined();
});

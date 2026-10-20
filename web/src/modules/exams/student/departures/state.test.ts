import { describe, expect, it } from "vitest";
import { DepartureEpisodes } from "./state";

describe("departure episode latch", () => {
  for (const signals of [["hidden", "exit", "pagehide"], ["exit", "hidden"], ["pagehide", "hidden", "exit"], ["hidden"], ["exit"]]) {
    it(`correlates ${signals.join(" → ")} until acknowledged explicit resumption`, () => {
      const state = new DepartureEpisodes(); let id = 0;
      const create = () => ({ eventId: `event-${++id}`, questionId: "q3", generation: 2 });
      const event = state.signal(create);
      signals.forEach(() => expect(state.signal(create)).toBe(event));
      expect(id).toBe(1);
      expect(state.continue(true)).toBe(false);
      state.acknowledge("old"); expect(state.continue(true)).toBe(false);
      state.acknowledge("event-1"); expect(state.continue(false)).toBe(false);
      expect(state.signal(create)).toBe(event);
      expect(state.continue(true)).toBe(true);
      expect(state.signal(create)?.eventId).toBe("event-2");
      state.finish(); expect(state.signal(create)).toBeNull();
      expect(state.continue(true)).toBe(false);
    });
  }
});

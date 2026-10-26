import { describe, expect, it } from "vitest";
import { mergeWatched, PlaybackCoverage } from "./coverage";

describe("unique watched timeline", () => {
  it("unions overlapping replays without counting them twice", () => {
    expect(mergeWatched([[20, 40], [0, 25], [5, 10], [60, 70], [70, 80]])).toEqual([[0, 40], [60, 80]]);
  });
  it("does not credit a jump to the end", () => {
    const tracker = new PlaybackCoverage(100);
    tracker.sample(0, 0, true, 1); tracker.sample(1, 1000, true, 1);
    tracker.sample(99, 1250, true, 1); tracker.sample(100, 2250, true, 1);
    expect(tracker.take()).toEqual([[0, 1], [99, 100]]);
  });
  it("excludes paused and stalled time, and resumes at the new position", () => {
    const tracker = new PlaybackCoverage(100);
    tracker.sample(0, 0, true, 1); tracker.sample(1, 1000, true, 1);
    tracker.sample(1, 2000, false, 1); tracker.sample(40, 3000, false, 1);
    tracker.sample(40, 4000, true, 1); tracker.sample(41, 5000, true, 1);
    tracker.sample(60, 15000, true, 1);
    expect(tracker.take()).toEqual([[0, 1], [40, 41]]);
    expect(tracker.position).toBe(60);
  });
  it("counts video seconds at accelerated playback without inventing skipped coverage", () => {
    const tracker = new PlaybackCoverage(100);
    tracker.sample(20, 0, true, 2); tracker.sample(22, 1000, true, 2);
    tracker.reset(); tracker.sample(70, 1100, true, 2); tracker.sample(72, 2100, true, 2);
    expect(tracker.take()).toEqual([[20, 22], [70, 72]]);
  });
  it("restores failed checkpoint coverage and merges new activity", () => {
    const tracker = new PlaybackCoverage(100);
    tracker.sample(0, 0, true, 1); tracker.sample(1, 1000, true, 1);
    const checkpoint = tracker.take();
    tracker.sample(2, 2000, true, 1); tracker.restore(checkpoint);
    expect(tracker.take()).toEqual([[0, 2]]);
    expect(tracker.take()).toEqual([]);
  });
  it("clamps the resume position to the trusted duration", () => {
    const tracker = new PlaybackCoverage(100, 120);
    expect(tracker.position).toBe(100);
    tracker.sample(NaN, 0, true, 1); expect(tracker.position).toBe(100);
  });
});

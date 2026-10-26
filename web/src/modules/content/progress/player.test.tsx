// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
const mocks = vi.hoisted(() => ({ start: vi.fn(), save: vi.fn(), clock: 0, startTime: 0,
  media: { currentTime: 0, playbackRate: 1 } }));
vi.mock("./actions", () => ({ startVideoProgress: mocks.start, saveVideoProgress: mocks.save }));
vi.mock("@mux/mux-player-react", async () => {
  const { forwardRef, useImperativeHandle } = await import("react");
  return { default: forwardRef(function FakePlayer(props: Record<string, unknown>, ref) {
    useImperativeHandle(ref, () => mocks.media);
    mocks.startTime = props.startTime as number;
    return <div>{["onPlaying", "onTimeUpdate", "onSeeking", "onSeeked", "onPause"].map(name =>
      <button key={name} onClick={() => (props[name] as () => void)()}>{name}</button>)}</div>;
  }) };
});
import { LearningVideo } from "./player";
const academyId = "10000000-0000-4000-8000-000000000001", unitId = "10000000-0000-4000-8000-000000000002", itemId = "10000000-0000-4000-8000-000000000003";
beforeEach(() => {
  vi.clearAllMocks(); mocks.clock = 0; mocks.media.currentTime = 40;
  vi.spyOn(performance, "now").mockImplementation(() => mocks.clock);
  mocks.start.mockResolvedValue({ ok: true, value: { sessionId: itemId, positionSeconds: 40, durationSeconds: 100 } });
  mocks.save.mockResolvedValue({ ok: true, value: { positionSeconds: 41, durationSeconds: 100, watchedSeconds: 1, completed: false } });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
async function open(strict = false) {
  const content = <QueryClientProvider client={new QueryClient()}><LearningVideo academyId={academyId} unitId={unitId} itemId={itemId} title="Lesson" playbackId="mux" tokens={{ playback: "p", thumbnail: "t", storyboard: "s" }} /></QueryClientProvider>;
  render(strict ? <StrictMode>{content}</StrictMode> : content);
  await screen.findByRole("button", { name: "onPlaying" });
}
it("keeps checkpoint ordering across development effect cleanup/replay", async () => {
  await open(true);
  await waitFor(() => expect(mocks.save).toHaveBeenCalled());
  fireEvent.click(screen.getByText("onPlaying")); mocks.clock = 1000; mocks.media.currentTime = 41;
  fireEvent.click(screen.getByText("onTimeUpdate")); fireEvent.click(screen.getByText("onPause"));
  await waitFor(() => expect(mocks.save.mock.calls.some(call => call[0].ranges.length)).toBe(true));
  const sequences = mocks.save.mock.calls.map(call => call[0].sequence);
  expect(new Set(sequences).size).toBe(sequences.length);
  expect(sequences).toEqual([...sequences].sort((a, b) => a - b));
});
it("resumes from the server position and persists unique coverage on pause", async () => {
  await open(); expect(mocks.startTime).toBe(40);
  fireEvent.click(screen.getByText("onPlaying"));
  mocks.clock = 1000; mocks.media.currentTime = 41; fireEvent.click(screen.getByText("onTimeUpdate"));
  fireEvent.click(screen.getByText("onPause"));
  await waitFor(() => expect(mocks.save).toHaveBeenCalled());
  expect(mocks.save.mock.calls[0][0]).toMatchObject({ sessionId: itemId, sequence: 1, position: 41, ranges: [[40, 41]] });
});
it("does not overwrite resume with the player's startup zero before playback begins", async () => {
  await open(); mocks.media.currentTime = 0;
  fireEvent.click(screen.getByText("onTimeUpdate")); fireEvent.click(screen.getByText("onPause"));
  await waitFor(() => expect(mocks.save).toHaveBeenCalled());
  expect(mocks.save.mock.calls[0][0]).toMatchObject({ position: 40, ranges: [] });
});
it("saves a seek position without claiming skipped sections", async () => {
  await open(); fireEvent.click(screen.getByText("onPlaying"));
  fireEvent.click(screen.getByText("onSeeking")); mocks.media.currentTime = 99;
  fireEvent.click(screen.getByText("onSeeked"));
  await waitFor(() => expect(mocks.save).toHaveBeenCalled());
  expect(mocks.save.mock.calls[0][0]).toMatchObject({ position: 99, ranges: [] });
});
it("shows failed saves and retries with the unacknowledged coverage", async () => {
  mocks.save.mockResolvedValueOnce({ ok: false, message: "Connection lost" });
  await open(); fireEvent.click(screen.getByText("onPlaying"));
  mocks.clock = 1000; mocks.media.currentTime = 41; fireEvent.click(screen.getByText("onTimeUpdate"));
  fireEvent.click(screen.getByText("onPause"));
  await screen.findByText("Connection lost"); fireEvent.click(screen.getByText("Retry save"));
  await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(2));
  expect(mocks.save.mock.calls[1][0]).toMatchObject({ sequence: 2, ranges: [[40, 41]] });
});
it("does not render a player when progress initialization loses access", async () => {
  mocks.start.mockResolvedValue({ ok: false, message: "Active unit access is required." });
  render(<QueryClientProvider client={new QueryClient()}><LearningVideo academyId={academyId} unitId={unitId} itemId={itemId} title="Lesson" playbackId="mux" tokens={{ playback: "p", thumbnail: "t", storyboard: "s" }} /></QueryClientProvider>);
  await screen.findByText("Active unit access is required.");
  expect(screen.queryByText("onPlaying")).toBeNull();
});

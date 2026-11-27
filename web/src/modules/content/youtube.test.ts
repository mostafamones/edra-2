import { expect, it } from "vitest";
import { youtubeIdFromUrl, youtubeWatchUrl } from "./youtube";

it("normalizes only supported YouTube video URLs", () => {
  for (const url of ["https://youtu.be/4BUq8tldjyo?si=ref", "https://www.youtube.com/watch?v=4BUq8tldjyo", "https://www.youtube-nocookie.com/embed/4BUq8tldjyo"])
    expect(youtubeIdFromUrl(url)).toBe("4BUq8tldjyo");
  for (const url of ["https://youtube.com.example.com/watch?v=4BUq8tldjyo", "https://youtu.be@evil.example/4BUq8tldjyo", "javascript:alert(1)", "https://youtu.be/4BUq8tldjyo/other", "https://youtube.com/playlist?list=4BUq8tldjyo"])
    expect(youtubeIdFromUrl(url)).toBeNull();
});

it("links to the original video at the requested timestamp", () => {
  expect(youtubeWatchUrl("4BUq8tldjyo", 19207.5)).toBe("https://www.youtube.com/watch?v=4BUq8tldjyo&t=19207s");
});

// @vitest-environment jsdom
import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ConcernMessageInput, mentionQuery, type MentionChoice } from "./mentions";
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("finds the @query right before the caret only", () => {
  expect(mentionQuery("hi @Mo", 6)).toEqual({ start: 3, query: "Mo" });
  expect(mentionQuery("@", 1)).toEqual({ start: 0, query: "" });
  expect(mentionQuery("mail@x", 6)).toBeNull();
  expect(mentionQuery("@Mona done", 10)).toBeNull();
});

it("typing @ opens the list, keys pick a person, Enter otherwise submits and Shift+Enter does not", async () => {
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  HTMLElement.prototype.scrollIntoView = vi.fn();
  const onMention = vi.fn();
  const submit = vi.fn((event: React.FormEvent) => event.preventDefault());
  function Harness() {
    const [value, setValue] = useState("");
    return <TooltipProvider><form onSubmit={submit}><ConcernMessageInput id="m" label="Message" value={value} onChange={setValue} onMention={onMention}
      participants={[{ userId: "a", name: "Mona" }, { userId: "b", name: "Omar" }] satisfies MentionChoice[]} /></form></TooltipProvider>;
  }
  render(<Harness />);
  const box = screen.getByLabelText("Message") as HTMLTextAreaElement;
  fireEvent.change(box, { target: { value: "hi @o", selectionStart: 5 } });
  expect(await screen.findByRole("option", { name: "Mona" })).toBeTruthy();
  fireEvent.change(box, { target: { value: "hi @om", selectionStart: 6 } });
  expect(screen.queryByRole("option", { name: "Mona" })).toBeNull();
  fireEvent.keyDown(box, { key: "Enter" });
  expect(onMention).toHaveBeenCalledWith({ userId: "b", name: "Omar" });
  expect(box.value).toBe("hi @Omar ");
  expect(submit).not.toHaveBeenCalled();
  fireEvent.keyDown(box, { key: "Enter", shiftKey: true });
  expect(submit).not.toHaveBeenCalled();
  fireEvent.keyDown(box, { key: "Enter" });
  expect(submit).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "Mention participant" }));
  fireEvent.click(await screen.findByRole("option", { name: "Mona" }));
  expect(box.value).toBe("hi @Omar @Mona ");
});

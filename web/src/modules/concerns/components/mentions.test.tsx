// @vitest-environment jsdom
import { useState } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ConcernMessageInput, editorContent, type MentionChoice } from "./mentions";
import { messageText } from "./editor.testing";
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const omar = { userId: "b", name: "Omar" };
it("rebuilds stored text into chips and line breaks", () => {
  expect(editorContent("hi @Omar\nok", [omar])).toEqual({ type: "doc", content: [{ type: "paragraph", content: [
    { type: "text", text: "hi " }, { type: "mention", attrs: { id: "b", label: "Omar" } }, { type: "hardBreak" }, { type: "text", text: "ok" },
  ] }] });
});

it("the @ button opens the list, picking inserts a chip, Enter submits and the value stays plain text", async () => {
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  HTMLElement.prototype.scrollIntoView = vi.fn();
  const onMention = vi.fn();
  const submit = vi.fn((event: React.FormEvent) => event.preventDefault());
  let latest = "";
  function Harness() {
    const [value, setValue] = useState("hi");
    latest = value;
    return <TooltipProvider><form onSubmit={submit}><ConcernMessageInput id="m" label="Message" value={value} onChange={setValue} onMention={onMention}
      participants={[{ userId: "a", name: "Mona" }, omar] satisfies MentionChoice[]} /></form></TooltipProvider>;
  }
  render(<Harness />);
  const box = await screen.findByLabelText("Message");
  await waitFor(() => expect(messageText(box)).toBe("hi"));
  fireEvent.click(screen.getByRole("button", { name: "Mention participant" }));
  const option = await screen.findByRole("option", { name: "Omar" });
  fireEvent.click(option);
  expect(onMention).toHaveBeenCalledWith(omar);
  await waitFor(() => expect(latest).toBe("hi @Omar "));
  expect(box.querySelector('[data-type="mention"]')?.textContent).toBe("@Omar");
  act(() => { box.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true })); });
  expect(submit).toHaveBeenCalledTimes(1);
});

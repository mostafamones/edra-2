// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useFormContext } from "react-hook-form";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AcademyEntry } from "@/modules/academies";
import type { FormStatus } from "./page";
import { AssessmentFormShell } from "./shell";

vi.mock("@/modules/auth", () => ({ useAcademyScope: () => () => true }));
vi.mock("@/modules/navigation", () => ({ useCanonicalHref: () => (value: string) => value }));
const academy = { id: "academy" } as AcademyEntry;
type Values = { title: string; parts: [] };
type Entity = Values & { id: string; version: number };
const toValues = (entity?: Entity): Values => ({ title: entity?.title ?? "", parts: [] });
const parse = (values: Values) => values.title === "invalid" || values.title === "" ? null : values;
function Input() { const { register } = useFormContext(); return <input aria-label="Title" {...register("title")} />; }
const deferred = <T,>() => { let resolve!: (v: T) => void; return { promise: new Promise<T>((r) => { resolve = r; }), resolve: (value: T) => resolve(value) }; };
afterEach(() => { cleanup(); vi.useRealTimers(); });
const tick = async () => { await act(async () => { await vi.advanceTimersByTimeAsync(1300); }); };

function setup(commit: (base: Entity | undefined, draft: Values, id: string) => Promise<{ ok: true; entity: Entity }>, statuses: FormStatus[]) {
  return render(<QueryClientProvider client={new QueryClient()}><AssessmentFormShell
    academy={academy} noun="test" route="tests" toValues={toValues} parse={parse} resolver={async (values) => ({ values, errors: {} })}
    commit={commit} rootKey={["tests"]} savedMessage={() => "Saved"} basicsFields={["title"]} locked={false}
    basics={<Input />} parts={() => null} review={() => null} partEditor={() => null} onSaved={vi.fn()} onCancel={vi.fn()}
    onStatusChange={(status) => statuses.push(status)} /></QueryClientProvider>);
}

describe("authoring autosave lifecycle", () => {
  it("reports scheduled saves, acknowledges the submitted snapshot and clears Saved for invalid newer input", async () => {
    vi.useFakeTimers(); const statuses: FormStatus[] = [];
    const pending = deferred<{ ok: true; entity: Entity }>(); const commit = vi.fn().mockReturnValue(pending.promise);
    setup(commit, statuses);
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "First" } });
    expect(statuses.at(-1)).toMatchObject({ dirty: true, saving: true });
    await tick();
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "invalid" } });
    await act(async () => pending.resolve({ ok: true, entity: { id: "id", title: "First", parts: [], version: 1 } }));
    expect(statuses.at(-1)?.dirty).toBe(true);
    expect(screen.queryByText("Saved")).toBeNull();
    await tick();
    expect(commit).toHaveBeenCalledOnce();
  });

  it("cancels an unsent scheduled save on discard", async () => {
    vi.useFakeTimers(); const statuses: FormStatus[] = []; const commit = vi.fn(); setup(commit, statuses);
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "First" } });
    await act(async () => { expect(await statuses.at(-1)!.discard!()).toBe(true); });
    await tick(); expect(commit).not.toHaveBeenCalled();
  });
});

// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { QueryContent } from "./query-content";

afterEach(cleanup);
it("does not turn failure into an empty dataset and retries the read", async () => {
  const load = vi.fn().mockRejectedValueOnce(new Error("Service unavailable")).mockResolvedValueOnce([]);
  function Example() {
    const query = useQuery<string[]>({ queryKey: ["rows"], queryFn: load });
    return <QueryContent query={query} label="rows" emptyTitle="No rows" isEmpty={rows => !rows.length}>{rows => <table><tbody>{rows.map(row => <tr key={row}><td>{row}</td></tr>)}</tbody></table>}</QueryContent>;
  }
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><Example /></QueryClientProvider>);
  expect(screen.getByRole("status", { name: "Loading rows" })).toBeTruthy();
  await screen.findByRole("alert");
  expect(screen.queryByText("No rows")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  await screen.findByText("No rows");
  expect(screen.queryByRole("table")).toBeNull();
  expect(load).toHaveBeenCalledTimes(2);
});

it("keeps loaded content mounted when a refresh fails", () => {
  const query = { data: ["Saved work"], isPending: false, isFetching: false, error: null as Error | null, refetch: vi.fn() };
  const content = () => <QueryContent query={query} label="rows" emptyTitle="No rows" isEmpty={rows => !rows.length}>{rows => <input aria-label="Draft" defaultValue={rows[0]} />}</QueryContent>;
  const view = render(content());
  fireEvent.change(screen.getByLabelText("Draft"), { target: { value: "Unsaved edit" } });
  query.error = new Error("Connection lost");
  view.rerender(content());
  expect((screen.getByLabelText("Draft") as HTMLInputElement).value).toBe("Unsaved edit");
  expect(screen.getByText("Couldn’t refresh rows")).toBeTruthy();
});

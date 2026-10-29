import { afterEach, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({rpc}) }));
import { homeOverviewOptions, overviewSchema } from "./overview";
afterEach(() => vi.clearAllMocks());
const summary = {year:2026,asOf:"2026-10-29T12:00:00Z",attentionCount:0,students:{total:0,online:0,levels:[]},attention:[],today:[]};
it("reuses a fresh overview and separates academy scopes", async () => {
  rpc.mockImplementation(() => ({abortSignal: () => Promise.resolve({data:summary,error:null})}));
  const client = new QueryClient({defaultOptions:{queries:{retry:false}}});
  await client.fetchQuery(homeOverviewOptions("a"));
  await client.fetchQuery(homeOverviewOptions("a"));
  expect(rpc).toHaveBeenCalledTimes(1);
  await client.fetchQuery(homeOverviewOptions("b"));
  expect(rpc).toHaveBeenCalledTimes(2);
  expect(rpc).toHaveBeenLastCalledWith("staff_home",{p_academy_id:"b"});
  client.clear();
});
it("does not turn database failure or an incompatible result into zero totals", async () => {
  rpc.mockImplementation(() => ({abortSignal: () => Promise.resolve({data:null,error:{message:"unavailable"}})}));
  await expect(homeOverviewOptions("a").queryFn!({signal:new AbortController().signal} as never)).rejects.toThrow();
  expect(overviewSchema.safeParse({}).success).toBe(false);
});

import { describe, expect, it } from "vitest"
import { createMemoryHistory, createRootRoute, createRoute, createRouter } from "@tanstack/react-router"
import { routerRewrite } from "@/lib/routing/rewrite"
import { searchRecord, stringifySearch } from "./search"

describe("searchRecord", () => {
  it("preserves raw string values and repeated keys in order", () => {
    expect(searchRecord("?reset=1&q=1e3&next=%2Fa&next=%2Fb&empty=")).toEqual({
      reset: "1", q: "1e3", next: ["/a", "/b"], empty: "",
    })
  })

  it("handles special property names as ordinary keys", () => {
    expect(searchRecord("?__proto__=one&__proto__=two")["__proto__"]).toEqual(["one", "two"])
  })
})

it.each([
  ["?q=1e3", { q: "1e3" }],
  ["?q=alpha&q=beta", { q: ["alpha", "beta"] }],
  ["?reset=1", { reset: "1" }],
  ["", {}],
  ["?q=a%2Bb+%26+c&emoji=%F0%9F%8C%9F", { q: "a+b & c", emoji: "🌟" }],
])("round trips %s without JSON coercion", (query, expected) => {
  expect(searchRecord(query)).toEqual(expected)
  expect(stringifySearch(searchRecord(query))).toBe(query)
})

it("preserves search and public paths through a real student-host router", () => {
  const root = createRootRoute()
  const routeTree = root.addChildren([createRoute({ getParentRoute: () => root, path: "/learn/discover" })])
  const history = createMemoryHistory({ initialEntries: ["/discover?q=1e3&q=alpha&reset=1"] })
  const router = createRouter({ routeTree, history, origin: "http://learn.lvh.me:3000", rewrite: routerRewrite, parseSearch: searchRecord, stringifySearch })
  const location = router.parseLocation(history.location)
  expect(location.publicHref).toBe("/discover?q=1e3&q=alpha&reset=1")
  expect(location.pathname).toBe("/learn/discover")
  expect(location.searchStr).toBe("?q=1e3&q=alpha&reset=1")
  expect(location.search).toEqual({ q: ["1e3", "alpha"], reset: "1" })
})

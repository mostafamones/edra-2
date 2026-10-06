import { describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ id: "academy-a", cleanup: undefined as (() => void) | undefined, ref: { current: null as string | null } }));
vi.mock("react", () => ({
  useRef: () => state.ref,
  useCallback: (callback: unknown) => callback,
  useLayoutEffect: (effect: () => () => void) => { state.cleanup = effect(); },
}));
vi.mock("./components/provider", () => ({ useAuth: () => ({ activeAcademy: { id: state.id } }) }));
import { useAcademyScope } from "./use-academy-scope";
describe("async academy scope", () => {
  it("invalidates captured academy work when its gate unmounts", () => {
    const isCurrent = useAcademyScope();
    expect(isCurrent("academy-a")).toBe(true);
    state.cleanup?.();
    expect(isCurrent("academy-a")).toBe(false);
  });
  it("rejects a previous academy after context changes", () => {
    state.id = "academy-a";
    const isCurrent = useAcademyScope();
    state.cleanup?.();
    state.id = "academy-b";
    useAcademyScope();
    expect(isCurrent("academy-a")).toBe(false);
    expect(isCurrent("academy-b")).toBe(true);
  });
});

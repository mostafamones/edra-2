// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { advanceBrowserScope } from '@/lib/browser-scope';

const auth = vi.hoisted(() => ({ current: { activeAcademy: { id: 'a' }, user: { id: 'first' } } }));
vi.mock('./components/provider', () => ({ useAuth: () => auth.current }));
import { useAcademyScope } from './use-academy-scope';

afterEach(() => { auth.current = { activeAcademy: { id: 'a' }, user: { id: 'first' } }; });

it('rejects a late callback after an account change inside the same academy', () => {
  const { result, rerender, unmount } = renderHook(useAcademyScope);
  const first = result.current;
  expect(first('a')).toBe(true);
  advanceBrowserScope();
  // The fence changes before React commits the new identity.
  expect(first('a')).toBe(false);
  auth.current = { activeAcademy: { id: 'a' }, user: { id: 'second' } };
  rerender();
  expect(result.current('a')).toBe(true);
  expect(first('a')).toBe(false);
  const second = result.current;
  unmount();
  expect(second('a')).toBe(false);
});

it('rejects a callback from an earlier visit even after switching back to that academy', () => {
  const { result, rerender, unmount } = renderHook(useAcademyScope);
  const firstVisit = result.current;
  auth.current = { activeAcademy: { id: 'b' }, user: { id: 'first' } };
  rerender();
  expect(firstVisit('a')).toBe(false);
  expect(firstVisit('b')).toBe(false);
  expect(result.current('b')).toBe(true);
  auth.current = { activeAcademy: { id: 'a' }, user: { id: 'first' } };
  rerender();
  expect(result.current('a')).toBe(true);
  expect(firstVisit('a')).toBe(false);
  unmount();
});

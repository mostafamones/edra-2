"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";

export const HEADER_ACTIONS_ID = "header-actions";

const subscribe = () => () => {};

/** Renders page actions into the right side of the site header. */
export function HeaderActions({ children }: { children: ReactNode }) {
  // The header mounts in the same commit as the page; React re-reads the snapshot after commit.
  const target = useSyncExternalStore(subscribe, () => document.getElementById(HEADER_ACTIONS_ID), () => null);
  return target ? createPortal(children, target) : null;
}

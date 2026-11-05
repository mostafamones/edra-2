import { formatCoupon } from "./types";

export const PRINT_STATUSES = ["unused", "redeemed", "revoked", "all"] as const;
export type PrintStatus = typeof PRINT_STATUSES[number];
export const CARDS_PER_PAGE = 24;
export type PrintCard = { id: string; label: string; status: "unused" | "redeemed" | "revoked" };

/** Selected coupons in source order, each formatted with its originally issued prefix. */
export function printCards(codes: Array<{ id: string; code: string; prefix: string; status: PrintCard["status"] }>, status: PrintStatus): PrintCard[] {
  return codes.filter(c => status === "all" || c.status === status).map(c => ({ id: c.id, label: formatCoupon(c.code, c.prefix), status: c.status }));
}

/** Consecutive sheets of at most 24 cards; the final sheet is not padded. */
export function printPages(cards: PrintCard[]): PrintCard[][] {
  return Array.from({ length: Math.ceil(cards.length / CARDS_PER_PAGE) }, (_, i) => cards.slice(i * CARDS_PER_PAGE, (i + 1) * CARDS_PER_PAGE));
}

/** Identity of the printable content, used to detect a changed snapshot before printing. */
export function printSignature(cards: PrintCard[]) { return cards.map(c => `${c.label}:${c.status}`).join("|"); }

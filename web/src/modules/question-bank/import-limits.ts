export const maxBookPages = 1_000;
export const maxBatchPages = 24;
export const maxBookBytes = 200 * 1024 * 1024;
export const maxKeyBytes = 30 * 1024 * 1024;

export type PageRange = { first: number; last: number };

export function nextPageRange(first: number, total: number): PageRange {
  return { first, last: Math.min(total, first + maxBatchPages - 1) };
}

export function validPageRange({ first, last }: PageRange, total: number) {
  return Number.isInteger(first) && Number.isInteger(last) && first >= 1 &&
    last >= first && last <= total && last - first < maxBatchPages;
}

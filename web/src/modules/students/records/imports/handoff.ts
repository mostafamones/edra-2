import type { ImportFormat } from "./types";

type PendingFile = { academyId: string; file: File; format: ImportFormat };

// A File can't travel in a URL, so the dialog hands it to the import page in memory.
// A reload loses it, which sends the page back to the students list to choose again.
let pending: PendingFile | null = null;

export const setPendingImportFile = (next: PendingFile) => { pending = next; };
export const peekPendingImportFile = (academyId: string) => pending?.academyId === academyId ? pending : null;
export const clearPendingImportFile = () => { pending = null; };

/** Whether a file's extension matches the chosen format. */
export const matchesFormat = (file: File, format: ImportFormat) => file.name.toLowerCase().endsWith(`.${format}`);

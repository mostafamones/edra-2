import type { ImportFormat } from "../types";

export const ACCEPT: Record<ImportFormat, string> = {
  csv: ".csv,text/csv",
  json: ".json,application/json",
  xlsx: ".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};
export const FORMAT_LABELS: Record<ImportFormat, string> = { csv: "CSV", json: "JSON", xlsx: "Excel (.xlsx)" };

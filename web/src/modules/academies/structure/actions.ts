"use server";

import { getStructure, maintainOffering, previewOfferingChange, structureResult } from "./server";

export async function loadStructure(slug: string) {
  return structureResult(() => getStructure(slug));
}
export async function previewStructureChange(slug: string, change: unknown) {
  return structureResult(() => previewOfferingChange(slug, change));
}
export async function changeStructure(slug: string, request: unknown) {
  // Returning a committed result does not depend on a subsequent refresh succeeding.
  return structureResult(() => maintainOffering(slug, request));
}

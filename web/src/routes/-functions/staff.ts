import { createServerFn } from "@tanstack/react-start";

const slug = (value: unknown): string => {
  if (typeof value !== "string") throw new Error("Invalid slug");
  return value;
};
const publicPath = (value: unknown): string => {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) throw new Error("Invalid public path");
  return value;
};
export const loadStaffEntry = createServerFn({ method: "GET" }).validator(publicPath).handler(async ({ data }) => (await import("./staff.server")).staffEntry(data));
export const loadStaffAcademy = createServerFn({ method: "GET" }).validator(slug).handler(async ({ data }) => (await import("./staff.server")).staffAcademy(data));
export const loadAcademyProfile = createServerFn({ method: "GET" }).validator(slug).handler(async ({ data }) => (await import("./staff.server")).academyProfile(data));
export const loadAcademyStructure = createServerFn({ method: "GET" }).validator(slug).handler(async ({ data }) => (await import("./staff.server")).academyStructure(data));

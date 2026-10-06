import { z } from "zod";

import { RESERVED_NAMESPACES } from "../../lib/routing";

export const RESERVED_ACADEMY_SLUGS = RESERVED_NAMESPACES;

export const academySlugSchema = z
  .string()
  .trim()
  .min(1)
  .max(50)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .refine((slug) => !RESERVED_ACADEMY_SLUGS.includes(slug as (typeof RESERVED_ACADEMY_SLUGS)[number]));

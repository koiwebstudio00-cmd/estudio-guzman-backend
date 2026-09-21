import { z } from "zod";
const uuid = z.string().uuid("El identificador es inválido.");
export const courtParamsSchema = z.object({ courtId: uuid });
export const officeParamsSchema = z.object({ officeId: uuid });
export const catalogQuerySchema = z.object({ q: z.string().trim().max(160).optional(), active: z.enum(["true", "false"]).transform((value) => value === "true").optional() });
export const createCourtSchema = z.object({ name: z.string().trim().min(2).max(240), jurisdiction: z.string().trim().max(160).nullable().optional(), address: z.string().trim().max(1_000).nullable().optional(), officeIds: z.array(uuid).max(100).default([]) });
export const updateCourtSchema = createCourtSchema.partial().extend({ isActive: z.boolean().optional() }).refine((value) => Object.keys(value).length > 0);
export const createOfficeSchema = z.object({ name: z.string().trim().min(2).max(240), address: z.string().trim().max(1_000).nullable().optional(), courtIds: z.array(uuid).max(100).default([]) });
export const updateOfficeSchema = createOfficeSchema.partial().extend({ isActive: z.boolean().optional() }).refine((value) => Object.keys(value).length > 0);

import { z } from "zod";
const uuid = z.string().uuid("El identificador es inválido.");
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).transform((value) => new Date(`${value}T00:00:00.000Z`));
export const caseSubcasesParamsSchema = z.object({ caseId: uuid });
export const subCaseParamsSchema = z.object({ subCaseId: uuid });
export const listSubCasesQuerySchema = z.object({ type: z.enum(["EVIDENCE", "INCIDENT"]).optional(), status: z.enum(["ACTIVE", "RESOLVED", "CLOSED"]).optional() });
export const createSubCaseSchema = z.object({ type: z.enum(["EVIDENCE", "INCIDENT"]), title: z.string().trim().min(2).max(240), description: z.string().trim().max(10_000).nullable().optional(), openedOn: date.optional() });
export const updateSubCaseSchema = z.object({ version: z.number().int().positive(), title: z.string().trim().min(2).max(240).optional(), description: z.string().trim().max(10_000).nullable().optional() }).refine((value) => Object.keys(value).length > 1);
export const transitionSubCaseSchema = z.object({ version: z.number().int().positive(), toStatus: z.enum(["ACTIVE", "RESOLVED", "CLOSED"]), reason: z.string().trim().min(2).max(2_000).nullable().optional() });

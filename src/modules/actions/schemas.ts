import { z } from "zod";
const uuid = z.string().uuid("El identificador es inválido.");
const actionType = z.enum(["CLAIM", "ANSWER", "NOTICE", "DECREE", "RESOLUTION", "FILING", "OFFICIAL_LETTER", "NOTIFICATION", "OTHER"]);
export const caseActionsParamsSchema = z.object({ caseId: uuid }); export const actionParamsSchema = z.object({ actionId: uuid });
export const listActionsQuerySchema = z.object({ subCaseId: uuid.optional(), type: actionType.optional(), from: z.coerce.date().optional(), to: z.coerce.date().optional(), cursor: z.string().max(1_000).optional(), limit: z.coerce.number().int().min(1).max(100).default(25) });
export const timelineQuerySchema = z.object({ cursor: z.string().max(1_000).optional(), limit: z.coerce.number().int().min(1).max(100).default(25) });
export const createActionSchema = z.object({ subCaseId: uuid.nullable().optional(), title: z.string().trim().min(2).max(300), type: actionType, documentAt: z.coerce.date(), presentationAt: z.coerce.date().nullable().optional(), presentedById: uuid.nullable().optional(), description: z.string().trim().max(20_000).nullable().optional() });
export const updateActionSchema = z.object({ version: z.number().int().positive(), title: z.string().trim().min(2).max(300).optional(), type: actionType.optional(), documentAt: z.coerce.date().optional(), presentationAt: z.coerce.date().nullable().optional(), presentedById: uuid.nullable().optional(), description: z.string().trim().max(20_000).nullable().optional() }).refine((value) => Object.keys(value).length > 1);
export const deleteActionSchema = z.object({ reason: z.string().trim().min(2).max(2_000) });

import { z } from "zod";

const uuid = z.string().uuid("El identificador es inválido.");
export const documentCategorySchema = z.enum(["PLEADING", "COURT_ORDER", "EVIDENCE", "NOTICE", "POWER_OF_ATTORNEY", "IDENTITY", "INTERNAL", "OTHER"]);
const contextFields = { caseId: uuid.optional(), subCaseId: uuid.optional(), actionId: uuid.optional(), taskId: uuid.optional(), noteId: uuid.optional() };
const exactlyOneContext = (value: Record<string, unknown>) => [value.caseId, value.subCaseId, value.actionId, value.taskId, value.noteId].filter(Boolean).length === 1;

export const createDocumentFieldsSchema = z.object({ title: z.string().trim().min(2).max(300), category: documentCategorySchema.default("OTHER"), description: z.string().trim().max(20_000).optional(), ...contextFields }).strict().refine(exactlyOneContext, { message: "Debe indicar exactamente un contexto para el documento." });
export const listDocumentsQuerySchema = z.object({ ...contextFields, cursor: z.string().max(1_000).optional(), limit: z.coerce.number().int().min(1).max(100).default(25) }).refine(exactlyOneContext, { message: "Debe indicar exactamente un contexto para listar documentos." });
export const documentParamsSchema = z.object({ documentId: uuid });
export const documentVersionParamsSchema = z.object({ documentId: uuid, versionId: uuid });
export const updateDocumentSchema = z.object({ version: z.number().int().positive(), title: z.string().trim().min(2).max(300).optional(), category: documentCategorySchema.optional(), description: z.string().trim().max(20_000).nullable().optional() }).refine((value) => Object.keys(value).length > 1);
export const archiveDocumentSchema = z.object({ version: z.number().int().positive(), reason: z.string().trim().min(2).max(2_000) });

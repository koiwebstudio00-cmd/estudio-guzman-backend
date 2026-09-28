import { z } from "zod";

const uuid = z.string().uuid("El identificador es inválido.");
const nullableUuid = uuid.nullable().optional();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).transform((value) => new Date(`${value}T00:00:00.000Z`));
const caseType = z.enum(["LABOR", "CIVIL_COMMERCIAL", "CRIMINAL", "FAMILY", "OTHER"]);
const caseStatus = z.enum(["PENDING", "ACTIVE", "SUSPENDED", "CLOSED", "ARCHIVED"]);
const participantRole = z.enum(["CLIENT", "CLAIMANT", "DEFENDANT", "THIRD_PARTY", "COMPLAINANT", "ACCUSED", "VICTIM", "EXPERT", "WITNESS", "OTHER"]);
const side = z.enum(["OUR_SIDE", "COUNTERPART", "NEUTRAL"]);

export const caseParamsSchema = z.object({ caseId: uuid });
export const participantParamsSchema = z.object({ caseId: uuid, participantId: uuid });
export const representationParamsSchema = z.object({ caseId: uuid, representationId: uuid });
export const membershipParamsSchema = z.object({ caseId: uuid, membershipId: uuid });
export const contactCasesParamsSchema = z.object({ contactId: uuid });
export const listCasesQuerySchema = z.object({ q: z.string().trim().max(200).optional(), status: caseStatus.optional(), type: caseType.optional(), responsibleId: uuid.optional(), courtId: uuid.optional(), from: date.optional(), to: date.optional(), cursor: z.string().max(1_000).optional(), limit: z.coerce.number().int().min(1).max(100).default(25) });

const participantBase = z.object({ contactId: uuid, role: participantRole, side: side.default("NEUTRAL"), isClient: z.boolean().default(false), label: z.string().trim().min(1).max(120).nullable().optional(), notes: z.string().trim().max(10_000).nullable().optional(), sortOrder: z.number().int().min(0).default(0) });
const participant = participantBase.superRefine((value, context) => { if (value.role === "OTHER" && !value.label) context.addIssue({ code: "custom", path: ["label"], message: "La etiqueta es obligatoria para el rol Otro." }); });
const teamMember = z.object({ userId: uuid, role: z.enum(["PRIMARY", "COLLABORATOR"]) });
const representation = z.object({ representedContactId: uuid, representativeContactId: uuid, type: z.enum(["ATTORNEY", "LEGAL_REPRESENTATIVE", "POWER_OF_ATTORNEY", "OTHER"]), isPrimary: z.boolean().default(false), notes: z.string().trim().max(10_000).nullable().optional() });

export const createCaseSchema = z.object({ caseNumber: z.string().trim().min(1).max(100), title: z.string().trim().min(2).max(500), type: caseType, status: z.enum(["PENDING", "ACTIVE"]).default("PENDING"), startDate: date, courtId: nullableUuid, managementOfficeId: nullableUuid, courtName: z.string().trim().max(240).nullable().optional(), managementOfficeName: z.string().trim().max(240).nullable().optional(), participants: z.array(participant).min(1).max(50), representations: z.array(representation).max(50).default([]), team: z.array(teamMember).min(1).max(50) }).superRefine((value, context) => {
  if (value.participants.filter((item) => item.isClient).length < 1) context.addIssue({ code: "custom", path: ["participants"], message: "Debe existir al menos una parte cliente." });
  if (value.team.filter((item) => item.role === "PRIMARY").length !== 1) context.addIssue({ code: "custom", path: ["team"], message: "Debe existir exactamente un responsable principal." });
  const participantKeys = value.participants.map((item) => `${item.contactId}:${item.role}`);
  if (new Set(participantKeys).size !== participantKeys.length) context.addIssue({ code: "custom", path: ["participants"], message: "No se puede repetir contacto y rol." });
  const teamIds = value.team.map((item) => item.userId);
  if (new Set(teamIds).size !== teamIds.length) context.addIssue({ code: "custom", path: ["team"], message: "No se puede repetir un integrante." });
});
export const updateCaseSchema = z.object({ version: z.number().int().positive(), caseNumber: z.string().trim().min(1).max(100).optional(), title: z.string().trim().min(2).max(500).optional(), type: caseType.optional(), startDate: date.optional(), courtId: nullableUuid, managementOfficeId: nullableUuid, courtName: z.string().trim().max(240).nullable().optional(), managementOfficeName: z.string().trim().max(240).nullable().optional() }).refine((value) => Object.keys(value).length > 1);
export const transitionCaseSchema = z.object({ version: z.number().int().positive(), toStatus: caseStatus, reason: z.string().trim().min(2).max(2_000).nullable().optional(), openTaskStrategy: z.enum(["KEEP"]).optional() });
export const createParticipantSchema = participant;
export const updateParticipantSchema = participantBase.omit({ contactId: true }).partial().refine((value) => Object.keys(value).length > 0);
export const createRepresentationSchema = representation.omit({ representedContactId: true });
export const createTeamMemberSchema = teamMember;
export const updateTeamMemberSchema = z.object({ role: z.enum(["PRIMARY", "COLLABORATOR"]).optional(), unassign: z.boolean().optional() }).refine((value) => Object.keys(value).length > 0);

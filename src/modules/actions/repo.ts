import type { Prisma } from "../../generated/prisma/client.js";
import type { DatabaseClient } from "../auth/repo.js";
export const actionInclude = { uploadedBy: true, presentedBy: true, subCase: true, _count: { select: { documents: true } } } satisfies Prisma.CaseActionInclude;
export type ActionRow = Prisma.CaseActionGetPayload<{ include: typeof actionInclude }>;
export class ActionRepository {
  list(database: DatabaseClient, caseId: string, filters: { subCaseId?: string; type?: Prisma.EnumActionTypeFilter["equals"]; from?: Date; to?: Date; cursor?: { at: string; id: string }; limit: number }) { const cursor = filters.cursor ? { at: new Date(filters.cursor.at), id: filters.cursor.id } : null; return database.caseAction.findMany({ where: { caseId, deletedAt: null, ...(filters.subCaseId ? { subCaseId: filters.subCaseId } : {}), ...(filters.type ? { type: filters.type } : {}), ...((filters.from || filters.to) ? { documentAt: { ...(filters.from ? { gte: filters.from } : {}), ...(filters.to ? { lte: filters.to } : {}) } } : {}), ...(cursor ? { OR: [{ documentAt: { lt: cursor.at } }, { documentAt: cursor.at, id: { lt: cursor.id } }] } : {}) }, include: actionInclude, orderBy: [{ documentAt: "desc" }, { id: "desc" }], take: filters.limit + 1 }) as Promise<ActionRow[]>; }
  find(database: DatabaseClient, id: string) { return database.caseAction.findFirst({ where: { id, deletedAt: null }, include: actionInclude }); }
  create(database: DatabaseClient, data: Prisma.CaseActionUncheckedCreateInput) { return database.caseAction.create({ data, include: actionInclude }); }
  async update(database: DatabaseClient, id: string, version: number, data: Prisma.CaseActionUpdateManyMutationInput) { const result = await database.caseAction.updateMany({ where: { id, version, deletedAt: null }, data: { ...data, version: { increment: 1 } } }); if (result.count !== 1) return null; return this.find(database, id); }
  softDelete(database: DatabaseClient, id: string) { return database.caseAction.update({ where: { id }, data: { deletedAt: new Date(), version: { increment: 1 } } }); }
  statusEvents(database: DatabaseClient, caseId: string) { return database.caseStatusHistory.findMany({ where: { caseId }, include: { changedBy: true }, orderBy: [{ changedAt: "desc" }, { id: "desc" }] }); }
  subCaseEvents(database: DatabaseClient, caseId: string) { return database.subCase.findMany({ where: { caseId, deletedAt: null }, include: { createdBy: true }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] }); }
  subCaseStatusEvents(database: DatabaseClient, subCaseIds: string[]) { if (subCaseIds.length === 0) return Promise.resolve([]); return database.auditLog.findMany({ where: { action: "SUBCASE_STATUS_CHANGED", entityType: "SubCase", entityId: { in: subCaseIds } }, include: { actor: true }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] }); }
}
export const actionRepository = new ActionRepository();

import type { Prisma } from "../../generated/prisma/client.js";
import type { DatabaseClient } from "../auth/repo.js";

export const documentInclude = {
  createdBy: { select: { id: true, name: true } },
  versions: { include: { createdBy: { select: { id: true, name: true } } }, orderBy: { versionNumber: "desc" as const } }
} satisfies Prisma.DocumentInclude;
export type DocumentRow = Prisma.DocumentGetPayload<{ include: typeof documentInclude }>;

export class DocumentRepository {
  list(database: DatabaseClient, filters: { caseId?: string | undefined; subCaseId?: string | undefined; actionId?: string | undefined; taskId?: string | undefined; noteId?: string | undefined; cursor?: { createdAt: string; id: string } | undefined; limit: number }) { const cursor = filters.cursor ? { createdAt: new Date(filters.cursor.createdAt), id: filters.cursor.id } : null; return database.document.findMany({ where: { deletedAt: null, ...(filters.caseId ? { caseId: filters.caseId } : {}), ...(filters.subCaseId ? { subCaseId: filters.subCaseId } : {}), ...(filters.actionId ? { actionId: filters.actionId } : {}), ...(filters.taskId ? { taskId: filters.taskId } : {}), ...(filters.noteId ? { noteId: filters.noteId } : {}), ...(cursor ? { OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } }] } : {}) }, include: documentInclude, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: filters.limit + 1 }); }
  find(database: DatabaseClient, id: string, includeDeleted = false) { return database.document.findFirst({ where: { id, ...(includeDeleted ? {} : { deletedAt: null }) }, include: documentInclude }); }
  createWithVersion(database: DatabaseClient, document: Prisma.DocumentUncheckedCreateInput, version: Prisma.DocumentVersionUncheckedCreateWithoutDocumentInput) { return database.document.create({ data: { ...document, versions: { create: version } }, include: documentInclude }); }
  async update(database: DatabaseClient, id: string, version: number, data: Prisma.DocumentUpdateManyMutationInput) { const result = await database.document.updateMany({ where: { id, version, deletedAt: null }, data: { ...data, version: { increment: 1 } } }); if (result.count !== 1) return null; return this.find(database, id); }
  async archive(database: DatabaseClient, id: string, version: number) { const result = await database.document.updateMany({ where: { id, version, deletedAt: null }, data: { deletedAt: new Date(), version: { increment: 1 } } }); return result.count === 1; }
  lock(database: DatabaseClient, id: string) { return database.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${id}, 0))`; }
  latestVersionNumber(database: DatabaseClient, id: string) { return database.documentVersion.aggregate({ where: { documentId: id }, _max: { versionNumber: true } }); }
  createVersion(database: DatabaseClient, data: Prisma.DocumentVersionUncheckedCreateInput) { return database.documentVersion.create({ data }); }
  touch(database: DatabaseClient, id: string) { return database.document.update({ where: { id }, data: { version: { increment: 1 } } }); }
  findVersion(database: DatabaseClient, documentId: string, versionId?: string) { return database.documentVersion.findFirst({ where: { documentId, ...(versionId ? { id: versionId } : {}) }, orderBy: { versionNumber: "desc" }, include: { createdBy: { select: { id: true, name: true } } } }); }
  findCase(database: DatabaseClient, id: string) { return database.legalCase.findFirst({ where: { id, deletedAt: null }, select: { id: true, status: true } }); }
  findSubCase(database: DatabaseClient, id: string) { return database.subCase.findFirst({ where: { id, deletedAt: null }, select: { id: true, caseId: true, status: true, legalCase: { select: { status: true } } } }); }
  findAction(database: DatabaseClient, id: string) { return database.caseAction.findFirst({ where: { id, deletedAt: null }, select: { id: true, caseId: true, subCaseId: true, legalCase: { select: { status: true } }, subCase: { select: { status: true } } } }); }
  findTask(database: DatabaseClient, id: string) { return database.task.findFirst({ where: { id, deletedAt: null }, select: { id: true, caseId: true, subCaseId: true, legalCase: { select: { status: true } } } }); }
  findNote(database: DatabaseClient, id: string) { return database.note.findFirst({ where: { id, deletedAt: null }, select: { id: true, caseId: true, subCaseId: true, contactId: true, legalCase: { select: { status: true } }, subCase: { select: { caseId: true, legalCase: { select: { status: true } } } } } }); }
}
export const documentRepository = new DocumentRepository();

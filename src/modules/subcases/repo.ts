import type { Prisma } from "../../generated/prisma/client.js";
import type { DatabaseClient } from "../auth/repo.js";
export const subCaseInclude = { createdBy: true, _count: { select: { actions: true, tasks: true, notes: true, documents: true } } } satisfies Prisma.SubCaseInclude;
export class SubCaseRepository {
  list(database: DatabaseClient, caseId: string, filters: { type?: "EVIDENCE" | "INCIDENT"; status?: "ACTIVE" | "RESOLVED" | "CLOSED" }) { return database.subCase.findMany({ where: { caseId, deletedAt: null, ...(filters.type ? { type: filters.type } : {}), ...(filters.status ? { status: filters.status } : {}) }, include: subCaseInclude, orderBy: [{ openedOn: "desc" }, { id: "desc" }] }); }
  find(database: DatabaseClient, id: string) { return database.subCase.findFirst({ where: { id, deletedAt: null }, include: subCaseInclude }); }
  create(database: DatabaseClient, data: Prisma.SubCaseUncheckedCreateInput) { return database.subCase.create({ data, include: subCaseInclude }); }
  async update(database: DatabaseClient, id: string, version: number, data: Prisma.SubCaseUpdateManyMutationInput) { const result = await database.subCase.updateMany({ where: { id, version, deletedAt: null }, data: { ...data, version: { increment: 1 } } }); if (result.count !== 1) return null; return this.find(database, id); }
  softDelete(database: DatabaseClient, id: string) { return database.subCase.update({ where: { id }, data: { deletedAt: new Date(), version: { increment: 1 } } }); }
}
export const subCaseRepository = new SubCaseRepository();

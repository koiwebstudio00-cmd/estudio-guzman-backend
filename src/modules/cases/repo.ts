import type { Prisma } from "../../generated/prisma/client.js";
import type { DatabaseClient } from "../auth/repo.js";
import type { CaseCursor } from "./cursor.js";

export const caseInclude = {
  court: true,
  managementOffice: true,
  participants: { include: { contact: true, represented: { include: { representativeContact: true } } }, orderBy: [{ side: "asc" as const }, { sortOrder: "asc" as const }] },
  representations: { include: { representativeContact: true } },
  teamMembers: { include: { user: true, assignedBy: true }, orderBy: { assignedAt: "asc" as const } },
  statusHistory: { include: { changedBy: true }, orderBy: { changedAt: "desc" as const } },
  _count: { select: { subCases: true, actions: true, tasks: true, notes: true, documents: true } }
} satisfies Prisma.LegalCaseInclude;

export class CaseRepository {
  list(database: DatabaseClient, filters: { q?: string; status?: Prisma.EnumCaseStatusFilter["equals"]; type?: Prisma.EnumCaseTypeFilter["equals"]; responsibleId?: string; courtId?: string; from?: Date; to?: Date; cursor?: CaseCursor; limit: number }) {
    const clauses: Prisma.LegalCaseWhereInput[] = [];
    if (filters.q) clauses.push({ OR: [{ caseNumberNormalized: { contains: filters.q } }, { title: { contains: filters.q, mode: "insensitive" } }] });
    if (filters.cursor) clauses.push({ OR: [{ updatedAt: { lt: new Date(filters.cursor.updatedAt) } }, { updatedAt: new Date(filters.cursor.updatedAt), id: { lt: filters.cursor.id } }] });
    return database.legalCase.findMany({ where: { deletedAt: null, ...(filters.status ? { status: filters.status } : {}), ...(filters.type ? { type: filters.type } : {}), ...(filters.courtId ? { courtId: filters.courtId } : {}), ...(filters.responsibleId ? { teamMembers: { some: { userId: filters.responsibleId, role: "PRIMARY", unassignedAt: null } } } : {}), ...((filters.from || filters.to) ? { startDate: { ...(filters.from ? { gte: filters.from } : {}), ...(filters.to ? { lte: filters.to } : {}) } } : {}), ...(clauses.length ? { AND: clauses } : {}) }, include: caseInclude, orderBy: [{ updatedAt: "desc" }, { id: "desc" }], take: filters.limit + 1 });
  }
  findById(database: DatabaseClient, id: string, includeDeleted = false) { return database.legalCase.findFirst({ where: { id, ...(includeDeleted ? {} : { deletedAt: null }) }, include: caseInclude }); }
  create(database: DatabaseClient, data: Prisma.LegalCaseUncheckedCreateInput) { return database.legalCase.create({ data }); }
  async update(database: DatabaseClient, id: string, version: number, data: Prisma.LegalCaseUpdateManyMutationInput) { const result = await database.legalCase.updateMany({ where: { id, version, deletedAt: null }, data: { ...data, version: { increment: 1 } } }); if (result.count !== 1) return null; return this.findById(database, id); }
  createParticipant(database: DatabaseClient, data: Prisma.CaseParticipantUncheckedCreateInput) { return database.caseParticipant.create({ data, include: { contact: true, represented: { include: { representativeContact: true } } } }); }
  findParticipant(database: DatabaseClient, caseId: string, id: string) { return database.caseParticipant.findFirst({ where: { id, caseId, activeUntil: null }, include: { contact: true } }); }
  updateParticipant(database: DatabaseClient, id: string, data: Prisma.CaseParticipantUpdateInput) { return database.caseParticipant.update({ where: { id }, data, include: { contact: true } }); }
  createRepresentation(database: DatabaseClient, data: Prisma.CaseRepresentationUncheckedCreateInput) { return database.caseRepresentation.create({ data, include: { representativeContact: true, representedParticipant: { include: { contact: true } } } }); }
  findRepresentation(database: DatabaseClient, caseId: string, id: string) { return database.caseRepresentation.findFirst({ where: { id, caseId, activeUntil: null } }); }
  endRepresentation(database: DatabaseClient, id: string, at: Date) { return database.caseRepresentation.update({ where: { id }, data: { activeUntil: at, isPrimary: false } }); }
  unsetPrimaryRepresentations(database: DatabaseClient, participantId: string) { return database.caseRepresentation.updateMany({ where: { representedParticipantId: participantId, isPrimary: true, activeUntil: null }, data: { isPrimary: false } }); }
  createTeamMember(database: DatabaseClient, data: Prisma.CaseTeamMemberUncheckedCreateInput) { return database.caseTeamMember.create({ data, include: { user: true, assignedBy: true } }); }
  findTeamMember(database: DatabaseClient, caseId: string, id: string) { return database.caseTeamMember.findFirst({ where: { id, caseId, unassignedAt: null }, include: { user: true } }); }
  updateTeamMember(database: DatabaseClient, id: string, data: Prisma.CaseTeamMemberUpdateInput) { return database.caseTeamMember.update({ where: { id }, data, include: { user: true, assignedBy: true } }); }
  unassignPrimary(database: DatabaseClient, caseId: string, at: Date, exceptId?: string) { return database.caseTeamMember.updateMany({ where: { caseId, role: "PRIMARY", unassignedAt: null, ...(exceptId ? { id: { not: exceptId } } : {}) }, data: { unassignedAt: at } }); }
  addStatusHistory(database: DatabaseClient, data: Prisma.CaseStatusHistoryUncheckedCreateInput) { return database.caseStatusHistory.create({ data }); }
  countActiveUsers(database: DatabaseClient, ids: string[]) { return database.user.count({ where: { id: { in: ids }, status: "ACTIVE" } }); }
  countContacts(database: DatabaseClient, ids: string[]) { return database.contact.count({ where: { id: { in: ids }, deletedAt: null } }); }
  findCourt(database: DatabaseClient, id: string) { return database.court.findFirst({ where: { id, isActive: true } }); }
  findOffice(database: DatabaseClient, id: string) { return database.managementOffice.findFirst({ where: { id, isActive: true } }); }
  courtOfficeExists(database: DatabaseClient, courtId: string, managementOfficeId: string) { return database.courtManagementOffice.count({ where: { courtId, managementOfficeId } }); }
  countOpenTasks(database: DatabaseClient, caseId: string) { return database.task.count({ where: { caseId, deletedAt: null, status: { in: ["PENDING", "IN_PROGRESS"] } } }); }
  countActiveClients(database: DatabaseClient, caseId: string) { return database.caseParticipant.count({ where: { caseId, isClient: true, activeUntil: null } }); }
  softDelete(database: DatabaseClient, id: string) { return database.legalCase.update({ where: { id }, data: { deletedAt: new Date(), version: { increment: 1 } } }); }
  listForContact(database: DatabaseClient, contactId: string) { return database.legalCase.findMany({ where: { deletedAt: null, OR: [{ participants: { some: { contactId } } }, { representations: { some: { representativeContactId: contactId } } }] }, include: caseInclude, orderBy: { updatedAt: "desc" } }); }
}
export const caseRepository = new CaseRepository();

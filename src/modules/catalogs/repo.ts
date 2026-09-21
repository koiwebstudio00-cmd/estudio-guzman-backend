import type { Prisma } from "../../generated/prisma/client.js";
import type { DatabaseClient } from "../auth/repo.js";

const courtInclude = { offices: { include: { managementOffice: true } } } satisfies Prisma.CourtInclude;
const officeInclude = { courts: { include: { court: true } } } satisfies Prisma.ManagementOfficeInclude;

export class CatalogRepository {
  listCourts(database: DatabaseClient, filters: { q?: string; active?: boolean }) {
    return database.court.findMany({
      where: { ...(filters.q ? { nameNormalized: { contains: filters.q } } : {}), ...(filters.active !== undefined ? { isActive: filters.active } : {}) },
      include: courtInclude,
      orderBy: [{ nameNormalized: "asc" }, { id: "asc" }]
    });
  }

  findCourt(database: DatabaseClient, id: string) {
    return database.court.findUnique({ where: { id }, include: courtInclude });
  }

  createCourt(database: DatabaseClient, data: { name: string; nameNormalized: string; jurisdiction?: string | null; address?: string | null; officeIds: string[] }) {
    return database.court.create({ data: { name: data.name, nameNormalized: data.nameNormalized, ...(data.jurisdiction !== undefined ? { jurisdiction: data.jurisdiction } : {}), ...(data.address !== undefined ? { address: data.address } : {}), offices: { create: data.officeIds.map((managementOfficeId) => ({ managementOfficeId })) } }, include: courtInclude });
  }

  async updateCourt(database: DatabaseClient, id: string, data: { name?: string; nameNormalized?: string; jurisdiction?: string | null; address?: string | null; officeIds?: string[]; isActive?: boolean }) {
    if (data.officeIds) {
      await database.courtManagementOffice.deleteMany({ where: { courtId: id } });
      if (data.officeIds.length) await database.courtManagementOffice.createMany({ data: data.officeIds.map((managementOfficeId) => ({ courtId: id, managementOfficeId })) });
    }
    return database.court.update({ where: { id }, data: { ...(data.name ? { name: data.name } : {}), ...(data.nameNormalized ? { nameNormalized: data.nameNormalized } : {}), ...(data.jurisdiction !== undefined ? { jurisdiction: data.jurisdiction } : {}), ...(data.address !== undefined ? { address: data.address } : {}), ...(data.isActive !== undefined ? { isActive: data.isActive } : {}) }, include: courtInclude });
  }

  listOffices(database: DatabaseClient, filters: { q?: string; active?: boolean }) {
    return database.managementOffice.findMany({ where: { ...(filters.q ? { nameNormalized: { contains: filters.q } } : {}), ...(filters.active !== undefined ? { isActive: filters.active } : {}) }, include: officeInclude, orderBy: [{ nameNormalized: "asc" }, { id: "asc" }] });
  }

  findOffice(database: DatabaseClient, id: string) {
    return database.managementOffice.findUnique({ where: { id }, include: officeInclude });
  }

  createOffice(database: DatabaseClient, data: { name: string; nameNormalized: string; address?: string | null; courtIds: string[] }) {
    return database.managementOffice.create({ data: { name: data.name, nameNormalized: data.nameNormalized, ...(data.address !== undefined ? { address: data.address } : {}), courts: { create: data.courtIds.map((courtId) => ({ courtId })) } }, include: officeInclude });
  }

  async updateOffice(database: DatabaseClient, id: string, data: { name?: string; nameNormalized?: string; address?: string | null; courtIds?: string[]; isActive?: boolean }) {
    if (data.courtIds) {
      await database.courtManagementOffice.deleteMany({ where: { managementOfficeId: id } });
      if (data.courtIds.length) await database.courtManagementOffice.createMany({ data: data.courtIds.map((courtId) => ({ courtId, managementOfficeId: id })) });
    }
    return database.managementOffice.update({ where: { id }, data: { ...(data.name ? { name: data.name } : {}), ...(data.nameNormalized ? { nameNormalized: data.nameNormalized } : {}), ...(data.address !== undefined ? { address: data.address } : {}), ...(data.isActive !== undefined ? { isActive: data.isActive } : {}) }, include: officeInclude });
  }
}

export const catalogRepository = new CatalogRepository();

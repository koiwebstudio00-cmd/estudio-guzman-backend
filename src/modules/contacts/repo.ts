import type { Prisma } from "../../generated/prisma/client.js";
import type { ContactCategoryType } from "../../generated/prisma/enums.js";
import type { DatabaseClient } from "../auth/repo.js";
import type { ContactCursor } from "./cursor.js";

export const contactInclude = {
  categories: { orderBy: { type: "asc" as const } },
  channels: { orderBy: [{ sortOrder: "asc" as const }, { createdAt: "asc" as const }] },
  addresses: { orderBy: { createdAt: "asc" as const } },
  _count: { select: { caseParticipations: true, representations: true } }
} satisfies Prisma.ContactInclude;

export class ContactRepository {
  list(database: DatabaseClient, filters: { q?: string; kind?: "PERSON" | "ORGANIZATION"; category?: ContactCategoryType; cursor?: ContactCursor; limit: number }) {
    const clauses: Prisma.ContactWhereInput[] = [];
    if (filters.q) clauses.push({ OR: [
      { displayNameNormalized: { contains: filters.q } },
      { documentNumberNormalized: { contains: filters.q } },
      { taxIdNormalized: { contains: filters.q } },
      { channels: { some: { valueNormalized: { contains: filters.q } } } }
    ] });
    if (filters.cursor) clauses.push({ OR: [
      { displayNameNormalized: { gt: filters.cursor.name } },
      { displayNameNormalized: filters.cursor.name, id: { gt: filters.cursor.id } }
    ] });
    return database.contact.findMany({
      where: {
        deletedAt: null,
        ...(filters.kind ? { kind: filters.kind } : {}),
        ...(filters.category ? { categories: { some: { type: filters.category } } } : {}),
        ...(clauses.length ? { AND: clauses } : {})
      },
      include: contactInclude,
      orderBy: [{ displayNameNormalized: "asc" }, { id: "asc" }],
      take: filters.limit + 1
    });
  }
  findById(database: DatabaseClient, id: string, includeDeleted = false) {
    return database.contact.findFirst({ where: { id, ...(includeDeleted ? {} : { deletedAt: null }) }, include: contactInclude });
  }
  create(database: DatabaseClient, data: Prisma.ContactCreateInput) {
    return database.contact.create({ data, include: contactInclude });
  }
  async update(database: DatabaseClient, id: string, version: number, data: Prisma.ContactUpdateManyMutationInput) {
    const result = await database.contact.updateMany({ where: { id, version, deletedAt: null }, data: { ...data, version: { increment: 1 } } });
    if (result.count !== 1) return null;
    return this.findById(database, id);
  }
  replaceCategories(database: DatabaseClient, contactId: string, categories: ContactCategoryType[]) {
    return database.contactCategory.deleteMany({ where: { contactId } }).then(() => database.contactCategory.createMany({ data: categories.map((type) => ({ contactId, type })) }));
  }
  createChannel(database: DatabaseClient, contactId: string, data: Prisma.ContactChannelUncheckedCreateWithoutContactInput) {
    return database.contactChannel.create({ data: { ...data, contactId } });
  }
  findChannel(database: DatabaseClient, contactId: string, id: string) { return database.contactChannel.findFirst({ where: { id, contactId } }); }
  updateChannel(database: DatabaseClient, id: string, data: Prisma.ContactChannelUpdateInput) { return database.contactChannel.update({ where: { id }, data }); }
  deleteChannel(database: DatabaseClient, id: string) { return database.contactChannel.delete({ where: { id } }); }
  createAddress(database: DatabaseClient, contactId: string, data: Prisma.ContactAddressUncheckedCreateWithoutContactInput) { return database.contactAddress.create({ data: { ...data, contactId } }); }
  findAddress(database: DatabaseClient, contactId: string, id: string) { return database.contactAddress.findFirst({ where: { id, contactId } }); }
  updateAddress(database: DatabaseClient, id: string, data: Prisma.ContactAddressUpdateInput) { return database.contactAddress.update({ where: { id }, data }); }
  deleteAddress(database: DatabaseClient, id: string) { return database.contactAddress.delete({ where: { id } }); }
  unsetPrimaryChannels(database: DatabaseClient, contactId: string, type: ChannelInputType, exceptId?: string) {
    return database.contactChannel.updateMany({ where: { contactId, type, isPrimary: true, ...(exceptId ? { id: { not: exceptId } } : {}) }, data: { isPrimary: false } });
  }
  unsetPrimaryAddresses(database: DatabaseClient, contactId: string, type: AddressInputType, exceptId?: string) {
    return database.contactAddress.updateMany({ where: { contactId, type, isPrimary: true, ...(exceptId ? { id: { not: exceptId } } : {}) }, data: { isPrimary: false } });
  }
  softDelete(database: DatabaseClient, id: string) {
    return database.contact.update({ where: { id }, data: { deletedAt: new Date(), version: { increment: 1 } } });
  }
}

type ChannelInputType = "EMAIL" | "PHONE" | "WHATSAPP" | "OTHER";
type AddressInputType = "HOME" | "WORK" | "LEGAL" | "OTHER";
export const contactRepository = new ContactRepository();

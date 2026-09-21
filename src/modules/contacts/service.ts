import type { Prisma } from "../../generated/prisma/client.js";
import type { ContactCategoryType } from "../../generated/prisma/enums.js";
import { getPrisma } from "../../database/prisma.js";
import { ApiError } from "../../shared/http/errors.js";
import { normalizeChannel, normalizeIdentifier, normalizeSearch } from "../../shared/validation/normalize.js";
import { auditService } from "../audit/service.js";
import type { AuthenticatedActor, RequestContext } from "../auth/types.js";
import { outboxService } from "../outbox/service.js";
import { decodeContactCursor, encodeContactCursor } from "./cursor.js";
import { toContactDto } from "./mapper.js";
import { contactRepository } from "./repo.js";

type ChannelInput = { type: "EMAIL" | "PHONE" | "WHATSAPP" | "OTHER"; label?: string | null | undefined; value: string; isPrimary?: boolean | undefined; sortOrder?: number | undefined };
type ChannelUpdateInput = { type?: ChannelInput["type"] | undefined; label?: string | null | undefined; value?: string | undefined; isPrimary?: boolean | undefined; sortOrder?: number | undefined };
type AddressInput = { type?: "HOME" | "WORK" | "LEGAL" | "OTHER" | undefined; label?: string | null | undefined; line1: string; line2?: string | null | undefined; city?: string | null | undefined; province?: string | null | undefined; postalCode?: string | null | undefined; country?: string | undefined; isPrimary?: boolean | undefined };
type AddressUpdateInput = { type?: AddressInput["type"] | undefined; label?: string | null | undefined; line1?: string | undefined; line2?: string | null | undefined; city?: string | null | undefined; province?: string | null | undefined; postalCode?: string | null | undefined; country?: string | undefined; isPrimary?: boolean | undefined };
type ContactInput = {
  kind: "PERSON" | "ORGANIZATION"; firstName?: string | null | undefined; lastName?: string | null | undefined; legalName?: string | null | undefined;
  documentNumber?: string | null | undefined; taxId?: string | null | undefined; notes?: string | null | undefined; categories: ContactCategoryType[];
  channels: ChannelInput[]; addresses: AddressInput[];
};

function ctx(context: RequestContext) { return { ...(context.requestId ? { requestId: context.requestId } : {}), ...(context.ipAddress ? { ipAddress: context.ipAddress } : {}), ...(context.userAgent ? { userAgent: context.userAgent } : {}) }; }
function displayName(input: Pick<ContactInput, "kind" | "firstName" | "lastName" | "legalName">) {
  return input.kind === "PERSON" ? [input.firstName, input.lastName].filter(Boolean).join(" ").trim() : input.legalName?.trim() ?? "";
}
function channelData(input: ChannelInput) {
  return { type: input.type, value: input.value, valueNormalized: normalizeChannel(input.type, input.value), isPrimary: input.isPrimary ?? false, sortOrder: input.sortOrder ?? 0, ...(input.label !== undefined ? { label: input.label } : {}) };
}
function addressData(input: AddressInput) {
  return { type: input.type ?? "OTHER", line1: input.line1, country: input.country ?? "AR", isPrimary: input.isPrimary ?? false, ...(input.label !== undefined ? { label: input.label } : {}), ...(input.line2 !== undefined ? { line2: input.line2 } : {}), ...(input.city !== undefined ? { city: input.city } : {}), ...(input.province !== undefined ? { province: input.province } : {}), ...(input.postalCode !== undefined ? { postalCode: input.postalCode } : {}) };
}
function channelUpdateData(input: ChannelUpdateInput, type: ChannelInput["type"]): Prisma.ContactChannelUpdateInput {
  return { ...(input.type !== undefined ? { type: input.type } : {}), ...(input.label !== undefined ? { label: input.label } : {}), ...(input.value !== undefined ? { value: input.value, valueNormalized: normalizeChannel(type, input.value) } : {}), ...(input.isPrimary !== undefined ? { isPrimary: input.isPrimary } : {}), ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}) };
}
function addressUpdateData(input: AddressUpdateInput): Prisma.ContactAddressUpdateInput {
  return { ...(input.type !== undefined ? { type: input.type } : {}), ...(input.label !== undefined ? { label: input.label } : {}), ...(input.line1 !== undefined ? { line1: input.line1 } : {}), ...(input.line2 !== undefined ? { line2: input.line2 } : {}), ...(input.city !== undefined ? { city: input.city } : {}), ...(input.province !== undefined ? { province: input.province } : {}), ...(input.postalCode !== undefined ? { postalCode: input.postalCode } : {}), ...(input.country !== undefined ? { country: input.country } : {}), ...(input.isPrimary !== undefined ? { isPrimary: input.isPrimary } : {}) };
}

export class ContactService {
  async list(input: { q?: string | undefined; kind?: "PERSON" | "ORGANIZATION" | undefined; category?: ContactCategoryType | undefined; cursor?: string | undefined; limit: number }) {
    const cursor = decodeContactCursor(input.cursor);
    const rows = await contactRepository.list(getPrisma(), { ...(input.q ? { q: normalizeSearch(input.q) } : {}), ...(input.kind ? { kind: input.kind } : {}), ...(input.category ? { category: input.category } : {}), ...(cursor ? { cursor } : {}), limit: input.limit });
    const hasMore = rows.length > input.limit;
    const selected = hasMore ? rows.slice(0, input.limit) : rows;
    const last = selected.at(-1);
    return { data: selected.map(toContactDto), meta: { nextCursor: hasMore && last ? encodeContactCursor({ name: last.displayNameNormalized, id: last.id }) : null } };
  }
  async get(id: string) { const contact = await contactRepository.findById(getPrisma(), id); if (!contact) throw new ApiError("NOT_FOUND", "Contacto no encontrado."); return toContactDto(contact); }

  async create(input: ContactInput, actor: AuthenticatedActor, context: RequestContext) {
    const prisma = getPrisma(); const name = displayName(input);
    const contact = await prisma.$transaction(async (transaction) => {
      const created = await contactRepository.create(transaction, {
        kind: input.kind, displayName: name, displayNameNormalized: normalizeSearch(name),
        ...(input.firstName ? { firstName: input.firstName } : {}), ...(input.lastName ? { lastName: input.lastName } : {}), ...(input.legalName ? { legalName: input.legalName } : {}),
        ...(input.documentNumber ? { documentNumber: input.documentNumber, documentNumberNormalized: normalizeIdentifier(input.documentNumber) } : {}),
        ...(input.taxId ? { taxId: input.taxId, taxIdNormalized: normalizeIdentifier(input.taxId) } : {}), ...(input.notes !== undefined ? { notes: input.notes } : {}),
        createdBy: { connect: { id: actor.user.id } }, categories: { create: input.categories.map((type) => ({ type })) },
        channels: { create: input.channels.map(channelData) }, addresses: { create: input.addresses.map(addressData) }
      });
      await auditService.record(transaction, { actorId: actor.user.id, action: "CONTACT_CREATED", entityType: "Contact", entityId: created.id, after: { kind: created.kind, displayName: created.displayName }, ...ctx(context) });
      await outboxService.publish(transaction, { type: "CONTACT_CREATED", aggregateType: "Contact", aggregateId: created.id, payload: { contactId: created.id } });
      return created;
    }); return toContactDto(contact);
  }

  async update(id: string, input: { version: number; firstName?: string | null | undefined; lastName?: string | null | undefined; legalName?: string | null | undefined; documentNumber?: string | null | undefined; taxId?: string | null | undefined; notes?: string | null | undefined; categories?: ContactCategoryType[] | undefined }, actor: AuthenticatedActor, context: RequestContext) {
    const prisma = getPrisma(); const current = await contactRepository.findById(prisma, id); if (!current) throw new ApiError("NOT_FOUND", "Contacto no encontrado.");
    const firstName = input.firstName !== undefined ? input.firstName : current.firstName; const lastName = input.lastName !== undefined ? input.lastName : current.lastName; const legalName = input.legalName !== undefined ? input.legalName : current.legalName;
    const name = displayName({ kind: current.kind, firstName, lastName, legalName });
    if ((current.kind === "PERSON" && !firstName) || (current.kind === "ORGANIZATION" && !legalName)) throw new ApiError("VALIDATION_ERROR", "El nombre requerido para el tipo de contacto es obligatorio.");
    const updated = await prisma.$transaction(async (transaction) => {
      const contact = await contactRepository.update(transaction, id, input.version, {
        displayName: name, displayNameNormalized: normalizeSearch(name),
        ...(input.firstName !== undefined ? { firstName: input.firstName } : {}), ...(input.lastName !== undefined ? { lastName: input.lastName } : {}), ...(input.legalName !== undefined ? { legalName: input.legalName } : {}),
        ...(input.documentNumber !== undefined ? { documentNumber: input.documentNumber, documentNumberNormalized: input.documentNumber ? normalizeIdentifier(input.documentNumber) : null } : {}),
        ...(input.taxId !== undefined ? { taxId: input.taxId, taxIdNormalized: input.taxId ? normalizeIdentifier(input.taxId) : null } : {}), ...(input.notes !== undefined ? { notes: input.notes } : {})
      }); if (!contact) throw new ApiError("CONFLICT", "El contacto fue modificado por otra operación.");
      if (input.categories) { await contactRepository.replaceCategories(transaction, id, input.categories); }
      const final = await contactRepository.findById(transaction, id); if (!final) throw new ApiError("NOT_FOUND", "Contacto no encontrado.");
      await auditService.record(transaction, { actorId: actor.user.id, action: "CONTACT_UPDATED", entityType: "Contact", entityId: id, before: { displayName: current.displayName, version: current.version }, after: { displayName: final.displayName, version: final.version }, ...ctx(context) });
      await outboxService.publish(transaction, { type: "CONTACT_UPDATED", aggregateType: "Contact", aggregateId: id, payload: { contactId: id, version: final.version } });
      return final;
    }); return toContactDto(updated);
  }

  async remove(id: string, actor: AuthenticatedActor, context: RequestContext) {
    const prisma = getPrisma(); const current = await contactRepository.findById(prisma, id); if (!current) throw new ApiError("NOT_FOUND", "Contacto no encontrado.");
    if (current._count.caseParticipations > 0 || current._count.representations > 0) throw new ApiError("CONFLICT", "No se puede dar de baja un contacto vinculado a expedientes.");
    await prisma.$transaction(async (transaction) => {
      await contactRepository.softDelete(transaction, id);
      await auditService.record(transaction, { actorId: actor.user.id, action: "CONTACT_DELETED", entityType: "Contact", entityId: id, before: { displayName: current.displayName }, ...ctx(context) });
      await outboxService.publish(transaction, { type: "CONTACT_DELETED", aggregateType: "Contact", aggregateId: id, payload: { contactId: id } });
    });
  }

  async addChannel(contactId: string, input: ChannelInput, actor: AuthenticatedActor, context: RequestContext) { return this.mutateChild(contactId, actor, context, "CONTACT_CHANNEL_CREATED", async (tx) => { if (input.isPrimary) await contactRepository.unsetPrimaryChannels(tx, contactId, input.type); return contactRepository.createChannel(tx, contactId, channelData(input)); }); }
  async updateChannel(contactId: string, channelId: string, input: ChannelUpdateInput, actor: AuthenticatedActor, context: RequestContext) { const current = await contactRepository.findChannel(getPrisma(), contactId, channelId); if (!current) throw new ApiError("NOT_FOUND", "Canal no encontrado."); return this.mutateChild(contactId, actor, context, "CONTACT_CHANNEL_UPDATED", async (tx) => { const type = input.type ?? current.type; if (input.isPrimary ?? current.isPrimary) await contactRepository.unsetPrimaryChannels(tx, contactId, type, channelId); const normalizedInput = input.type !== undefined && input.value === undefined ? { ...input, value: current.value } : input; return contactRepository.updateChannel(tx, channelId, channelUpdateData(normalizedInput, type)); }); }
  async deleteChannel(contactId: string, channelId: string, actor: AuthenticatedActor, context: RequestContext) { if (!(await contactRepository.findChannel(getPrisma(), contactId, channelId))) throw new ApiError("NOT_FOUND", "Canal no encontrado."); await this.mutateChild(contactId, actor, context, "CONTACT_CHANNEL_DELETED", (tx) => contactRepository.deleteChannel(tx, channelId)); }
  async addAddress(contactId: string, input: AddressInput, actor: AuthenticatedActor, context: RequestContext) { return this.mutateChild(contactId, actor, context, "CONTACT_ADDRESS_CREATED", async (tx) => { const type = input.type ?? "OTHER"; if (input.isPrimary) await contactRepository.unsetPrimaryAddresses(tx, contactId, type); return contactRepository.createAddress(tx, contactId, addressData(input)); }); }
  async updateAddress(contactId: string, addressId: string, input: AddressUpdateInput, actor: AuthenticatedActor, context: RequestContext) { const current = await contactRepository.findAddress(getPrisma(), contactId, addressId); if (!current) throw new ApiError("NOT_FOUND", "Domicilio no encontrado."); return this.mutateChild(contactId, actor, context, "CONTACT_ADDRESS_UPDATED", async (tx) => { const type = input.type ?? current.type; if (input.isPrimary ?? current.isPrimary) await contactRepository.unsetPrimaryAddresses(tx, contactId, type, addressId); return contactRepository.updateAddress(tx, addressId, addressUpdateData(input)); }); }
  async deleteAddress(contactId: string, addressId: string, actor: AuthenticatedActor, context: RequestContext) { if (!(await contactRepository.findAddress(getPrisma(), contactId, addressId))) throw new ApiError("NOT_FOUND", "Domicilio no encontrado."); await this.mutateChild(contactId, actor, context, "CONTACT_ADDRESS_DELETED", (tx) => contactRepository.deleteAddress(tx, addressId)); }
  private async mutateChild<T>(contactId: string, actor: AuthenticatedActor, context: RequestContext, action: string, operation: (transaction: Prisma.TransactionClient) => Promise<T>) { const prisma = getPrisma(); if (!(await contactRepository.findById(prisma, contactId))) throw new ApiError("NOT_FOUND", "Contacto no encontrado."); return prisma.$transaction(async (transaction) => { const result = await operation(transaction); await auditService.record(transaction, { actorId: actor.user.id, action, entityType: "Contact", entityId: contactId, ...ctx(context) }); await outboxService.publish(transaction, { type: action, aggregateType: "Contact", aggregateId: contactId, payload: { contactId } }); return result; }); }
}
export const contactService = new ContactService();

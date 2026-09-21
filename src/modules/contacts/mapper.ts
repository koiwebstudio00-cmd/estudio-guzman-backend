import { contactRepository } from "./repo.js";
export type ContactRecord = NonNullable<Awaited<ReturnType<typeof contactRepository.findById>>>;
export function toContactDto(contact: ContactRecord) {
  return {
    id: contact.id, kind: contact.kind, displayName: contact.displayName,
    firstName: contact.firstName, lastName: contact.lastName, legalName: contact.legalName,
    documentNumber: contact.documentNumber, taxId: contact.taxId, notes: contact.notes,
    version: contact.version, createdAt: contact.createdAt, updatedAt: contact.updatedAt,
    categories: contact.categories.map(({ type }) => type),
    channels: contact.channels.map(({ valueNormalized: _normalized, ...channel }) => channel),
    addresses: contact.addresses,
    relations: { cases: contact._count.caseParticipations, representations: contact._count.representations }
  };
}

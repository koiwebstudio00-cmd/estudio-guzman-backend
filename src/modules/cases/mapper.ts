import { caseRepository } from "./repo.js";

export type CaseRecord = NonNullable<Awaited<ReturnType<typeof caseRepository.findById>>>;
const contact = (value: CaseRecord["participants"][number]["contact"]) => ({ id: value.id, kind: value.kind, displayName: value.displayName });
const user = (value: CaseRecord["teamMembers"][number]["user"]) => ({ id: value.id, name: value.name, email: value.email });

export function toCaseDto(value: CaseRecord) {
  return {
    id: value.id, caseNumber: value.caseNumber, title: value.title, type: value.type, status: value.status,
    startDate: value.startDate, closedOn: value.closedOn, archivedOn: value.archivedOn, version: value.version,
    createdAt: value.createdAt, updatedAt: value.updatedAt,
    court: value.court ? { id: value.court.id, name: value.court.name } : null,
    managementOffice: value.managementOffice ? { id: value.managementOffice.id, name: value.managementOffice.name } : null,
    courtName: value.courtName ?? value.court?.name ?? null,
    managementOfficeName: value.managementOfficeName ?? value.managementOffice?.name ?? null,
    participants: value.participants.map((item) => ({ id: item.id, role: item.role, side: item.side, isClient: item.isClient, label: item.label, notes: item.notes, sortOrder: item.sortOrder, activeFrom: item.activeFrom, activeUntil: item.activeUntil, contact: contact(item.contact), representations: item.represented.map((representation) => ({ id: representation.id, type: representation.type, isPrimary: representation.isPrimary, activeFrom: representation.activeFrom, activeUntil: representation.activeUntil, representative: contact(representation.representativeContact) })) })),
    team: value.teamMembers.map((item) => ({ id: item.id, role: item.role, assignedAt: item.assignedAt, unassignedAt: item.unassignedAt, user: user(item.user) })),
    statusHistory: value.statusHistory.map((item) => ({ id: item.id, fromStatus: item.fromStatus, toStatus: item.toStatus, reason: item.reason, changedAt: item.changedAt, changedBy: { id: item.changedBy.id, name: item.changedBy.name } })),
    summary: value._count
  };
}

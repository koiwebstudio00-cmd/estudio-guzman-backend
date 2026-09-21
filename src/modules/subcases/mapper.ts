import { subCaseRepository } from "./repo.js";
type SubCaseRecord = NonNullable<Awaited<ReturnType<typeof subCaseRepository.find>>>;
export const toSubCaseDto = (value: SubCaseRecord) => ({ id: value.id, caseId: value.caseId, type: value.type, title: value.title, description: value.description, status: value.status, openedOn: value.openedOn, closedOn: value.closedOn, version: value.version, createdAt: value.createdAt, updatedAt: value.updatedAt, createdBy: { id: value.createdBy.id, name: value.createdBy.name }, summary: value._count });

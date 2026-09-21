import type { NoteRow } from "./repo.js";

export const toNoteDto = (value: NoteRow) => ({
  id: value.id,
  content: value.content,
  version: value.version,
  caseId: value.caseId,
  subCaseId: value.subCaseId,
  contactId: value.contactId,
  author: value.author,
  createdAt: value.createdAt,
  updatedAt: value.updatedAt,
});

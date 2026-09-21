import type { Prisma } from "../../generated/prisma/client.js";
import type { DatabaseClient } from "../auth/repo.js";

export const noteInclude = { author: { select: { id: true, name: true } } } satisfies Prisma.NoteInclude;
export type NoteRow = Prisma.NoteGetPayload<{ include: typeof noteInclude }>;

export class NoteRepository {
  list(db: DatabaseClient, input: { caseId?: string | undefined; subCaseId?: string | undefined; contactId?: string | undefined; cursor?: { at: Date; id: string } | undefined; limit: number }) {
    return db.note.findMany({
      where: {
        deletedAt: null,
        ...(input.caseId ? { caseId: input.caseId } : {}),
        ...(input.subCaseId ? { subCaseId: input.subCaseId } : {}),
        ...(input.contactId ? { contactId: input.contactId } : {}),
        ...(input.cursor ? { OR: [{ createdAt: { lt: input.cursor.at } }, { createdAt: input.cursor.at, id: { lt: input.cursor.id } }] } : {}),
      },
      include: noteInclude,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: input.limit + 1,
    });
  }
  create(db: DatabaseClient, data: Prisma.NoteUncheckedCreateInput) { return db.note.create({ data, include: noteInclude }); }
  legalCase(db: DatabaseClient, id: string) { return db.legalCase.findFirst({ where: { id, deletedAt: null }, select: { id: true, status: true } }); }
  subcase(db: DatabaseClient, id: string) { return db.subCase.findFirst({ where: { id, deletedAt: null }, select: { id: true, caseId: true, legalCase: { select: { status: true } } } }); }
  contact(db: DatabaseClient, id: string) { return db.contact.findFirst({ where: { id, deletedAt: null }, select: { id: true } }); }
}
export const noteRepository = new NoteRepository();

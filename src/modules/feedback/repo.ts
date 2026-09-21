import type { FeedbackStatus, Prisma } from "../../generated/prisma/client.js"; import type { DatabaseClient } from "../auth/repo.js";
export const feedbackInclude = { submittedBy: { select: { id: true, name: true } }, resolvedBy: { select: { id: true, name: true } } } satisfies Prisma.FeedbackInclude;
export class FeedbackRepository {
  create(db: DatabaseClient, message: string, userId: string) { return db.feedback.create({ data: { message, submittedById: userId }, include: feedbackInclude }); }
  list(db: DatabaseClient, input: { status?: FeedbackStatus | undefined; cursor?: { at: Date; id: string } | undefined; limit: number }) { return db.feedback.findMany({ where: { ...(input.status ? { status: input.status } : {}), ...(input.cursor ? { OR: [{ createdAt: { lt: input.cursor.at } }, { createdAt: input.cursor.at, id: { lt: input.cursor.id } }] } : {}) }, include: feedbackInclude, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: input.limit + 1 }); }
  update(db: DatabaseClient, id: string, data: Prisma.FeedbackUncheckedUpdateInput) { return db.feedback.update({ where: { id }, data, include: feedbackInclude }); }
  find(db: DatabaseClient, id: string) { return db.feedback.findUnique({ where: { id }, include: feedbackInclude }); }
}
export const feedbackRepository = new FeedbackRepository();

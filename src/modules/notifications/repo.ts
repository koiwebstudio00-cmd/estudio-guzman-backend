import type { Prisma } from "../../generated/prisma/client.js"; import type { DatabaseClient } from "../auth/repo.js";
export class NotificationRepository {
  list(db: DatabaseClient, input: { userId: string; unread?: boolean | undefined; cursor?: { at: Date; id: string } | undefined; limit: number }) { return db.notification.findMany({ where: { userId: input.userId, ...(input.unread === true ? { readAt: null } : {}), ...(input.unread === false ? { readAt: { not: null } } : {}), ...(input.cursor ? { OR: [{ createdAt: { lt: input.cursor.at } }, { createdAt: input.cursor.at, id: { lt: input.cursor.id } }] } : {}) }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: input.limit + 1 }); }
  unreadCount(db: DatabaseClient, userId: string) { return db.notification.count({ where: { userId, readAt: null } }); }
  read(db: DatabaseClient, id: string, userId: string) { return db.notification.updateMany({ where: { id, userId, readAt: null }, data: { readAt: new Date() } }); }
  readAll(db: DatabaseClient, userId: string) { return db.notification.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } }); }
  preference(db: DatabaseClient, userId: string) { return db.notificationPreference.findUnique({ where: { userId } }); }
  savePreference(db: DatabaseClient, userId: string, data: Prisma.NotificationPreferenceUncheckedUpdateInput) { return db.notificationPreference.upsert({ where: { userId }, create: { userId, ...data as Prisma.NotificationPreferenceUncheckedCreateWithoutUserInput }, update: data }); }
}
export const notificationRepository = new NotificationRepository();

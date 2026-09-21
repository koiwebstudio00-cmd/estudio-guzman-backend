import type { Prisma, PrismaClient } from "../generated/prisma/client.js";

interface ClaimedEvent { id: string; type: string; payload: Prisma.JsonValue; attempts: number }
const objectPayload = (value: Prisma.JsonValue) => value && typeof value === "object" && !Array.isArray(value) ? value : null;
const text = (value: unknown) => typeof value === "string" ? value : null;
const preferenceField = { TASK_ASSIGNED: "taskAssigned", TASK_DUE_SOON: "taskDueSoon", TASK_OVERDUE: "taskOverdue", CASE_STATUS_CHANGED: "caseStatusChanged" } as const;

export class NotificationWorker {
  constructor(private readonly prisma: PrismaClient, private readonly maxAttempts = 5) {}
  async runOnce() { const event = await this.claim(); if (!event) return false; try { await this.process(event); } catch { await this.fail(event, "No se pudo procesar el evento de notificación."); } return true; }

  async enqueueTaskDeadlines(now = new Date()) {
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const assignments = await this.prisma.taskAssignment.findMany({ where: { unassignedAt: null, task: { deletedAt: null, status: { in: ["PENDING", "IN_PROGRESS"] }, dueDate: { not: null } }, user: { status: "ACTIVE" } }, select: { userId: true, task: { select: { id: true, dueDate: true } }, user: { select: { notificationPreference: true } } } });
    const events: Prisma.OutboxEventCreateManyInput[] = [];
    for (const item of assignments) { const dueDate = item.task.dueDate!; const diff = Math.round((dueDate.getTime() - today.getTime()) / 86_400_000); const lead = item.user.notificationPreference?.dueSoonLeadDays ?? 1; const type = diff < 0 ? "TASK_OVERDUE" : diff <= lead ? "TASK_DUE_SOON" : null; if (!type) continue; events.push({ type, aggregateType: "Task", aggregateId: item.task.id, dedupeKey: `${type}:${item.task.id}:${item.userId}:${dueDate.toISOString().slice(0, 10)}`, payload: { taskId: item.task.id, userId: item.userId } }); }
    if (events.length) await this.prisma.outboxEvent.createMany({ data: events, skipDuplicates: true }); return events.length;
  }

  async housekeeping(now = new Date()) { const processedBefore = new Date(now.getTime() - 30 * 86_400_000); const credentialsBefore = new Date(now.getTime() - 7 * 86_400_000); return this.prisma.$transaction([this.prisma.session.deleteMany({ where: { OR: [{ expiresAt: { lt: now } }, { revokedAt: { lt: credentialsBefore } }] } }), this.prisma.passwordResetToken.deleteMany({ where: { OR: [{ expiresAt: { lt: credentialsBefore } }, { usedAt: { lt: credentialsBefore } }] } }), this.prisma.outboxEvent.deleteMany({ where: { status: "PROCESSED", processedAt: { lt: processedBefore } } })]); }

  private async claim(): Promise<ClaimedEvent | null> { const now = new Date(); const stale = new Date(now.getTime() - 15 * 60_000); return this.prisma.$transaction(async (tx) => { const rows = await tx.$queryRaw<ClaimedEvent[]>`
    WITH candidate AS (SELECT id FROM outbox_events WHERE type IN ('TASK_ASSIGNED','TASK_DUE_SOON','TASK_OVERDUE','CASE_STATUS_CHANGED') AND available_at <= ${now} AND (status = 'PENDING' OR (status = 'PROCESSING' AND locked_at < ${stale})) ORDER BY available_at, created_at FOR UPDATE SKIP LOCKED LIMIT 1)
    UPDATE outbox_events e SET status = 'PROCESSING', locked_at = ${now}, attempts = e.attempts + 1 FROM candidate WHERE e.id = candidate.id RETURNING e.id, e.type, e.payload, e.attempts`;
    return rows[0] ?? null; }); }

  private async process(event: ClaimedEvent) { const payload = objectPayload(event.payload); if (!payload) throw new Error("payload"); const taskId = text(payload.taskId); const explicitUser = text(payload.userId); let recipients: string[] = []; let title = "Nueva notificación"; let body: string | null = null; let entityType: string | null = null; let entityId: string | null = null;
    if (event.type.startsWith("TASK_")) { if (!taskId || !explicitUser) throw new Error("task payload"); const task = await this.prisma.task.findUnique({ where: { id: taskId }, select: { title: true } }); if (!task) throw new Error("task"); recipients = [explicitUser]; entityType = "Task"; entityId = taskId; title = event.type === "TASK_ASSIGNED" ? "Nueva tarea asignada" : event.type === "TASK_OVERDUE" ? "Tarea vencida" : "Tarea próxima a vencer"; body = task.title; }
    else { const caseId = text(payload.caseId); if (!caseId) throw new Error("case payload"); const legalCase = await this.prisma.legalCase.findUnique({ where: { id: caseId }, select: { title: true, teamMembers: { where: { unassignedAt: null }, select: { userId: true } } } }); if (!legalCase) throw new Error("case"); recipients = [...new Set(legalCase.teamMembers.map(({ userId }) => userId))]; entityType = "LegalCase"; entityId = caseId; title = "Cambio de estado del expediente"; body = legalCase.title; }
    await this.prisma.$transaction(async (tx) => { for (const userId of recipients) { const preference = await tx.notificationPreference.findUnique({ where: { userId } }); const field = preferenceField[event.type as keyof typeof preferenceField]; if (field && preference?.[field] === false) continue; await tx.notification.upsert({ where: { dedupeKey: `${event.id}:${userId}` }, update: {}, create: { dedupeKey: `${event.id}:${userId}`, userId, type: event.type, title, body, entityType, entityId } }); } await tx.outboxEvent.update({ where: { id: event.id }, data: { status: "PROCESSED", processedAt: new Date(), lockedAt: null, lastError: null } }); }); }

  private async fail(event: ClaimedEvent, message: string) { const terminal = event.attempts >= this.maxAttempts; const delay = Math.min(300, 2 ** event.attempts); await this.prisma.$transaction(async (tx) => { await tx.outboxEvent.update({ where: { id: event.id }, data: terminal ? { status: "FAILED", lockedAt: null, lastError: message } : { status: "PENDING", lockedAt: null, lastError: message, availableAt: new Date(Date.now() + delay * 1_000) } }); if (terminal) { const admins = await tx.user.findMany({ where: { status: "ACTIVE", role: { permissions: { some: { permission: { code: "audit.read" } } } } }, select: { id: true } }); if (admins.length) await tx.notification.createMany({ data: admins.map(({ id }) => ({ dedupeKey: `worker-failed:${event.id}:${id}`, userId: id, type: "WORKER_EVENT_FAILED", title: "Evento del worker fallido", body: `Evento ${event.type} agotó sus reintentos.` })), skipDuplicates: true }); } }); }
}

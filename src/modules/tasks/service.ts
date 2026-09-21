import type { Prisma } from "../../generated/prisma/client.js";
import type { TaskPriority, TaskStatus } from "../../generated/prisma/enums.js";
import { getPrisma } from "../../database/prisma.js";
import { ApiError } from "../../shared/http/errors.js";
import { auditService } from "../audit/service.js";
import type { DatabaseClient } from "../auth/repo.js";
import type { AuthenticatedActor, RequestContext } from "../auth/types.js";
import { outboxService } from "../outbox/service.js";
import { decodeTaskCursor, encodeTaskCursor } from "./cursor.js";
import { toTaskDto } from "./mapper.js";
import { taskRepository, type TaskRow } from "./repo.js";

type TaskListInput = {
  status?: TaskStatus | undefined;
  priority?: TaskPriority | undefined;
  assigneeId?: string | undefined;
  caseId?: string | undefined;
  dueFrom?: Date | undefined;
  dueTo?: Date | undefined;
  cursor?: string | undefined;
  limit: number;
};
type TaskCreateInput = {
  title: string;
  description?: string | null | undefined;
  status: "PENDING" | "IN_PROGRESS";
  priority: TaskPriority;
  dueDate?: Date | null | undefined;
  caseId?: string | null | undefined;
  subCaseId?: string | null | undefined;
  assigneeIds: string[];
};
type TaskUpdateInput = {
  version: number;
  title?: string | undefined;
  description?: string | null | undefined;
  priority?: TaskPriority | undefined;
  dueDate?: Date | null | undefined;
};

const transitions: Record<TaskStatus, TaskStatus[]> = {
  PENDING: ["IN_PROGRESS", "COMPLETED", "CANCELLED"],
  IN_PROGRESS: ["PENDING", "COMPLETED", "CANCELLED"],
  COMPLETED: ["PENDING", "IN_PROGRESS"],
  CANCELLED: ["PENDING"],
};
const needsReason = (from: TaskStatus, to: TaskStatus) =>
  to === "CANCELLED" || from === "COMPLETED" || from === "CANCELLED" || (from === "IN_PROGRESS" && to === "PENDING");
const metadata = (context: RequestContext) => ({
  ...(context.requestId ? { requestId: context.requestId } : {}),
  ...(context.ipAddress ? { ipAddress: context.ipAddress } : {}),
  ...(context.userAgent ? { userAgent: context.userAgent } : {}),
});

export class TaskService {
  async list(input: TaskListInput) {
    const cursor = decodeTaskCursor(input.cursor);
    const rows = await taskRepository.list(getPrisma(), {
      limit: input.limit,
      ...(input.status ? { status: input.status } : {}),
      ...(input.priority ? { priority: input.priority } : {}),
      ...(input.assigneeId ? { assigneeId: input.assigneeId } : {}),
      ...(input.caseId ? { caseId: input.caseId } : {}),
      ...(input.dueFrom ? { dueFrom: input.dueFrom } : {}),
      ...(input.dueTo ? { dueTo: input.dueTo } : {}),
      ...(cursor ? { cursor } : {}),
    });
    const hasMore = rows.length > input.limit;
    const selected = hasMore ? rows.slice(0, input.limit) : rows;
    const last = selected.at(-1);
    return { data: selected.map(toTaskDto), meta: { nextCursor: hasMore && last ? encodeTaskCursor({ updatedAt: last.updatedAt.toISOString(), id: last.id }) : null } };
  }

  async get(id: string) { return toTaskDto(await this.task(id)); }

  async create(input: TaskCreateInput, actor: AuthenticatedActor, context: RequestContext) {
    const userIds = [...new Set(input.assigneeIds)];
    await this.validateContext(getPrisma(), input.caseId ?? null, input.subCaseId ?? null);
    await this.validateUsers(getPrisma(), userIds);
    if (!this.isManager(actor) && userIds.some((id) => id !== actor.user.id)) throw new ApiError("FORBIDDEN", "Sólo puede asignarse tareas a sí misma.");
    return getPrisma().$transaction(async (tx) => {
      const value = await taskRepository.create(tx, {
        title: input.title, description: input.description ?? null, status: input.status,
        priority: input.priority, dueDate: input.dueDate ?? null, caseId: input.caseId ?? null,
        subCaseId: input.subCaseId ?? null, createdById: actor.user.id,
      }, userIds, actor.user.id);
      await this.record(tx, actor, context, "TASK_CREATED", value.id, { status: value.status, assigneeIds: userIds });
      for (const userId of userIds) await this.assignedEvent(tx, value.id, userId);
      return toTaskDto(value);
    });
  }

  async update(id: string, input: TaskUpdateInput, actor: AuthenticatedActor, context: RequestContext) {
    const current = await this.task(id);
    this.assertEditable(current, actor);
    await this.mutable(current);
    return getPrisma().$transaction(async (tx) => {
      const value = await taskRepository.update(tx, id, input.version, {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.priority !== undefined ? { priority: input.priority } : {}),
        ...(input.dueDate !== undefined ? { dueDate: input.dueDate } : {}),
      });
      if (!value) throw new ApiError("CONFLICT", "La tarea fue modificada por otra operación.");
      await this.record(tx, actor, context, "TASK_UPDATED", id, { version: value.version });
      return toTaskDto(value);
    });
  }

  async transition(id: string, input: { version: number; toStatus: TaskStatus; reason?: string | null | undefined }, actor: AuthenticatedActor, context: RequestContext) {
    const current = await this.task(id);
    this.assertEditable(current, actor);
    if (!transitions[current.status].includes(input.toStatus)) throw new ApiError("CONFLICT", `Transición no permitida: ${current.status} → ${input.toStatus}.`);
    if (needsReason(current.status, input.toStatus) && !input.reason) throw new ApiError("VALIDATION_ERROR", "El motivo es obligatorio.");
    await this.mutable(current);
    return getPrisma().$transaction(async (tx) => {
      const value = await taskRepository.update(tx, id, input.version, { status: input.toStatus, completedAt: input.toStatus === "COMPLETED" ? new Date() : null });
      if (!value) throw new ApiError("CONFLICT", "La tarea fue modificada por otra operación.");
      await taskRepository.history(tx, { taskId: id, fromStatus: current.status, toStatus: input.toStatus, reason: input.reason ?? null, changedById: actor.user.id });
      await this.record(tx, actor, context, "TASK_STATUS_CHANGED", id, { fromStatus: current.status, toStatus: input.toStatus, reason: input.reason ?? null });
      return toTaskDto((await taskRepository.find(tx, id))!);
    });
  }

  async assign(id: string, userIds: string[], actor: AuthenticatedActor, context: RequestContext) {
    const current = await this.task(id);
    this.assertEditable(current, actor);
    await this.mutable(current);
    const ids = [...new Set(userIds)];
    await this.validateUsers(getPrisma(), ids);
    if (!this.isManager(actor) && (ids.length !== 1 || ids[0] !== actor.user.id)) throw new ApiError("FORBIDDEN", "Sólo puede asignarse la tarea a sí misma.");
    return getPrisma().$transaction(async (tx) => {
      const active = current.assignments.filter((assignment) => !assignment.unassignedAt).map((assignment) => assignment.user.id);
      await taskRepository.closeAssignments(tx, id, ids);
      const additions = ids.filter((userId) => !active.includes(userId));
      if (additions.length) await taskRepository.addAssignments(tx, id, additions, actor.user.id);
      await this.record(tx, actor, context, "TASK_ASSIGNED", id, { before: active, after: ids }, false);
      for (const userId of additions) await this.assignedEvent(tx, id, userId);
      return toTaskDto((await taskRepository.find(tx, id))!);
    });
  }

  async comment(id: string, content: string, actor: AuthenticatedActor, context: RequestContext) {
    const task = await this.task(id);
    this.assertEditable(task, actor);
    await this.mutable(task);
    return getPrisma().$transaction(async (tx) => {
      const value = await taskRepository.comment(tx, id, actor.user.id, content);
      await this.record(tx, actor, context, "TASK_COMMENT_CREATED", id, { commentId: value.id });
      return value;
    });
  }

  async updateComment(taskId: string, commentId: string, version: number, content: string, actor: AuthenticatedActor, context: RequestContext) {
    const task = await this.task(taskId);
    await this.mutable(task);
    const value = await taskRepository.findComment(getPrisma(), taskId, commentId);
    if (!value) throw new ApiError("NOT_FOUND", "Comentario no encontrado.");
    this.assertCommentOwner(value.authorId, actor);
    return getPrisma().$transaction(async (tx) => {
      if (await taskRepository.updateComment(tx, commentId, version, content) !== 1) throw new ApiError("CONFLICT", "El comentario fue modificado.");
      await this.record(tx, actor, context, "TASK_COMMENT_UPDATED", taskId, { commentId });
      return taskRepository.findComment(tx, taskId, commentId);
    });
  }

  async deleteComment(taskId: string, commentId: string, actor: AuthenticatedActor, context: RequestContext) {
    const task = await this.task(taskId);
    await this.mutable(task);
    const value = await taskRepository.findComment(getPrisma(), taskId, commentId);
    if (!value) throw new ApiError("NOT_FOUND", "Comentario no encontrado.");
    this.assertCommentOwner(value.authorId, actor);
    await getPrisma().$transaction(async (tx) => {
      await taskRepository.deleteComment(tx, commentId);
      await this.record(tx, actor, context, "TASK_COMMENT_DELETED", taskId, { commentId });
    });
  }

  private async task(id: string) {
    const value = await taskRepository.find(getPrisma(), id);
    if (!value) throw new ApiError("NOT_FOUND", "Tarea no encontrada.");
    return value;
  }
  private isManager(actor: AuthenticatedActor) { return actor.user.permissions.includes("tasks.delete"); }
  private assertEditable(task: TaskRow, actor: AuthenticatedActor) {
    if (this.isManager(actor)) return;
    const participates = task.createdById === actor.user.id || task.assignments.some((assignment) => !assignment.unassignedAt && assignment.userId === actor.user.id);
    if (!participates) throw new ApiError("FORBIDDEN", "No puede modificar esta tarea.");
    if (task.status === "COMPLETED" || task.status === "CANCELLED") throw new ApiError("FORBIDDEN", "Modificar una tarea cerrada requiere permiso administrativo.");
  }
  private assertCommentOwner(authorId: string, actor: AuthenticatedActor) {
    if (authorId !== actor.user.id && !actor.user.permissions.includes("notes.moderate")) throw new ApiError("FORBIDDEN", "Sólo el autor puede modificar este comentario.");
  }
  private async mutable(task: TaskRow) {
    if (!task.caseId) return;
    const legalCase = await taskRepository.case(getPrisma(), task.caseId);
    if (legalCase?.status === "ARCHIVED") throw new ApiError("CONFLICT", "El expediente archivado es de sólo lectura.");
  }
  private async validateContext(db: DatabaseClient, caseId: string | null, subCaseId: string | null) {
    if (caseId) {
      const legalCase = await taskRepository.case(db, caseId);
      if (!legalCase) throw new ApiError("VALIDATION_ERROR", "Expediente inválido.");
      if (legalCase.status === "ARCHIVED") throw new ApiError("CONFLICT", "El expediente archivado es de sólo lectura.");
    }
    if (subCaseId) {
      const subcase = await taskRepository.subcase(db, subCaseId);
      if (!subcase || subcase.caseId !== caseId) throw new ApiError("VALIDATION_ERROR", "El cuaderno no pertenece al expediente.");
      if (subcase.status === "CLOSED") throw new ApiError("CONFLICT", "El cuaderno está cerrado.");
    }
  }
  private async validateUsers(db: DatabaseClient, ids: string[]) {
    if (await taskRepository.users(db, ids) !== ids.length) throw new ApiError("VALIDATION_ERROR", "Hay responsables inexistentes o inactivos.");
  }
  private assignedEvent(tx: Prisma.TransactionClient, taskId: string, userId: string) {
    return outboxService.publish(tx, { type: "TASK_ASSIGNED", aggregateType: "Task", aggregateId: taskId, payload: { taskId, userId } });
  }
  private async record(tx: Prisma.TransactionClient, actor: AuthenticatedActor, context: RequestContext, action: string, id: string, after: Prisma.InputJsonValue, publish = true) {
    await auditService.record(tx, { actorId: actor.user.id, action, entityType: "Task", entityId: id, after, ...metadata(context) });
    if (publish) await outboxService.publish(tx, { type: action, aggregateType: "Task", aggregateId: id, payload: { taskId: id } });
  }
}
export const taskService = new TaskService();

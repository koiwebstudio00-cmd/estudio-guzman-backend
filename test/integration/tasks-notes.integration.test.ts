import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../../src/app.js";
import { disconnectDatabase } from "../../src/database/prisma.js";
import { passwordService } from "../../src/modules/auth/password.service.js";
import { createSyntheticCase } from "../fixtures/cases.js";
import { resetTestDatabase, testPrisma } from "../helpers/database.js";

const ORIGIN = "http://localhost:3000";
const PASSWORD = "ClaveSegura123";
const managerPermissions = ["tasks.read", "tasks.create", "tasks.update", "tasks.change_status", "tasks.assign", "tasks.delete", "notes.read", "notes.create", "notes.moderate"];

async function auth(codes: string[], suffix: string) {
  const permissions = await Promise.all(codes.map((code) => testPrisma.permission.upsert({ where: { code }, update: {}, create: { code, description: code } })));
  const roleCode = `PHASE9_${suffix.toUpperCase().replaceAll("-", "_")}`;
  const role = await testPrisma.role.create({ data: { code: roleCode, name: `Phase 9 ${suffix}`, permissions: { create: permissions.map(({ id }) => ({ permissionId: id })) } } });
  const user = await testPrisma.user.create({ data: { email: `${suffix}@example.com`, emailNormalized: `${suffix}@example.com`, name: suffix, passwordHash: await passwordService.hash(PASSWORD), roleId: role.id } });
  const response = await request(buildApp()).post("/api/v1/auth/login").set("Origin", ORIGIN).send({ email: user.email, password: PASSWORD });
  const cookies = response.headers["set-cookie"] as unknown as string[];
  return { user, cookie: cookies[0]!.split(";")[0]!, csrf: response.body.data.csrfToken as string };
}
const headers = (value: { cookie: string; csrf: string }) => ({ Origin: ORIGIN, Cookie: value.cookie, "x-csrf-token": value.csrf });

beforeEach(resetTestDatabase);
afterAll(async () => { await testPrisma.$disconnect(); await disconnectDatabase(); });

describe("tasks, transitions and notes", () => {
  it("creates a contextual task with multiple assignees, history, audit and outbox", async () => {
    const manager = await auth(managerPermissions, "manager-create");
    const colleague = await auth(["tasks.read"], "colleague-create");
    const legalCase = await createSyntheticCase(testPrisma, manager.user);
    const response = await request(buildApp()).post("/api/v1/tasks").set(headers(manager)).send({
      title: "Preparar contestación", priority: "HIGH", dueDate: "2026-09-25", caseId: legalCase.id,
      assigneeIds: [manager.user.id, colleague.user.id],
    });
    expect(response.status).toBe(201);
    expect(response.body.data.assignees.map((user: { id: string }) => user.id).sort()).toEqual([manager.user.id, colleague.user.id].sort());
    expect(response.body.data.history[0]).toMatchObject({ fromStatus: null, toStatus: "PENDING" });
    expect(response.body.data.dueDate).toBe("2026-09-25T00:00:00.000Z");
    expect(await testPrisma.auditLog.count({ where: { action: "TASK_CREATED" } })).toBe(1);
    expect(await testPrisma.outboxEvent.count({ where: { type: "TASK_ASSIGNED" } })).toBe(2);
  });

  it("enforces transitions, reasons and optimistic concurrency while keeping history", async () => {
    const manager = await auth(managerPermissions, "manager-transition");
    const created = await request(buildApp()).post("/api/v1/tasks").set(headers(manager)).send({ title: "Controlar plazo", assigneeIds: [manager.user.id] });
    const id = created.body.data.id as string;
    const completed = await request(buildApp()).post(`/api/v1/tasks/${id}/status-transitions`).set(headers(manager)).send({ version: 1, toStatus: "COMPLETED" });
    expect(completed.status).toBe(200);
    expect(completed.body.data).toMatchObject({ status: "COMPLETED", version: 2 });
    expect(completed.body.data.completedAt).not.toBeNull();
    expect((await request(buildApp()).post(`/api/v1/tasks/${id}/status-transitions`).set(headers(manager)).send({ version: 1, toStatus: "IN_PROGRESS", reason: "Reabrir" })).status).toBe(409);
    expect((await request(buildApp()).post(`/api/v1/tasks/${id}/status-transitions`).set(headers(manager)).send({ version: 2, toStatus: "IN_PROGRESS" })).status).toBe(400);
    const reopened = await request(buildApp()).post(`/api/v1/tasks/${id}/status-transitions`).set(headers(manager)).send({ version: 2, toStatus: "IN_PROGRESS", reason: "Se recibió nueva prueba" });
    expect(reopened.status).toBe(200);
    expect(reopened.body.data.completedAt).toBeNull();
    expect(reopened.body.data.history).toHaveLength(3);
    const cancelled = await request(buildApp()).post(`/api/v1/tasks/${id}/status-transitions`).set(headers(manager)).send({ version: 3, toStatus: "CANCELLED", reason: "Ya no corresponde" });
    expect(cancelled.status).toBe(200);
    expect((await request(buildApp()).post(`/api/v1/tasks/${id}/status-transitions`).set(headers(manager)).send({ version: 4, toStatus: "COMPLETED" })).status).toBe(409);
  });

  it("replaces active assignments and filters with a stable cursor and UTC dates", async () => {
    const manager = await auth(managerPermissions, "manager-list");
    const first = await auth(["tasks.read"], "first-list");
    const second = await auth(["tasks.read"], "second-list");
    const app = buildApp();
    const one = await request(app).post("/api/v1/tasks").set(headers(manager)).send({ title: "Vence hoy", priority: "URGENT", dueDate: "2026-09-19", assigneeIds: [first.user.id] });
    await request(app).post("/api/v1/tasks").set(headers(manager)).send({ title: "Vence mañana", priority: "LOW", dueDate: "2026-09-20", assigneeIds: [manager.user.id] });
    const reassigned = await request(app).post(`/api/v1/tasks/${one.body.data.id}/assignments`).set(headers(manager)).send({ userIds: [second.user.id] });
    expect(reassigned.status).toBe(200);
    expect(reassigned.body.data.assignees.map((user: { id: string }) => user.id)).toEqual([second.user.id]);
    expect(await testPrisma.taskAssignment.count({ where: { taskId: one.body.data.id } })).toBe(2);
    const filtered = await request(app).get(`/api/v1/tasks?assigneeId=${second.user.id}&dueFrom=2026-09-19&dueTo=2026-09-19&limit=1`).set("Cookie", manager.cookie);
    expect(filtered.status).toBe(200);
    expect(filtered.body.data).toHaveLength(1);
    expect(filtered.body.data[0]).toMatchObject({ title: "Vence hoy", dueDate: "2026-09-19T00:00:00.000Z" });
    const page = await request(app).get("/api/v1/tasks?limit=1").set("Cookie", manager.cookie);
    expect(page.body.meta.nextCursor).toBeTypeOf("string");
    const next = await request(app).get(`/api/v1/tasks?limit=1&cursor=${encodeURIComponent(page.body.meta.nextCursor)}`).set("Cookie", manager.cookie);
    expect(next.body.data[0].id).not.toBe(page.body.data[0].id);
  });

  it("allows comment ownership and moderator overrides", async () => {
    const manager = await auth(managerPermissions, "manager-comments");
    const author = await auth(["tasks.read", "tasks.update"], "author-comments");
    const stranger = await auth(["tasks.read", "tasks.update"], "stranger-comments");
    const created = await request(buildApp()).post("/api/v1/tasks").set(headers(manager)).send({ title: "Comentar expediente", assigneeIds: [author.user.id] });
    const comment = await request(buildApp()).post(`/api/v1/tasks/${created.body.data.id}/comments`).set(headers(author)).send({ content: "Primer comentario" });
    expect(comment.status).toBe(201);
    expect((await request(buildApp()).patch(`/api/v1/tasks/${created.body.data.id}/comments/${comment.body.data.id}`).set(headers(stranger)).send({ version: 1, content: "No autorizado" })).status).toBe(403);
    const moderated = await request(buildApp()).patch(`/api/v1/tasks/${created.body.data.id}/comments/${comment.body.data.id}`).set(headers(manager)).send({ version: 1, content: "Contenido moderado" });
    expect(moderated.status).toBe(200);
    expect(moderated.body.data).toMatchObject({ content: "Contenido moderado", version: 2 });
  });

  it("creates immutable notes for case, subcase and contact and blocks archived cases", async () => {
    const manager = await auth(managerPermissions, "manager-notes");
    const legalCase = await createSyntheticCase(testPrisma, manager.user);
    const subcase = await testPrisma.subCase.create({ data: { caseId: legalCase.id, type: "INCIDENT", title: "Incidente", createdById: manager.user.id } });
    const contact = await testPrisma.contact.create({ data: { kind: "PERSON", displayName: "Cliente nota", displayNameNormalized: "cliente nota", firstName: "Cliente", createdById: manager.user.id } });
    const app = buildApp();
    const subcaseNote = await request(app).post("/api/v1/notes").set(headers(manager)).send({ content: "Nota del cuaderno", subCaseId: subcase.id });
    expect(subcaseNote.status).toBe(201);
    expect(subcaseNote.body.data).toMatchObject({ caseId: legalCase.id, subCaseId: subcase.id, content: "Nota del cuaderno" });
    expect(subcaseNote.body.data).not.toHaveProperty("authorId");
    await request(app).post("/api/v1/notes").set(headers(manager)).send({ content: "Nota del contacto", contactId: contact.id }).expect(201);
    const list = await request(app).get(`/api/v1/notes?subCaseId=${subcase.id}&limit=1`).set("Cookie", manager.cookie);
    expect(list.body.data).toHaveLength(1);
    await testPrisma.legalCase.update({ where: { id: legalCase.id }, data: { status: "ARCHIVED", closedOn: new Date("2026-09-18T00:00:00.000Z"), archivedOn: new Date("2026-09-19T00:00:00.000Z") } });
    expect((await request(app).post("/api/v1/notes").set(headers(manager)).send({ content: "No permitida", caseId: legalCase.id })).status).toBe(409);
    expect(await testPrisma.auditLog.count({ where: { action: "NOTE_CREATED" } })).toBe(2);
  });
});

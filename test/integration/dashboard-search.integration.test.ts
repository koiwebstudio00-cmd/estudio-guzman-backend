import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../../src/app.js";
import { disconnectDatabase } from "../../src/database/prisma.js";
import { passwordService } from "../../src/modules/auth/password.service.js";
import { normalizeSearch } from "../../src/shared/validation/normalize.js";
import { resetTestDatabase, testPrisma } from "../helpers/database.js";

const ORIGIN = "http://localhost:3000"; const PASSWORD = "ClaveSegura123";
async function auth(codes: string[], suffix: string) { const permissions = await Promise.all(codes.map((code) => testPrisma.permission.upsert({ where: { code }, update: {}, create: { code, description: code } }))); const role = await testPrisma.role.create({ data: { code: `DASH_${suffix.toUpperCase()}`, name: suffix, permissions: { create: permissions.map(({ id }) => ({ permissionId: id })) } } }); const user = await testPrisma.user.create({ data: { email: `${suffix}@example.com`, emailNormalized: `${suffix}@example.com`, name: suffix, passwordHash: await passwordService.hash(PASSWORD), roleId: role.id } }); const response = await request(buildApp()).post("/api/v1/auth/login").set("Origin", ORIGIN).send({ email: user.email, password: PASSWORD }); const cookies = response.headers["set-cookie"] as unknown as string[]; return { user, cookie: cookies[0]!.split(";")[0]! }; }
const day = (offset: number) => { const now = new Date(); return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + offset)); };
beforeEach(resetTestDatabase); afterAll(async () => { await testPrisma.$disconnect(); await disconnectDatabase(); });

describe("dashboard, global search and team metrics", () => {
  it("returns known aggregates, personal tasks and permission-scoped activity", async () => {
    const mine = await auth(["dashboard.read", "cases.read", "tasks.read", "contacts.read"], "ownactivity"); const other = await auth(["dashboard.read"], "otheractivity");
    await testPrisma.legalCase.createMany({ data: [{ caseNumber: "A-1", caseNumberNormalized: "A1", title: "Activo", type: "OTHER", status: "ACTIVE", startDate: day(-20), createdById: mine.user.id }, { caseNumber: "C-1", caseNumberNormalized: "C1", title: "Cerrado", type: "OTHER", status: "CLOSED", startDate: day(-30), closedOn: day(-1), createdById: mine.user.id }] });
    const contact = await testPrisma.contact.create({ data: { kind: "PERSON", displayName: "Cliente Uno", displayNameNormalized: "cliente uno", firstName: "Cliente", createdById: mine.user.id, categories: { create: { type: "CLIENT" } } } });
    expect(contact.id).toBeTruthy();
    const overdue = await testPrisma.task.create({ data: { title: "Vencida", dueDate: day(-1), createdById: mine.user.id, assignments: { create: { userId: mine.user.id, assignedById: mine.user.id } } } });
    await testPrisma.task.create({ data: { title: "Hoy", dueDate: day(0), createdById: other.user.id, assignments: { create: { userId: other.user.id, assignedById: other.user.id } } } });
    await testPrisma.auditLog.createMany({ data: [{ actorId: mine.user.id, action: "MINE", entityType: "Task", entityId: overdue.id }, { actorId: other.user.id, action: "OTHER", entityType: "Task" }] });
    const response = await request(buildApp()).get("/api/v1/dashboard").set("Cookie", mine.cookie);
    expect(response.status).toBe(200); expect(response.body.data.kpis).toEqual({ activeCases: 1, openTasks: 2, overdueTasks: 1, dueToday: 1, activeClients: 1 });
    expect(response.body.data.myTasks.map((task: { title: string }) => task.title)).toEqual(["Vencida"]);
    const actions = response.body.data.activity.map((item: { action: string }) => item.action); expect(actions).toContain("MINE"); expect(actions).not.toContain("OTHER");
    expect(response.body.data.activity[0].id).toBeTypeOf("string");
  });

  it("requires dashboard and metrics permissions independently", async () => {
    const none = await auth([], "nopermissions"); const dashboard = await auth(["dashboard.read"], "dashboardonly");
    expect((await request(buildApp()).get("/api/v1/dashboard").set("Cookie", none.cookie)).status).toBe(403);
    const scoped = await request(buildApp()).get("/api/v1/dashboard").set("Cookie", dashboard.cookie); expect(scoped.body.data.kpis).toEqual({ activeCases: null, openTasks: null, overdueTasks: null, dueToday: null, activeClients: null }); expect(scoped.body.data.myTasks).toEqual([]);
    expect((await request(buildApp()).get("/api/v1/team/metrics").set("Cookie", dashboard.cookie)).status).toBe(403);
  });

  it("calculates team metrics consistently inside the requested UTC range", async () => {
    const manager = await auth(["team_metrics.read"], "metrics"); const member = await auth([], "metricmember");
    await testPrisma.task.create({ data: { title: "Terminada", status: "COMPLETED", completedAt: new Date("2026-09-10T15:00:00.000Z"), createdById: manager.user.id, assignments: { create: { userId: member.user.id, assignedById: manager.user.id } } } });
    await testPrisma.task.create({ data: { title: "Pendiente vencida", dueDate: day(-2), createdById: manager.user.id, assignments: { create: { userId: member.user.id, assignedById: manager.user.id } } } });
    const response = await request(buildApp()).get("/api/v1/team/metrics?from=2026-09-01&to=2026-09-30").set("Cookie", manager.cookie);
    expect(response.status).toBe(200); const metric = response.body.data.find((item: { userId: string }) => item.userId === member.user.id); expect(metric).toMatchObject({ assigned: 2, completed: 1, overdue: 1, primaryCases: 0 });
    expect((await request(buildApp()).get("/api/v1/team/metrics?from=2025-01-01&to=2026-09-30").set("Cookie", manager.cookie)).status).toBe(400);
  });

  it("searches accents, case numbers and partial terms while isolating unauthorized types", async () => {
    const creator = await auth(["cases.read", "contacts.read", "actions.read"], "searchfull"); const limited = await auth(["cases.read", "actions.read"], "searchlimited");
    const legalCase = await testPrisma.legalCase.create({ data: { caseNumber: "EXP-55/2026", caseNumberNormalized: "EXP552026", title: "Sucesión Núñez", type: "CIVIL_COMMERCIAL", status: "ACTIVE", startDate: day(-1), createdById: creator.user.id } });
    await testPrisma.contact.create({ data: { kind: "PERSON", displayName: "José Álvarez", displayNameNormalized: normalizeSearch("José Álvarez"), firstName: "José", createdById: creator.user.id } });
    await testPrisma.caseAction.create({ data: { caseId: legalCase.id, title: "Contestación con documentación", type: "FILING", documentAt: new Date(), uploadedById: creator.user.id } });
    const app = buildApp();
    const caseResult = await request(app).get("/api/v1/search?q=sucesion%20nunez&types=CASE").set("Cookie", creator.cookie); expect(caseResult.status).toBe(200); expect(caseResult.body.data[0]).toMatchObject({ type: "CASE", title: "Sucesión Núñez" });
    expect((await request(app).get("/api/v1/search?q=EXP5520&types=CASE").set("Cookie", creator.cookie)).body.data[0].id).toBe(legalCase.id);
    expect((await request(app).get("/api/v1/search?q=jose%20alvarez&types=CONTACT").set("Cookie", creator.cookie)).body.data[0].title).toBe("José Álvarez");
    expect((await request(app).get("/api/v1/search?q=documenta&types=ACTION").set("Cookie", creator.cookie)).body.data[0].type).toBe("ACTION");
    expect((await request(app).get("/api/v1/search?q=jose&types=CONTACT").set("Cookie", limited.cookie)).body.data).toEqual([]);
    expect((await request(app).get("/api/v1/search?q=").set("Cookie", creator.cookie)).body.data).toEqual([]);
    expect((await request(app).get("/api/v1/search?q=test&limit=51").set("Cookie", creator.cookie)).status).toBe(400);
  });
});

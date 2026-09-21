import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../../src/app.js";
import { disconnectDatabase } from "../../src/database/prisma.js";
import { passwordService } from "../../src/modules/auth/password.service.js";
import { resetTestDatabase, testPrisma } from "../helpers/database.js";

const ORIGIN = "http://localhost:3000"; const PASSWORD = "ClaveSegura123";
const permissions = ["cases.read", "cases.create", "cases.update", "cases.change_status", "cases.assign", "cases.archive", "cases.delete", "participants.manage"];

async function roleWith(codes: string[]) { const items = await Promise.all(codes.map((code) => testPrisma.permission.create({ data: { code, description: code } }))); return testPrisma.role.create({ data: { code: `ROLE_${codes.length}`, name: "Cases", permissions: { create: items.map(({ id }) => ({ permissionId: id })) } } }); }
async function user(email: string, roleId: string) { return testPrisma.user.create({ data: { email, emailNormalized: email, name: email.split("@")[0]!, passwordHash: await passwordService.hash(PASSWORD), roleId } }); }
async function auth(codes = permissions) { const role = await roleWith(codes); const actor = await user("cases@example.com", role.id); const response = await request(buildApp()).post("/api/v1/auth/login").set("Origin", ORIGIN).send({ email: actor.email, password: PASSWORD }); const cookies = response.headers["set-cookie"] as unknown as string[]; return { user: actor, cookie: cookies[0]!.split(";")[0]!, csrf: response.body.data.csrfToken as string }; }
const headers = (value: { cookie: string; csrf: string }) => ({ Origin: ORIGIN, Cookie: value.cookie, "x-csrf-token": value.csrf });
async function contact(createdById: string, name: string) { return testPrisma.contact.create({ data: { kind: "PERSON", displayName: name, displayNameNormalized: name.toLowerCase(), firstName: name, createdById, categories: { create: { type: "CLIENT" } } } }); }
const payload = (contactId: string, responsibleId: string, overrides: Record<string, unknown> = {}) => ({ caseNumber: "123/2026", title: "Pérez c/ Empresa", type: "LABOR", status: "ACTIVE", startDate: "2026-01-10", participants: [{ contactId, role: "CLAIMANT", side: "OUR_SIDE", isClient: true }], representations: [], team: [{ userId: responsibleId, role: "PRIMARY" }], ...overrides });

beforeEach(async () => resetTestDatabase());
afterAll(async () => { await testPrisma.$disconnect(); await disconnectDatabase(); });

describe("legal cases", () => {
  it("enforces authentication and atomic creation with valid references", async () => {
    const app = buildApp(); expect((await request(app).get("/api/v1/cases")).status).toBe(401);
    const logged = await auth(); const person = await contact(logged.user.id, "Cliente");
    const invalid = await request(app).post("/api/v1/cases").set(headers(logged)).send(payload("1b16480d-2608-44af-9e7e-c9b1a868d77b", logged.user.id));
    expect(invalid.status).toBe(400); expect(await testPrisma.legalCase.count()).toBe(0);
    const created = await request(app).post("/api/v1/cases").set(headers(logged)).send(payload(person.id, logged.user.id));
    expect(created.status).toBe(201); expect(created.body.data.participants).toHaveLength(1); expect(created.body.data.team[0].role).toBe("PRIMARY");
    expect((await request(app).delete(`/api/v1/cases/${created.body.data.id}/participants/${created.body.data.participants[0].id}`).set(headers(logged))).status).toBe(409);
    expect(await testPrisma.caseStatusHistory.count()).toBe(1); expect(await testPrisma.auditLog.count({ where: { action: "CASE_CREATED" } })).toBe(1); expect(await testPrisma.outboxEvent.count({ where: { type: "CASE_CREATED" } })).toBe(1);
  });

  it("requires one principal and applies approved case-number uniqueness", async () => {
    const logged = await auth(); const person = await contact(logged.user.id, "Cliente"); const app = buildApp();
    const missingPrimary = await request(app).post("/api/v1/cases").set(headers(logged)).send(payload(person.id, logged.user.id, { team: [{ userId: logged.user.id, role: "COLLABORATOR" }] }));
    expect(missingPrimary.status).toBe(400);
    expect((await request(app).post("/api/v1/cases").set(headers(logged)).send(payload(person.id, logged.user.id))).status).toBe(201);
    expect((await request(app).post("/api/v1/cases").set(headers(logged)).send(payload(person.id, logged.user.id, { caseNumber: "123 - 2026" }))).status).toBe(409);
  });

  it("validates transitions, reason, permissions, history and optimistic locking", async () => {
    const logged = await auth(); const person = await contact(logged.user.id, "Cliente"); const app = buildApp();
    const created = await request(app).post("/api/v1/cases").set(headers(logged)).send(payload(person.id, logged.user.id)); const id = created.body.data.id as string;
    expect((await request(app).post(`/api/v1/cases/${id}/status-transitions`).set(headers(logged)).send({ version: 1, toStatus: "ARCHIVED" })).status).toBe(409);
    expect((await request(app).post(`/api/v1/cases/${id}/status-transitions`).set(headers(logged)).send({ version: 1, toStatus: "SUSPENDED" })).status).toBe(400);
    const changed = await request(app).post(`/api/v1/cases/${id}/status-transitions`).set(headers(logged)).send({ version: 1, toStatus: "SUSPENDED", reason: "Medida judicial" });
    expect(changed.status).toBe(200); expect(changed.body.data.version).toBe(2);
    expect((await request(app).post(`/api/v1/cases/${id}/status-transitions`).set(headers(logged)).send({ version: 1, toStatus: "ACTIVE", reason: "Reanudación" })).status).toBe(409);
    const history = await request(app).get(`/api/v1/cases/${id}/status-history`).set("Cookie", logged.cookie);
    expect(history.body.data).toHaveLength(2); expect(history.body.data[0].toStatus).toBe("SUSPENDED");
  });

  it("filters, searches and paginates with a stable cursor", async () => {
    const logged = await auth(); const person = await contact(logged.user.id, "Cliente"); const app = buildApp();
    for (const [number, title, type] of [["A-1", "Alfa laboral", "LABOR"], ["B-2", "Beta civil", "CIVIL_COMMERCIAL"], ["C-3", "Gamma laboral", "LABOR"]] as const) expect((await request(app).post("/api/v1/cases").set(headers(logged)).send(payload(person.id, logged.user.id, { caseNumber: number, title, type }))).status).toBe(201);
    const search = await request(app).get("/api/v1/cases?q=BETA&type=CIVIL_COMMERCIAL").set("Cookie", logged.cookie); expect(search.body.data).toHaveLength(1);
    const first = await request(app).get("/api/v1/cases?limit=2").set("Cookie", logged.cookie); const second = await request(app).get(`/api/v1/cases?limit=2&cursor=${encodeURIComponent(first.body.meta.nextCursor)}`).set("Cookie", logged.cookie);
    expect(first.body.data).toHaveLength(2); expect(second.body.data).toHaveLength(1); expect(new Set([...first.body.data, ...second.body.data].map((item: { id: string }) => item.id)).size).toBe(3);
  });

  it("applies the limited lawyer assignment rule", async () => {
    const logged = await auth(["cases.read", "cases.create", "cases.assign"]); const person = await contact(logged.user.id, "Cliente"); const sameRole = await testPrisma.role.findUniqueOrThrow({ where: { id: logged.user.roleId } }); const other = await user("other@example.com", sameRole.id); const app = buildApp();
    expect((await request(app).post("/api/v1/cases").set(headers(logged)).send(payload(person.id, other.id))).status).toBe(403);
    const created = await request(app).post("/api/v1/cases").set(headers(logged)).send(payload(person.id, logged.user.id)); const id = created.body.data.id as string;
    expect((await request(app).post(`/api/v1/cases/${id}/team`).set(headers(logged)).send({ userId: other.id, role: "COLLABORATOR" })).status).toBe(403);
  });

  it("blocks deletion once related activity exists", async () => {
    const logged = await auth(); const person = await contact(logged.user.id, "Cliente"); const app = buildApp(); const created = await request(app).post("/api/v1/cases").set(headers(logged)).send(payload(person.id, logged.user.id)); const id = created.body.data.id as string;
    await testPrisma.task.create({ data: { title: "Actividad", caseId: id, createdById: logged.user.id } });
    expect((await request(app).delete(`/api/v1/cases/${id}`).set(headers(logged))).status).toBe(409);
  });
});

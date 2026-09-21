import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../../src/app.js";
import { disconnectDatabase } from "../../src/database/prisma.js";
import { passwordService } from "../../src/modules/auth/password.service.js";
import { createSyntheticCase } from "../fixtures/cases.js";
import { resetTestDatabase, testPrisma } from "../helpers/database.js";

const ORIGIN = "http://localhost:3000";
const PASSWORD = "ClaveSegura123";
const allPermissions = ["contacts.read", "contacts.create", "contacts.update", "contacts.delete", "catalogs.read", "catalogs.manage"];

async function authenticated(permissionCodes = allPermissions) {
  const permissions = await Promise.all(permissionCodes.map((code) => testPrisma.permission.create({ data: { code, description: code } })));
  const role = await testPrisma.role.create({ data: { code: "PHASE5", name: "Phase 5", permissions: { create: permissions.map(({ id }) => ({ permissionId: id })) } } });
  const user = await testPrisma.user.create({ data: { email: "phase5@example.com", emailNormalized: "phase5@example.com", name: "Phase Five", passwordHash: await passwordService.hash(PASSWORD), roleId: role.id } });
  const response = await request(buildApp()).post("/api/v1/auth/login").set("Origin", ORIGIN).send({ email: user.email, password: PASSWORD });
  expect(response.status).toBe(200);
  const cookies = response.headers["set-cookie"] as unknown as string[];
  return { user, cookie: cookies[0]!.split(";")[0]!, csrf: response.body.data.csrfToken as string };
}

function mutation(auth: { cookie: string; csrf: string }) {
  return { Origin: ORIGIN, Cookie: auth.cookie, "x-csrf-token": auth.csrf };
}

const person = (firstName: string, extra: Record<string, unknown> = {}) => ({ kind: "PERSON", firstName, categories: ["CLIENT"], channels: [], addresses: [], ...extra });

beforeEach(async () => resetTestDatabase());
afterAll(async () => { await testPrisma.$disconnect(); await disconnectDatabase(); });

describe("contacts and catalogs", () => {
  it("enforces authentication and granular permissions", async () => {
    const app = buildApp();
    expect((await request(app).get("/api/v1/contacts")).status).toBe(401);
    const auth = await authenticated(["contacts.read"]);
    expect((await request(app).get("/api/v1/contacts").set("Cookie", auth.cookie)).status).toBe(200);
    expect((await request(app).post("/api/v1/contacts").set(mutation(auth)).send(person("Sin permiso"))).status).toBe(403);
    expect((await request(app).get("/api/v1/catalogs").set("Cookie", auth.cookie)).status).toBe(403);
  });

  it("creates people and organizations, validates their required names, and emits audit/outbox", async () => {
    const auth = await authenticated(); const app = buildApp();
    const created = await request(app).post("/api/v1/contacts").set(mutation(auth)).send(person("Ana", { lastName: "Pérez", documentNumber: "12.345.678", channels: [{ type: "EMAIL", value: "ANA@EXAMPLE.COM", isPrimary: true }] }));
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({ kind: "PERSON", displayName: "Ana Pérez", version: 1, categories: ["CLIENT"] });
    expect(created.body.data.channels[0]).not.toHaveProperty("valueNormalized");
    const organization = await request(app).post("/api/v1/contacts").set(mutation(auth)).send({ kind: "ORGANIZATION", legalName: "Empresa Norte", taxId: "30-12345678-9", categories: ["COMPANY"] });
    expect(organization.status).toBe(201);
    expect((await request(app).post("/api/v1/contacts").set(mutation(auth)).send({ kind: "PERSON", categories: ["CLIENT"] })).status).toBe(400);
    expect((await request(app).post("/api/v1/contacts").set(mutation(auth)).send({ kind: "ORGANIZATION", categories: ["COMPANY"] })).status).toBe(400);
    expect(await testPrisma.auditLog.count({ where: { action: "CONTACT_CREATED" } })).toBe(2);
    expect(await testPrisma.outboxEvent.count({ where: { type: "CONTACT_CREATED" } })).toBe(2);
  });

  it("rejects normalized document, tax-id and channel duplicates", async () => {
    const auth = await authenticated(); const app = buildApp();
    expect((await request(app).post("/api/v1/contacts").set(mutation(auth)).send(person("Uno", { documentNumber: "12.345.678", taxId: "20-12345678-1", channels: [{ type: "PHONE", value: "+54 381 555-0000" }] }))).status).toBe(201);
    expect((await request(app).post("/api/v1/contacts").set(mutation(auth)).send(person("Dos", { documentNumber: "12345678" }))).status).toBe(409);
    expect((await request(app).post("/api/v1/contacts").set(mutation(auth)).send(person("Tres", { taxId: "20123456781" }))).status).toBe(409);
    const base = await request(app).post("/api/v1/contacts").set(mutation(auth)).send(person("Canales"));
    const id = base.body.data.id as string;
    expect((await request(app).post(`/api/v1/contacts/${id}/channels`).set(mutation(auth)).send({ type: "PHONE", value: "+54 381 555-1111" })).status).toBe(201);
    expect((await request(app).post(`/api/v1/contacts/${id}/channels`).set(mutation(auth)).send({ type: "PHONE", value: "+543815551111" })).status).toBe(409);
  });

  it("switches the unique primary channel and address per type", async () => {
    const auth = await authenticated(); const app = buildApp();
    const contact = await request(app).post("/api/v1/contacts").set(mutation(auth)).send(person("Principal", { channels: [{ type: "EMAIL", value: "one@example.com", isPrimary: true }], addresses: [{ type: "HOME", line1: "Uno", isPrimary: true }] }));
    const id = contact.body.data.id as string;
    const channel = await request(app).post(`/api/v1/contacts/${id}/channels`).set(mutation(auth)).send({ type: "EMAIL", value: "two@example.com", isPrimary: true });
    const address = await request(app).post(`/api/v1/contacts/${id}/addresses`).set(mutation(auth)).send({ type: "HOME", line1: "Dos", isPrimary: true });
    expect(channel.status).toBe(201); expect(address.status).toBe(201);
    expect(await testPrisma.contactChannel.count({ where: { contactId: id, type: "EMAIL", isPrimary: true } })).toBe(1);
    expect(await testPrisma.contactAddress.count({ where: { contactId: id, type: "HOME", isPrimary: true } })).toBe(1);
  });

  it("searches without accents/case and paginates with a stable cursor", async () => {
    const auth = await authenticated(); const app = buildApp();
    for (const name of ["Álvarez", "Beta", "Zulu"]) expect((await request(app).post("/api/v1/contacts").set(mutation(auth)).send(person(name))).status).toBe(201);
    const found = await request(app).get("/api/v1/contacts?q=ALVAREZ").set("Cookie", auth.cookie);
    expect(found.body.data.map((item: { displayName: string }) => item.displayName)).toEqual(["Álvarez"]);
    const first = await request(app).get("/api/v1/contacts?limit=2").set("Cookie", auth.cookie);
    expect(first.body.data).toHaveLength(2); expect(first.body.meta.nextCursor).toBeTypeOf("string");
    const second = await request(app).get(`/api/v1/contacts?limit=2&cursor=${encodeURIComponent(first.body.meta.nextCursor)}`).set("Cookie", auth.cookie);
    expect(second.body.data).toHaveLength(1);
    expect(new Set([...first.body.data, ...second.body.data].map((item: { id: string }) => item.id)).size).toBe(3);
  });

  it("uses optimistic locking and blocks deletion when a case references the contact", async () => {
    const auth = await authenticated(); const app = buildApp();
    const created = await request(app).post("/api/v1/contacts").set(mutation(auth)).send(person("Versionada"));
    const id = created.body.data.id as string;
    expect((await request(app).patch(`/api/v1/contacts/${id}`).set(mutation(auth)).send({ version: 1, lastName: "Nueva" })).status).toBe(200);
    expect((await request(app).patch(`/api/v1/contacts/${id}`).set(mutation(auth)).send({ version: 1, lastName: "Vieja" })).status).toBe(409);
    const legalCase = await createSyntheticCase(testPrisma, auth.user);
    await testPrisma.caseParticipant.create({ data: { caseId: legalCase.id, contactId: id, role: "CLIENT", isClient: true } });
    expect((await request(app).delete(`/api/v1/contacts/${id}`).set(mutation(auth))).status).toBe(409);
  });

  it("returns localized enum catalogs and manages courts/offices transactionally", async () => {
    const auth = await authenticated(); const app = buildApp();
    const enums = await request(app).get("/api/v1/catalogs").set("Cookie", auth.cookie);
    expect(enums.status).toBe(200);
    expect(enums.body.data.caseTypes).toContainEqual({ value: "CIVIL_COMMERCIAL", label: "Civil y comercial" });
    const office = await request(app).post("/api/v1/management-offices").set(mutation(auth)).send({ name: "Oficina Única", courtIds: [] });
    expect(office.status).toBe(201);
    const court = await request(app).post("/api/v1/courts").set(mutation(auth)).send({ name: "Juzgado Álvarez", officeIds: [office.body.data.id] });
    expect(court.status).toBe(201);
    const search = await request(app).get("/api/v1/courts?q=ALVAREZ&active=true").set("Cookie", auth.cookie);
    expect(search.body.data).toHaveLength(1);
    expect(search.body.data[0].offices[0].name).toBe("Oficina Única");
    expect(JSON.stringify(search.body)).not.toContain("nameNormalized");
    expect(await testPrisma.auditLog.count({ where: { action: { in: ["COURT_CREATED", "MANAGEMENT_OFFICE_CREATED"] } } })).toBe(2);
    expect(await testPrisma.outboxEvent.count({ where: { type: { in: ["COURT_CREATED", "MANAGEMENT_OFFICE_CREATED"] } } })).toBe(2);
  });
});

import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../../src/app.js";
import { disconnectDatabase } from "../../src/database/prisma.js";
import { passwordService } from "../../src/modules/auth/password.service.js";
import { resetTestDatabase, testPrisma } from "../helpers/database.js";

const ORIGIN = "http://localhost:3000";
const PASSWORD = "ClaveSegura123";

async function createPermission(code: string) {
  return testPrisma.permission.create({ data: { code, description: `Permiso ${code}` } });
}

async function createRole(code: string, permissionCodes: string[]) {
  const permissions = [];
  for (const permissionCode of permissionCodes) {
    permissions.push(
      await testPrisma.permission.upsert({
        where: { code: permissionCode },
        create: { code: permissionCode, description: `Permiso ${permissionCode}` },
        update: {}
      })
    );
  }
  return testPrisma.role.create({
    data: {
      code,
      name: code,
      permissions: { create: permissions.map(({ id }) => ({ permissionId: id })) }
    }
  });
}

async function createUser(email: string, roleId: string) {
  return testPrisma.user.create({
    data: {
      email,
      emailNormalized: email,
      name: email.split("@")[0]!,
      passwordHash: await passwordService.hash(PASSWORD),
      roleId
    }
  });
}

async function login(email: string) {
  const response = await request(buildApp())
    .post("/api/v1/auth/login")
    .set("Origin", ORIGIN)
    .send({ email, password: PASSWORD });
  expect(response.status).toBe(200);
  const setCookie = response.headers["set-cookie"] as unknown as string[];
  return {
    cookie: setCookie[0]!.split(";")[0]!,
    csrf: response.body.data.csrfToken as string
  };
}

beforeEach(async () => resetTestDatabase());
afterAll(async () => {
  await testPrisma.$disconnect();
  await disconnectDatabase();
});

describe("users and RBAC", () => {
  it("enforces unauthenticated, missing-permission and allowed cases", async () => {
    const emptyRole = await createRole("EMPTY", []);
    const readerRole = await createRole("READER", ["users.read", "roles.read"]);
    await createUser("empty@example.com", emptyRole.id);
    await createUser("reader@example.com", readerRole.id);
    const app = buildApp();

    expect((await request(app).get("/api/v1/users")).status).toBe(401);
    const empty = await login("empty@example.com");
    expect((await request(app).get("/api/v1/users").set("Cookie", empty.cookie)).status).toBe(403);
    const reader = await login("reader@example.com");
    const allowed = await request(app).get("/api/v1/users").set("Cookie", reader.cookie);
    expect(allowed.status).toBe(200);
    expect(allowed.body.data).toHaveLength(2);
    expect(JSON.stringify(allowed.body)).not.toMatch(/passwordHash|tokenHash|csrfSecretHash/);
  });

  it("creates a user with an administrator-defined password without exposing credentials", async () => {
    const adminRole = await createRole("ADMIN", [
      "users.read",
      "users.manage",
      "roles.read",
      "roles.manage"
    ]);
    const lawyerRole = await createRole("LAWYER", ["users.read", "roles.read"]);
    await createUser("admin@example.com", adminRole.id);
    const auth = await login("admin@example.com");

    const response = await request(buildApp())
      .post("/api/v1/users")
      .set("Origin", ORIGIN)
      .set("Cookie", auth.cookie)
      .set("x-csrf-token", auth.csrf)
      .send({ email: "new@example.com", name: "Nueva Persona", roleId: lawyerRole.id, password: PASSWORD });

    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({
      email: "new@example.com",
      status: "ACTIVE",
      role: { code: "LAWYER" }
    });
    expect(JSON.stringify(response.body)).not.toMatch(/passwordHash|tokenHash|csrfSecretHash/);
    expect((await login("new@example.com")).cookie).toContain("eg_session=");
    expect(await testPrisma.passwordResetToken.count()).toBe(0);
    expect(await testPrisma.auditLog.count({ where: { action: "USER_CREATED" } })).toBe(1);
    const event = await testPrisma.outboxEvent.findFirstOrThrow({ where: { type: "USER_CREATED" } });
    expect(JSON.stringify(event.payload)).not.toContain("ClaveSegura");
  });

  it("requires roles.manage when assigning a role", async () => {
    const managerRole = await createRole("MANAGER", ["users.manage"]);
    const targetRole = await createRole("TARGET", []);
    await createUser("manager@example.com", managerRole.id);
    const auth = await login("manager@example.com");
    const response = await request(buildApp())
      .post("/api/v1/users")
      .set("Origin", ORIGIN)
      .set("Cookie", auth.cookie)
      .set("x-csrf-token", auth.csrf)
      .send({ email: "new@example.com", name: "Nueva Persona", roleId: targetRole.id, password: PASSWORD });
    expect(response.status).toBe(403);
    expect(await testPrisma.user.count()).toBe(1);
  });

  it("prevents self-demotion and preserves the last effective administrator", async () => {
    const adminRole = await createRole("ADMIN", ["users.manage", "roles.manage"]);
    const managerRole = await createRole("MANAGER", ["users.manage"]);
    const admin = await createUser("admin@example.com", adminRole.id);
    await createUser("manager@example.com", managerRole.id);

    const adminAuth = await login("admin@example.com");
    const self = await request(buildApp())
      .patch(`/api/v1/users/${admin.id}`)
      .set("Origin", ORIGIN)
      .set("Cookie", adminAuth.cookie)
      .set("x-csrf-token", adminAuth.csrf)
      .send({ version: admin.version, status: "SUSPENDED" });
    expect(self.status).toBe(403);

    const managerAuth = await login("manager@example.com");
    const lastAdmin = await request(buildApp())
      .patch(`/api/v1/users/${admin.id}`)
      .set("Origin", ORIGIN)
      .set("Cookie", managerAuth.cookie)
      .set("x-csrf-token", managerAuth.csrf)
      .send({ version: admin.version, status: "SUSPENDED" });
    expect(lastAdmin.status).toBe(409);
  });

  it("revokes existing sessions immediately when a user's role changes", async () => {
    const adminRole = await createRole("ADMIN", [
      "users.manage",
      "roles.manage",
      "users.read"
    ]);
    const originalRole = await createRole("ORIGINAL", ["users.read"]);
    const nextRole = await createRole("NEXT", []);
    await createUser("admin@example.com", adminRole.id);
    const target = await createUser("target@example.com", originalRole.id);
    const adminAuth = await login("admin@example.com");
    const targetAuth = await login("target@example.com");

    const changed = await request(buildApp())
      .patch(`/api/v1/users/${target.id}`)
      .set("Origin", ORIGIN)
      .set("Cookie", adminAuth.cookie)
      .set("x-csrf-token", adminAuth.csrf)
      .send({ version: target.version, roleId: nextRole.id });
    expect(changed.status).toBe(200);
    expect(changed.body.data.role.code).toBe("NEXT");
    expect((await request(buildApp()).get("/api/v1/auth/me").set("Cookie", targetAuth.cookie)).status).toBe(401);
  });

  it("rejects changing the actor's own role permissions", async () => {
    const adminRole = await createRole("ADMIN", [
      "users.manage",
      "roles.manage",
      "roles.read"
    ]);
    await createPermission("users.read");
    await createUser("admin@example.com", adminRole.id);
    const auth = await login("admin@example.com");
    const response = await request(buildApp())
      .patch(`/api/v1/roles/${adminRole.id}/permissions`)
      .set("Origin", ORIGIN)
      .set("Cookie", auth.cookie)
      .set("x-csrf-token", auth.csrf)
      .send({ permissionCodes: ["users.read"] });
    expect(response.status).toBe(403);
  });

  it("replaces another role's permissions atomically and revokes affected sessions", async () => {
    const adminRole = await createRole("ADMIN", ["roles.manage", "roles.read"]);
    const staffRole = await createRole("STAFF", ["roles.read"]);
    await createPermission("users.read");
    await createUser("admin@example.com", adminRole.id);
    await createUser("staff@example.com", staffRole.id);
    const adminAuth = await login("admin@example.com");
    const staffAuth = await login("staff@example.com");

    const response = await request(buildApp())
      .patch(`/api/v1/roles/${staffRole.id}/permissions`)
      .set("Origin", ORIGIN)
      .set("Cookie", adminAuth.cookie)
      .set("x-csrf-token", adminAuth.csrf)
      .send({ permissionCodes: ["roles.read", "users.read"] });
    expect(response.status).toBe(200);
    expect(response.body.data.permissions.map(({ code }: { code: string }) => code)).toEqual([
      "roles.read",
      "users.read"
    ]);
    expect((await request(buildApp()).get("/api/v1/auth/me").set("Cookie", staffAuth.cookie)).status).toBe(401);
    expect(await testPrisma.auditLog.count({ where: { action: "ROLE_PERMISSIONS_REPLACED" } })).toBe(1);
    expect(await testPrisma.outboxEvent.count({ where: { type: "ROLE_PERMISSIONS_CHANGED" } })).toBe(1);
  });
});

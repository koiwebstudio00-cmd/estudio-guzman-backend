import { readFile } from "node:fs/promises";
import path from "node:path";
import argon2 from "argon2";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../../src/app.js";
import { config } from "../../src/config.js";
import { disconnectDatabase } from "../../src/database/prisma.js";
import { auditService } from "../../src/modules/audit/service.js";
import { AuthService } from "../../src/modules/auth/auth.service.js";
import { passwordService } from "../../src/modules/auth/password.service.js";
import { authRepository } from "../../src/modules/auth/repo.js";
import { sessionService } from "../../src/modules/auth/session.service.js";
import { tokenService } from "../../src/modules/auth/token.service.js";
import { OutboxService } from "../../src/modules/outbox/service.js";
import { LocalFilePasswordResetDelivery } from "../../src/shared/auth/password-reset-delivery.js";
import { resetTestDatabase, testPrisma } from "../helpers/database.js";

const ORIGIN = "http://localhost:3000";
const PASSWORD = "ClaveSegura123";

async function createAuthUser(options?: { legacyHash?: boolean }) {
  const permission = await testPrisma.permission.create({
    data: { code: "dashboard.read", description: "Test" }
  });
  const role = await testPrisma.role.create({
    data: {
      code: "HEAD",
      name: "Jefe",
      permissions: { create: { permissionId: permission.id } }
    }
  });
  const passwordHash = options?.legacyHash
    ? await argon2.hash(PASSWORD, {
        type: argon2.argon2id,
        memoryCost: 19_456,
        timeCost: 2,
        parallelism: 1
      })
    : await passwordService.hash(PASSWORD);

  return testPrisma.user.create({
    data: {
      email: "admin@estudioguzman.test",
      emailNormalized: "admin@estudioguzman.test",
      name: "Admin Test",
      passwordHash,
      roleId: role.id
    }
  });
}

function cookieValue(setCookie: string[] | undefined): string {
  const cookie = setCookie?.find((value) => value.startsWith(`${config.SESSION_COOKIE_NAME}=`));
  if (!cookie) throw new Error("No se recibió la cookie de sesión.");
  return cookie.split(";")[0]!;
}

beforeEach(async () => {
  await resetTestDatabase();
});

afterAll(async () => {
  await testPrisma.$disconnect();
  await disconnectDatabase();
});

describe("authentication HTTP flow", () => {
  it("logs in, persists only hashes, restores the user and revokes on logout", async () => {
    const user = await createAuthUser({ legacyHash: true });
    const app = buildApp();
    const login = await request(app)
      .post("/api/v1/auth/login")
      .set("Origin", ORIGIN)
      .send({ email: "ADMIN@estudioguzman.test", password: PASSWORD });

    expect(login.status).toBe(200);
    expect(login.body.data.user).toMatchObject({
      id: user.id,
      role: { code: "HEAD" },
      permissions: ["dashboard.read"]
    });
    const csrfToken = login.body.data.csrfToken as string;
    const setCookie = login.headers["set-cookie"] as unknown as string[];
    const cookie = cookieValue(setCookie);
    expect(setCookie[0]).toContain("HttpOnly");
    expect(setCookie[0]).toContain("SameSite=Lax");
    expect(setCookie[0]).toContain("Path=/api/v1");

    const rawSessionToken = cookie.split("=")[1]!;
    const storedSession = await testPrisma.session.findFirstOrThrow();
    expect(storedSession.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(storedSession.csrfSecretHash).toMatch(/^[0-9a-f]{64}$/);
    expect(storedSession.tokenHash).not.toBe(rawSessionToken);
    expect(storedSession.csrfSecretHash).not.toBe(csrfToken);
    const updatedUser = await testPrisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(updatedUser.passwordHash).not.toBe(user.passwordHash);
    expect(passwordService.needsRehash(updatedUser.passwordHash)).toBe(false);

    const me = await request(app).get("/api/v1/auth/me").set("Cookie", cookie);
    expect(me.status).toBe(200);
    expect(me.body.data.user.id).toBe(user.id);
    const restoredCsrf = await request(app).get("/api/v1/auth/csrf").set("Cookie", cookie);
    expect(restoredCsrf.status).toBe(200);
    expect(restoredCsrf.body.data.csrfToken).toBe(csrfToken);

    const rejectedLogout = await request(app)
      .post("/api/v1/auth/logout")
      .set("Origin", ORIGIN)
      .set("Cookie", cookie)
      .set("x-csrf-token", "incorrecto");
    expect(rejectedLogout.status).toBe(403);

    const logout = await request(app)
      .post("/api/v1/auth/logout")
      .set("Origin", ORIGIN)
      .set("Cookie", cookie)
      .set("x-csrf-token", csrfToken);
    expect(logout.status).toBe(204);
    expect(await testPrisma.session.count({ where: { revokedAt: { not: null } } })).toBe(1);
    expect((await request(app).get("/api/v1/auth/me").set("Cookie", cookie)).status).toBe(401);
    const auditDump = JSON.stringify(
      await testPrisma.auditLog.findMany({ orderBy: { createdAt: "asc" } }),
      (_key, value: unknown) => typeof value === "bigint" ? value.toString() : value
    );
    expect(auditDump).not.toContain(PASSWORD);
    expect(auditDump).not.toContain(rawSessionToken);
    expect(auditDump).not.toContain(csrfToken);
  });

  it("rejects invalid credentials generically and locks after the configured threshold", async () => {
    const user = await createAuthUser();
    const app = buildApp();

    for (let attempt = 0; attempt < config.LOGIN_MAX_ATTEMPTS; attempt += 1) {
      const response = await request(app)
        .post("/api/v1/auth/login")
        .set("Origin", ORIGIN)
        .send({ email: user.email, password: "ClaveIncorrecta123" });
      expect(response.status).toBe(401);
      expect(response.body.detail).toBe("Email o contraseña incorrectos.");
    }

    const lockedUser = await testPrisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(lockedUser.failedLoginCount).toBe(config.LOGIN_MAX_ATTEMPTS);
    expect(lockedUser.lockedUntil).toBeInstanceOf(Date);

    const lockedCorrectPassword = await request(app)
      .post("/api/v1/auth/login")
      .set("Origin", ORIGIN)
      .send({ email: user.email, password: PASSWORD });
    expect(lockedCorrectPassword.status).toBe(401);

    const missingUser = await request(buildApp())
      .post("/api/v1/auth/login")
      .set("Origin", ORIGIN)
      .send({ email: "missing@example.com", password: PASSWORD });
    expect(missingUser.status).toBe(401);
    expect(missingUser.body.detail).toBe("Email o contraseña incorrectos.");
  });

  it("requires an allowed origin and rate-limits repeated login requests", async () => {
    await createAuthUser();
    const forbidden = await request(buildApp())
      .post("/api/v1/auth/login")
      .set("Origin", "https://evil.example")
      .send({ email: "admin@estudioguzman.test", password: PASSWORD });
    expect(forbidden.status).toBe(403);

    const app = buildApp();
    let lastStatus = 0;
    for (let attempt = 0; attempt <= config.LOGIN_RATE_LIMIT_MAX; attempt += 1) {
      const response = await request(app)
        .post("/api/v1/auth/login")
        .set("Origin", ORIGIN)
        .send({ email: "missing@example.com", password: PASSWORD });
      lastStatus = response.status;
    }
    expect(lastStatus).toBe(429);
  });

  it("updates the own profile with optimistic locking", async () => {
    const user = await createAuthUser();
    const app = buildApp();
    const login = await request(app)
      .post("/api/v1/auth/login")
      .set("Origin", ORIGIN)
      .send({ email: user.email, password: PASSWORD });
    const cookie = cookieValue(login.headers["set-cookie"] as unknown as string[]);

    const updated = await request(app)
      .patch("/api/v1/auth/me")
      .set("Origin", ORIGIN)
      .set("Cookie", cookie)
      .set("x-csrf-token", login.body.data.csrfToken)
      .send({ version: login.body.data.user.version, name: "Perfil Actualizado", email: "perfil@example.com" });

    expect(updated.status).toBe(200);
    expect(updated.body.data.user).toMatchObject({
      id: user.id,
      version: user.version + 1,
      name: "Perfil Actualizado",
      email: "perfil@example.com"
    });
    expect(await testPrisma.auditLog.count({ where: { action: "USER_PROFILE_UPDATED" } })).toBe(1);

    const stale = await request(app)
      .patch("/api/v1/auth/me")
      .set("Origin", ORIGIN)
      .set("Cookie", cookie)
      .set("x-csrf-token", login.body.data.csrfToken)
      .send({ version: user.version, name: "Cambio obsoleto" });
    expect(stale.status).toBe(409);
  });

  it("changes the own password, requires the current one and revokes every session", async () => {
    const user = await createAuthUser();
    const app = buildApp();
    const login = await request(app)
      .post("/api/v1/auth/login")
      .set("Origin", ORIGIN)
      .send({ email: user.email, password: PASSWORD });
    const cookie = cookieValue(login.headers["set-cookie"] as unknown as string[]);
    const headers = {
      Origin: ORIGIN,
      Cookie: cookie,
      "x-csrf-token": login.body.data.csrfToken as string
    };

    const incorrect = await request(app)
      .post("/api/v1/auth/change-password")
      .set(headers)
      .send({ currentPassword: "Incorrecta123", newPassword: "NuevaClaveSegura456" });
    expect(incorrect.status).toBe(400);
    expect((await request(app).get("/api/v1/auth/me").set("Cookie", cookie)).status).toBe(200);

    const changed = await request(app)
      .post("/api/v1/auth/change-password")
      .set(headers)
      .send({ currentPassword: PASSWORD, newPassword: "NuevaClaveSegura456" });
    expect(changed.status).toBe(204);
    expect((await request(app).get("/api/v1/auth/me").set("Cookie", cookie)).status).toBe(401);
    expect(
      (await request(buildApp()).post("/api/v1/auth/login").set("Origin", ORIGIN).send({ email: user.email, password: "NuevaClaveSegura456" })).status
    ).toBe(200);
    expect(await testPrisma.auditLog.count({ where: { action: "AUTH_PASSWORD_CHANGED" } })).toBe(1);
  });
});

describe("sessions and password recovery", () => {
  it("rejects revoked, absolutely expired and inactive sessions", async () => {
    const user = await createAuthUser();
    const now = new Date();

    for (const state of ["revoked", "expired", "inactive"] as const) {
      const token = tokenService.generate();
      const createdAt =
        state === "expired"
          ? new Date(now.getTime() - 120_000)
          : state === "inactive"
            ? new Date(now.getTime() - (config.SESSION_IDLE_MINUTES + 1) * 60_000)
            : now;
      const session = await testPrisma.session.create({
        data: {
          userId: user.id,
          tokenHash: tokenService.hash(token),
          csrfSecretHash: tokenService.hash(tokenService.generate()),
          expiresAt:
            state === "expired" ? new Date(now.getTime() - 1_000) : new Date(now.getTime() + 60_000),
          lastSeenAt:
            state === "inactive"
              ? createdAt
              : now,
          createdAt,
          ...(state === "revoked" ? { revokedAt: now } : {})
        }
      });

      await expect(sessionService.authenticate(token, now)).rejects.toMatchObject({
        code: "UNAUTHORIZED"
      });
      const stored = await testPrisma.session.findUniqueOrThrow({ where: { id: session.id } });
      expect(stored.revokedAt).toBeInstanceOf(Date);
    }
  });

  it("returns the same forgot response, stores no raw token, resets once and revokes sessions", async () => {
    const user = await createAuthUser();
    const app = buildApp();
    const existing = await request(app)
      .post("/api/v1/auth/forgot-password")
      .set("Origin", ORIGIN)
      .send({ email: user.email });
    const missing = await request(buildApp())
      .post("/api/v1/auth/forgot-password")
      .set("Origin", ORIGIN)
      .send({ email: "missing@example.com" });

    expect(existing.status).toBe(202);
    expect(missing.status).toBe(202);
    expect(existing.body).toEqual(missing.body);

    const reset = await testPrisma.passwordResetToken.findFirstOrThrow();
    const artifact = JSON.parse(
      await readFile(
        path.join(config.STORAGE_ROOT, ".private", "password-resets", `${reset.id}.json`),
        "utf8"
      )
    ) as { token: string };
    expect(reset.tokenHash).toBe(tokenService.hash(artifact.token));
    expect(reset.tokenHash).not.toBe(artifact.token);
    const outbox = await testPrisma.outboxEvent.findFirstOrThrow();
    expect(JSON.stringify(outbox.payload)).not.toContain(artifact.token);

    const login = await request(buildApp())
      .post("/api/v1/auth/login")
      .set("Origin", ORIGIN)
      .send({ email: user.email, password: PASSWORD });
    expect(login.status).toBe(200);

    const newPassword = "NuevaClaveSegura456";
    const resetResponse = await request(buildApp())
      .post("/api/v1/auth/reset-password")
      .set("Origin", ORIGIN)
      .send({ token: artifact.token, password: newPassword });
    expect(resetResponse.status).toBe(204);
    expect(await testPrisma.session.count({ where: { revokedAt: { not: null } } })).toBe(1);
    const changedUser = await testPrisma.user.findUniqueOrThrow({ where: { id: user.id } });
    await expect(passwordService.verify(changedUser.passwordHash, newPassword)).resolves.toBe(true);

    const reused = await request(buildApp())
      .post("/api/v1/auth/reset-password")
      .set("Origin", ORIGIN)
      .send({ token: artifact.token, password: "OtraClaveSegura789" });
    expect(reused.status).toBe(400);
  });

  it("rolls back reset token, audit and outbox when the transaction fails", async () => {
    const user = await createAuthUser();
    class FailingOutboxService extends OutboxService {
      override publish(): never {
        throw new Error("synthetic outbox failure");
      }
    }
    const service = new AuthService(
      authRepository,
      passwordService,
      tokenService,
      sessionService,
      auditService,
      new FailingOutboxService(),
      new LocalFilePasswordResetDelivery()
    );

    await expect(
      service.forgotPassword(user.email, { requestId: "00000000-0000-4000-8000-000000000001" })
    ).rejects.toThrow("synthetic outbox failure");
    expect(await testPrisma.passwordResetToken.count()).toBe(0);
    expect(await testPrisma.auditLog.count()).toBe(0);
    expect(await testPrisma.outboxEvent.count()).toBe(0);
  });
});

import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../../src/app.js";
import { disconnectDatabase } from "../../src/database/prisma.js";
import { passwordService } from "../../src/modules/auth/password.service.js";
import { resetTestDatabase, testPrisma } from "../helpers/database.js";

const ORIGIN = "http://localhost:3000";
const PASSWORD = "ClaveSegura123";
const avatarUrl = (suffix: string) => `https://images.example.com/${suffix}.webp`;

async function auth(codes: string[], suffix: string) {
  const permissions = await Promise.all(
    codes.map((code) =>
      testPrisma.permission.upsert({
        where: { code },
        update: {},
        create: { code, description: code }
      })
    )
  );
  const role = await testPrisma.role.create({
    data: {
      code: `ACTIVITY_${suffix.toUpperCase()}`,
      name: suffix,
      permissions: {
        create: permissions.map(({ id }) => ({ permissionId: id }))
      }
    }
  });
  const user = await testPrisma.user.create({
    data: {
      email: `${suffix}@example.com`,
      emailNormalized: `${suffix}@example.com`,
      name: suffix,
      avatarUrl: avatarUrl(suffix),
      passwordHash: await passwordService.hash(PASSWORD),
      roleId: role.id
    }
  });
  const response = await request(buildApp())
    .post("/api/v1/auth/login")
    .set("Origin", ORIGIN)
    .send({ email: user.email, password: PASSWORD });
  const cookies = response.headers["set-cookie"] as unknown as string[];
  return { user, cookie: cookies[0]!.split(";")[0]! };
}

beforeEach(resetTestDatabase);
afterAll(async () => {
  await testPrisma.$disconnect();
  await disconnectDatabase();
});

describe("audit log and dashboard activity separation", () => {
  it("filters audit by entity, actor and an inclusive UTC date range", async () => {
    const admin = await auth(["audit.read"], "auditfilters");
    const denied = await auth([], "auditfiltersdenied");
    const entityId = randomUUID();
    const requestId = randomUUID();

    await testPrisma.auditLog.createMany({
      data: [
        {
          actorId: admin.user.id,
          action: "CASE_CREATED",
          entityType: "LegalCase",
          entityId,
          before: { status: "PENDING" },
          after: { status: "ACTIVE" },
          metadata: { source: "integration" },
          requestId,
          ipAddress: "127.0.0.1",
          userAgent: "Vitest",
          createdAt: new Date("2026-05-10T00:00:00.000Z")
        },
        {
          actorId: admin.user.id,
          action: "CASE_UPDATED",
          entityType: "LegalCase",
          entityId,
          createdAt: new Date("2026-05-10T23:59:59.999Z")
        },
        {
          actorId: admin.user.id,
          action: "CONTACT_CREATED",
          entityType: "Contact",
          entityId: randomUUID(),
          createdAt: new Date("2026-05-11T00:00:00.000Z")
        }
      ]
    });

    const app = buildApp();
    expect(
      (await request(app).get("/api/v1/audit-logs").set("Cookie", denied.cookie)).status
    ).toBe(403);

    const filtered = await request(app)
      .get(
        `/api/v1/audit-logs?entityType=LegalCase&actorId=${admin.user.id}&from=2026-05-10&to=2026-05-10`
      )
      .set("Cookie", admin.cookie);

    expect(filtered.status).toBe(200);
    expect(filtered.body.data.map((entry: { action: string }) => entry.action)).toEqual([
      "CASE_UPDATED",
      "CASE_CREATED"
    ]);
    expect(filtered.body.meta.nextCursor).toBeNull();
    expect(filtered.body.data[1]).toMatchObject({
      id: expect.any(String),
      action: "CASE_CREATED",
      entityType: "LegalCase",
      entityId,
      actor: {
        id: admin.user.id,
        name: admin.user.name,
        email: admin.user.email,
        avatarUrl: admin.user.avatarUrl
      },
      createdAt: "2026-05-10T00:00:00.000Z",
      before: { status: "PENDING" },
      after: { status: "ACTIVE" },
      metadata: { source: "integration" },
      requestId,
      ipAddress: "127.0.0.1",
      userAgent: "Vitest"
    });
  });

  it("paginates audit by cursor without duplicates and enforces the limit maximum", async () => {
    const admin = await auth(["audit.read"], "auditpagination");
    await testPrisma.auditLog.createMany({
      data: Array.from({ length: 5 }, (_, index) => ({
        actorId: admin.user.id,
        action: `PAGE_${index + 1}`,
        entityType: "PaginationProbe",
        createdAt: new Date(`2026-06-0${index + 1}T12:00:00.000Z`)
      }))
    });
    const app = buildApp();

    const first = await request(app)
      .get("/api/v1/audit-logs?entityType=PaginationProbe&limit=2")
      .set("Cookie", admin.cookie);
    const second = await request(app)
      .get(
        `/api/v1/audit-logs?entityType=PaginationProbe&limit=2&cursor=${first.body.meta.nextCursor}`
      )
      .set("Cookie", admin.cookie);
    const third = await request(app)
      .get(
        `/api/v1/audit-logs?entityType=PaginationProbe&limit=2&cursor=${second.body.meta.nextCursor}`
      )
      .set("Cookie", admin.cookie);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(third.status).toBe(200);
    expect(first.body.meta.nextCursor).toBeTypeOf("string");
    expect(second.body.meta.nextCursor).toBeTypeOf("string");
    expect(third.body.meta.nextCursor).toBeNull();

    const ids = [...first.body.data, ...second.body.data, ...third.body.data].map(
      (entry: { id: string }) => entry.id
    );
    expect(ids).toHaveLength(5);
    expect(new Set(ids).size).toBe(5);
    expect(
      (
        await request(app)
          .get("/api/v1/audit-logs?limit=101")
          .set("Cookie", admin.cookie)
      ).status
    ).toBe(400);
  });

  it("filters AUTH and USER actions before selecting the latest 10 relevant movements", async () => {
    const admin = await auth(["dashboard.read", "audit.read"], "activityadmin");
    const other = await auth(["dashboard.read"], "activityother");
    const relevant = [
      ["FEEDBACK_CREATED", "Feedback"],
      ["ROLE_PERMISSIONS_REPLACED", "Role"],
      ["COURT_CREATED", "Court"],
      ["NOTIFICATION_PREFERENCES_UPDATED", "NotificationPreference"],
      ["SUBCASE_CREATED", "SubCase"],
      ["NOTE_CREATED", "Note"],
      ["DOCUMENT_CREATED", "Document"],
      ["ACTION_CREATED", "CaseAction"],
      ["CASE_CREATED", "LegalCase"],
      ["TASK_UPDATED", "Task"],
      ["CONTACT_CREATED", "Contact"]
    ] as const;
    const base = new Date("2026-07-01T12:00:00.000Z").getTime();

    await testPrisma.auditLog.createMany({
      data: [
        ...relevant.map(([action, entityType], index) => ({
          actorId: index % 2 === 0 ? admin.user.id : other.user.id,
          action,
          entityType,
          createdAt: new Date(base + index * 1_000)
        })),
        ...Array.from({ length: 12 }, (_, index) => ({
          actorId: index % 2 === 0 ? admin.user.id : other.user.id,
          action: index % 2 === 0 ? `AUTH_NOISE_${index}` : `USER_NOISE_${index}`,
          entityType: index % 2 === 0 ? "Session" : "User",
          createdAt: new Date(base + (100 + index) * 1_000)
        }))
      ]
    });

    const response = await request(buildApp())
      .get("/api/v1/dashboard")
      .set("Cookie", admin.cookie);
    const actions = response.body.data.activity.map(
      (entry: { action: string }) => entry.action
    );

    expect(response.status).toBe(200);
    expect(actions).toHaveLength(10);
    expect(actions).toEqual(relevant.slice(1).map(([action]) => action).reverse());
    expect(actions).toEqual(
      expect.arrayContaining(["CASE_CREATED", "TASK_UPDATED", "CONTACT_CREATED"])
    );
    expect(actions.every((action: string) => !/^(AUTH_|USER_)/.test(action))).toBe(true);
    expect(response.body.data.activity).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actor: expect.objectContaining({ avatarUrl: admin.user.avatarUrl })
        }),
        expect.objectContaining({
          actor: expect.objectContaining({ avatarUrl: other.user.avatarUrl })
        })
      ])
    );
  });

  it("keeps dashboard activity scoped to the authenticated actor without audit.read", async () => {
    const mine = await auth(["dashboard.read"], "activitymine");
    const other = await auth(["dashboard.read"], "activityscopedother");
    await testPrisma.auditLog.createMany({
      data: [
        {
          actorId: mine.user.id,
          action: "CASE_CREATED",
          entityType: "LegalCase"
        },
        {
          actorId: other.user.id,
          action: "TASK_UPDATED",
          entityType: "Task"
        },
        {
          actorId: mine.user.id,
          action: "USER_UPDATED",
          entityType: "User"
        }
      ]
    });

    const response = await request(buildApp())
      .get("/api/v1/dashboard")
      .set("Cookie", mine.cookie);

    expect(response.status).toBe(200);
    expect(response.body.data.activity.map((entry: { action: string }) => entry.action)).toEqual([
      "CASE_CREATED"
    ]);
    expect(response.body.data.activity[0].actor.avatarUrl).toBe(mine.user.avatarUrl);
  });
});

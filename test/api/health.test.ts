import request from "supertest";
import { describe, expect, it } from "vitest";
import { buildApp } from "../../src/app.js";

describe("health and HTTP foundation", () => {
  const app = buildApp();

  it("returns liveness without touching external dependencies", async () => {
    const response = await request(app).get("/api/v1/health/live");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok" });
    expect(response.headers["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/i);
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.headers["content-security-policy"]).toContain("default-src 'self'");
    expect(response.headers["x-powered-by"]).toBeUndefined();
  });

  it("rejects malformed and oversized JSON with safe problem details", async () => {
    const malformed = await request(app).post("/api/v1/auth/login").set("Content-Type", "application/json").send('{"email":');
    expect(malformed.status).toBe(400); expect(malformed.body).toMatchObject({ title: "JSON inválido", status: 400 });
    const oversized = await request(app).post("/api/v1/auth/login").set("Content-Type", "application/json").send(JSON.stringify({ value: "a".repeat(1024 * 1024 + 1) }));
    expect(oversized.status).toBe(413); expect(oversized.body).toMatchObject({ title: "Payload demasiado grande", status: 413 }); expect(JSON.stringify(oversized.body)).not.toContain("a".repeat(100));
  });

  it("returns RFC 7807 for unknown routes", async () => {
    const response = await request(app).get("/api/v1/does-not-exist");

    expect(response.status).toBe(404);
    expect(response.headers["content-type"]).toContain("application/problem+json");
    expect(response.body).toMatchObject({
      title: "Recurso no encontrado",
      status: 404,
      instance: "/api/v1/does-not-exist"
    });
  });
});

import { describe, expect, it } from "vitest";
import { requireSafeTestDatabaseUrl } from "../helpers/database-url.js";

describe("requireSafeTestDatabaseUrl", () => {
  it("accepts an exclusive local test database", () => {
    expect(
      requireSafeTestDatabaseUrl(
        "postgresql://localhost:5432/estudio_guzman_test?schema=public",
        "postgresql://localhost:5432/estudio_guzman?schema=public"
      )
    ).toContain("estudio_guzman_test");
  });

  it.each([
    undefined,
    "postgresql://localhost:5432/postgres",
    "postgresql://localhost:5432/estudio_guzman",
    "mysql://localhost/estudio_guzman_test"
  ])("rejects unsafe test target %s", (value) => {
    expect(() =>
      requireSafeTestDatabaseUrl(
        value,
        "postgresql://localhost:5432/estudio_guzman?schema=public"
      )
    ).toThrow();
  });

  it("rejects the runtime database even if its name contains test", () => {
    const shared = "postgresql://localhost:5432/estudio_guzman_test?schema=public";
    expect(() => requireSafeTestDatabaseUrl(shared, shared)).toThrow(
      "DATABASE_URL_TEST debe ser distinta de DATABASE_URL."
    );
  });
});

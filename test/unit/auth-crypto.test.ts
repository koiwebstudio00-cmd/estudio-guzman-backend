import argon2 from "argon2";
import { describe, expect, it } from "vitest";
import { PasswordService } from "../../src/modules/auth/password.service.js";
import { TokenService } from "../../src/modules/auth/token.service.js";

describe("PasswordService", () => {
  const service = new PasswordService();

  it("hashes and verifies a password with Argon2id", async () => {
    const hash = await service.hash("UnaClaveSegura123");

    expect(hash).toContain("$argon2id$");
    await expect(service.verify(hash, "UnaClaveSegura123")).resolves.toBe(true);
    await expect(service.verify(hash, "incorrecta")).resolves.toBe(false);
    expect(service.needsRehash(hash)).toBe(false);
  });

  it("detects a valid hash that needs rehashing", async () => {
    const legacyHash = await argon2.hash("UnaClaveSegura123", {
      type: argon2.argon2id,
      memoryCost: 19_456,
      timeCost: 2,
      parallelism: 1
    });

    expect(service.needsRehash(legacyHash)).toBe(true);
  });
});

describe("TokenService", () => {
  const service = new TokenService();

  it("generates opaque random tokens and stores deterministic SHA-256 hashes", () => {
    const first = service.generate();
    const second = service.generate();

    expect(first).not.toBe(second);
    expect(service.hash(first)).toMatch(/^[0-9a-f]{64}$/);
    expect(service.matches(first, service.hash(first))).toBe(true);
    expect(service.matches(second, service.hash(first))).toBe(false);
    expect(service.deriveCsrf(first)).toBe(service.deriveCsrf(first));
    expect(service.deriveCsrf(first)).not.toBe(service.deriveCsrf(second));
  });
});

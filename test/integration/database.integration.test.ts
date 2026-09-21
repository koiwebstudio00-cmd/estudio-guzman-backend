import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createSyntheticCase } from "../fixtures/cases.js";
import { createSyntheticContact } from "../fixtures/contacts.js";
import { createSyntheticUser } from "../fixtures/users.js";
import { resetTestDatabase, testPrisma } from "../helpers/database.js";

describe("PostgreSQL integration harness", () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  afterAll(async () => {
    await testPrisma.$disconnect();
  });

  it("starts each test with isolated application tables", async () => {
    await expect(testPrisma.user.count()).resolves.toBe(0);
    await expect(testPrisma.legalCase.count()).resolves.toBe(0);
  });

  it("creates a synthetic aggregate without personal data", async () => {
    const user = await createSyntheticUser(testPrisma);
    const contact = await createSyntheticContact(testPrisma, user);
    const legalCase = await createSyntheticCase(testPrisma, user);

    expect(user.email.endsWith("@example.com")).toBe(true);
    expect(contact.displayName).toContain("Sintética");
    expect(legalCase.createdById).toBe(user.id);
  });

  it("enforces active case-number uniqueness without a court", async () => {
    const user = await createSyntheticUser(testPrisma);
    await createSyntheticCase(testPrisma, user, {
      caseNumberNormalized: "TEST-UNIQUE-1"
    });

    await expect(
      createSyntheticCase(testPrisma, user, {
        caseNumberNormalized: "TEST-UNIQUE-1"
      })
    ).rejects.toMatchObject({ code: "P2002" });
  });
});

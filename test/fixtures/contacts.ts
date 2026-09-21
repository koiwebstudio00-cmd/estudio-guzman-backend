import { randomUUID } from "node:crypto";
import type { PrismaClient, User } from "../../src/generated/prisma/client.js";

export async function createSyntheticContact(prisma: PrismaClient, createdBy: User) {
  const suffix = randomUUID().slice(0, 8);
  const displayName = `Persona Sintética ${suffix}`;

  return prisma.contact.create({
    data: {
      kind: "PERSON",
      firstName: "Persona",
      lastName: `Sintética ${suffix}`,
      displayName,
      displayNameNormalized: displayName.toLowerCase(),
      createdById: createdBy.id
    }
  });
}

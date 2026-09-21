import { randomUUID } from "node:crypto";
import type { PrismaClient, User } from "../../src/generated/prisma/client.js";

interface SyntheticCaseOptions {
  caseNumberNormalized?: string;
}

export async function createSyntheticCase(
  prisma: PrismaClient,
  createdBy: User,
  options: SyntheticCaseOptions = {}
) {
  const suffix = randomUUID().slice(0, 8).toUpperCase();
  const caseNumberNormalized = options.caseNumberNormalized ?? `TEST-${suffix}`;

  return prisma.legalCase.create({
    data: {
      caseNumber: caseNumberNormalized,
      caseNumberNormalized,
      title: `Expediente sintético ${suffix}`,
      type: "OTHER",
      status: "ACTIVE",
      startDate: new Date("2026-01-01T00:00:00.000Z"),
      createdById: createdBy.id
    }
  });
}

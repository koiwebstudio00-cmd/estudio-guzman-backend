import { randomUUID } from "node:crypto";
import type { PrismaClient } from "../../src/generated/prisma/client.js";

export async function createSyntheticUser(prisma: PrismaClient) {
  const suffix = randomUUID().replaceAll("-", "");
  const role = await prisma.role.create({
    data: {
      code: `TEST_${suffix.toUpperCase()}`,
      name: "Rol sintético de prueba",
      isSystem: false
    }
  });
  const email = `user-${suffix}@example.com`;

  return prisma.user.create({
    data: {
      email,
      emailNormalized: email,
      name: "Usuario Sintético",
      passwordHash: "synthetic-test-hash-not-valid-for-login",
      roleId: role.id
    }
  });
}

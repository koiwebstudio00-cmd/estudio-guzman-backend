import type { Prisma, PrismaClient } from "../../generated/prisma/client.js";
import type { DatabaseClient } from "../auth/repo.js";

export const userAuthorizationInclude = {
  role: {
    include: {
      permissions: { include: { permission: true } }
    }
  }
} satisfies Prisma.UserInclude;

export class UserRepository {
  list(
    database: PrismaClient,
    filters: { q?: string | undefined; status?: "ACTIVE" | "SUSPENDED" | "DISABLED" | undefined; roleId?: string | undefined }
  ) {
    return database.user.findMany({
      where: {
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.roleId ? { roleId: filters.roleId } : {}),
        ...(filters.q
          ? {
              OR: [
                { name: { contains: filters.q, mode: "insensitive" as const } },
                { email: { contains: filters.q, mode: "insensitive" as const } }
              ]
            }
          : {})
      },
      include: userAuthorizationInclude,
      orderBy: [{ status: "asc" }, { name: "asc" }]
    });
  }

  findById(database: DatabaseClient, id: string) {
    return database.user.findUnique({ where: { id }, include: userAuthorizationInclude });
  }

  findByEmail(database: DatabaseClient, emailNormalized: string) {
    return database.user.findUnique({ where: { emailNormalized } });
  }

  create(
    database: DatabaseClient,
    data: { email: string; emailNormalized: string; name: string; roleId: string; passwordHash: string }
  ) {
    return database.user.create({ data, include: userAuthorizationInclude });
  }

  async update(
    database: DatabaseClient,
    id: string,
    version: number,
    data: Prisma.UserUpdateManyMutationInput
  ) {
    const updated = await database.user.updateMany({
      where: { id, version },
      data: { ...data, version: { increment: 1 } }
    });
    if (updated.count !== 1) return null;
    return this.findById(database, id);
  }

  countEffectiveAdmins(database: DatabaseClient) {
    return database.user.count({
      where: {
        status: "ACTIVE",
        role: {
          AND: [
            { permissions: { some: { permission: { code: "users.manage" } } } },
            { permissions: { some: { permission: { code: "roles.manage" } } } }
          ]
        }
      }
    });
  }

  countActiveEffectiveAdminsInRole(database: DatabaseClient, roleId: string) {
    return database.user.count({
      where: {
        status: "ACTIVE",
        roleId,
        role: {
          AND: [
            { permissions: { some: { permission: { code: "users.manage" } } } },
            { permissions: { some: { permission: { code: "roles.manage" } } } }
          ]
        }
      }
    });
  }
}

export const userRepository = new UserRepository();

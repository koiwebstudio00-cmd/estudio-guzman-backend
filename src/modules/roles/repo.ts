import type { Prisma } from "../../generated/prisma/client.js";
import type { DatabaseClient } from "../auth/repo.js";

export const roleInclude = {
  permissions: { include: { permission: true } },
  _count: { select: { users: true } }
} satisfies Prisma.RoleInclude;

export class RoleRepository {
  list(database: DatabaseClient) {
    return database.role.findMany({ include: roleInclude, orderBy: { name: "asc" } });
  }

  findById(database: DatabaseClient, id: string) {
    return database.role.findUnique({ where: { id }, include: roleInclude });
  }

  findPermissions(database: DatabaseClient, codes: string[]) {
    return database.permission.findMany({
      where: { code: { in: codes } },
      orderBy: { code: "asc" }
    });
  }

  create(
    database: DatabaseClient,
    data: { code: string; name: string; description?: string | null; permissionIds: string[] }
  ) {
    return database.role.create({
      data: {
        code: data.code,
        name: data.name,
        ...(data.description !== undefined ? { description: data.description } : {}),
        permissions: { create: data.permissionIds.map((permissionId) => ({ permissionId })) }
      },
      include: roleInclude
    });
  }

  update(
    database: DatabaseClient,
    id: string,
    data: { name?: string; description?: string | null }
  ) {
    return database.role.update({ where: { id }, data, include: roleInclude });
  }

  async replacePermissions(database: DatabaseClient, roleId: string, permissionIds: string[]) {
    await database.rolePermission.deleteMany({ where: { roleId } });
    if (permissionIds.length > 0) {
      await database.rolePermission.createMany({
        data: permissionIds.map((permissionId) => ({ roleId, permissionId }))
      });
    }
    return this.findById(database, roleId);
  }

  revokeRoleSessions(database: DatabaseClient, roleId: string, now: Date) {
    return database.session.updateMany({
      where: { user: { roleId }, revokedAt: null },
      data: { revokedAt: now }
    });
  }
}

export const roleRepository = new RoleRepository();

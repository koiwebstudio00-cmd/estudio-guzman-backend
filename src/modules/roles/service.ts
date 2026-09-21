import { getPrisma } from "../../database/prisma.js";
import { ApiError } from "../../shared/http/errors.js";
import { auditService } from "../audit/service.js";
import type { AuthenticatedActor, RequestContext } from "../auth/types.js";
import { outboxService } from "../outbox/service.js";
import { userRepository } from "../users/repo.js";
import { toRoleDto } from "./mapper.js";
import { roleRepository } from "./repo.js";

function auditContext(context: RequestContext) {
  return {
    ...(context.requestId ? { requestId: context.requestId } : {}),
    ...(context.ipAddress ? { ipAddress: context.ipAddress } : {}),
    ...(context.userAgent ? { userAgent: context.userAgent } : {})
  };
}

async function resolvePermissions(codes: string[]) {
  const permissions = await roleRepository.findPermissions(getPrisma(), codes);
  if (permissions.length !== codes.length) {
    throw new ApiError("VALIDATION_ERROR", "Uno o más permisos no existen.");
  }
  return permissions;
}

export class RoleService {
  async list() {
    return (await roleRepository.list(getPrisma())).map(toRoleDto);
  }

  async create(
    input: { code: string; name: string; description?: string | null | undefined; permissionCodes: string[] },
    actor: AuthenticatedActor,
    context: RequestContext
  ) {
    const prisma = getPrisma();
    const permissions = await resolvePermissions(input.permissionCodes);
    const role = await prisma.$transaction(async (transaction) => {
      const created = await roleRepository.create(transaction, {
        code: input.code,
        name: input.name,
        ...(input.description !== undefined ? { description: input.description } : {}),
        permissionIds: permissions.map(({ id }) => id)
      });
      await auditService.record(transaction, {
        actorId: actor.user.id,
        action: "ROLE_CREATED",
        entityType: "Role",
        entityId: created.id,
        after: { code: created.code, name: created.name, permissionCodes: input.permissionCodes },
        ...auditContext(context)
      });
      return created;
    });
    return toRoleDto(role);
  }

  async update(
    roleId: string,
    input: { name?: string | undefined; description?: string | null | undefined },
    actor: AuthenticatedActor,
    context: RequestContext
  ) {
    const prisma = getPrisma();
    const current = await roleRepository.findById(prisma, roleId);
    if (!current) throw new ApiError("NOT_FOUND", "Rol no encontrado.");
    const role = await prisma.$transaction(async (transaction) => {
      const updated = await roleRepository.update(transaction, roleId, {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {})
      });
      await auditService.record(transaction, {
        actorId: actor.user.id,
        action: "ROLE_UPDATED",
        entityType: "Role",
        entityId: roleId,
        before: { name: current.name, description: current.description },
        after: { name: updated.name, description: updated.description },
        ...auditContext(context)
      });
      return updated;
    });
    return toRoleDto(role);
  }

  async replacePermissions(
    roleId: string,
    permissionCodes: string[],
    actor: AuthenticatedActor,
    context: RequestContext
  ) {
    if (actor.user.role.id === roleId) {
      throw new ApiError("FORBIDDEN", "No podés modificar los permisos de tu propio rol.");
    }
    const prisma = getPrisma();
    const current = await roleRepository.findById(prisma, roleId);
    if (!current) throw new ApiError("NOT_FOUND", "Rol no encontrado.");
    const permissions = await resolvePermissions(permissionCodes);
    const previousCodes = current.permissions.map(({ permission }) => permission.code).sort();
    const nextCodes = new Set(permissionCodes);
    const wasAdmin = previousCodes.includes("users.manage") && previousCodes.includes("roles.manage");
    const remainsAdmin = nextCodes.has("users.manage") && nextCodes.has("roles.manage");
    const role = await prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(2026091801)`;
      if (wasAdmin && !remainsAdmin) {
        const totalAdmins = await userRepository.countEffectiveAdmins(transaction);
        const affectedAdmins = await userRepository.countActiveEffectiveAdminsInRole(
          transaction,
          roleId
        );
        if (totalAdmins - affectedAdmins < 1) {
          throw new ApiError("CONFLICT", "No se puede quitar el último administrador efectivo.");
        }
      }
      const updated = await roleRepository.replacePermissions(
        transaction,
        roleId,
        permissions.map(({ id }) => id)
      );
      if (!updated) throw new ApiError("NOT_FOUND", "Rol no encontrado.");
      const revoked = await roleRepository.revokeRoleSessions(transaction, roleId, new Date());
      await auditService.record(transaction, {
        actorId: actor.user.id,
        action: "ROLE_PERMISSIONS_REPLACED",
        entityType: "Role",
        entityId: roleId,
        before: { permissionCodes: previousCodes },
        after: { permissionCodes: [...permissionCodes].sort() },
        metadata: { revokedSessions: revoked.count },
        ...auditContext(context)
      });
      await outboxService.publish(transaction, {
        type: "ROLE_PERMISSIONS_CHANGED",
        aggregateType: "Role",
        aggregateId: roleId,
        payload: { roleId, revokedSessions: revoked.count }
      });
      return updated;
    });
    return toRoleDto(role);
  }
}

export const roleService = new RoleService();

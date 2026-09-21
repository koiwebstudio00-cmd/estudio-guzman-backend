import { config } from "../../config.js";
import { getPrisma } from "../../database/prisma.js";
import { ApiError } from "../../shared/http/errors.js";
import { logger } from "../../shared/logging/logger.js";
import {
  createPasswordResetDelivery,
  type PasswordResetDelivery
} from "../../shared/auth/password-reset-delivery.js";
import { auditService } from "../audit/service.js";
import { passwordService } from "../auth/password.service.js";
import { authRepository } from "../auth/repo.js";
import { tokenService } from "../auth/token.service.js";
import type { AuthenticatedActor, RequestContext } from "../auth/types.js";
import { authorizationService } from "../authorization/service.js";
import { outboxService } from "../outbox/service.js";
import { roleRepository } from "../roles/repo.js";
import { toUserDto, type UserRecord } from "./mapper.js";
import { userRepository } from "./repo.js";

const MINUTE = 60_000;

function auditContext(context: RequestContext) {
  return {
    ...(context.requestId ? { requestId: context.requestId } : {}),
    ...(context.ipAddress ? { ipAddress: context.ipAddress } : {}),
    ...(context.userAgent ? { userAgent: context.userAgent } : {})
  };
}

function isEffectiveAdmin(user: UserRecord): boolean {
  const permissions = new Set(user.role.permissions.map(({ permission }) => permission.code));
  return user.status === "ACTIVE" && permissions.has("users.manage") && permissions.has("roles.manage");
}

export class UserService {
  constructor(private readonly resetDelivery: PasswordResetDelivery = createPasswordResetDelivery()) {}

  async list(filters: { q?: string | undefined; status?: "ACTIVE" | "SUSPENDED" | "DISABLED" | undefined; roleId?: string | undefined }) {
    return (await userRepository.list(getPrisma(), filters)).map(toUserDto);
  }

  async get(userId: string) {
    const user = await userRepository.findById(getPrisma(), userId);
    if (!user) throw new ApiError("NOT_FOUND", "Usuario no encontrado.");
    return toUserDto(user);
  }

  async create(
    input: { email: string; name: string; roleId: string },
    actor: AuthenticatedActor,
    context: RequestContext
  ) {
    authorizationService.requirePermission(actor, "roles.manage");
    const prisma = getPrisma();
    const emailNormalized = input.email.trim().toLowerCase();
    if (await userRepository.findByEmail(prisma, emailNormalized)) {
      throw new ApiError("CONFLICT", "Ya existe un usuario con ese email.");
    }
    if (!(await roleRepository.findById(prisma, input.roleId))) {
      throw new ApiError("VALIDATION_ERROR", "El rol seleccionado no existe.");
    }

    const invitationToken = tokenService.generate();
    const expiresAt = new Date(Date.now() + config.PASSWORD_RESET_TTL_MINUTES * MINUTE);
    const unusablePasswordHash = await passwordService.hash(tokenService.generate(48));
    const result = await prisma.$transaction(async (transaction) => {
      const user = await userRepository.create(transaction, {
        email: emailNormalized,
        emailNormalized,
        name: input.name,
        roleId: input.roleId,
        passwordHash: unusablePasswordHash
      });
      const reset = await authRepository.createPasswordResetToken(
        transaction,
        user.id,
        tokenService.hash(invitationToken),
        expiresAt
      );
      await auditService.record(transaction, {
        actorId: actor.user.id,
        action: "USER_CREATED",
        entityType: "User",
        entityId: user.id,
        after: { email: user.email, name: user.name, roleId: user.roleId, status: user.status },
        ...auditContext(context)
      });
      await outboxService.publish(transaction, {
        type: "USER_INVITED",
        aggregateType: "User",
        aggregateId: user.id,
        payload: { userId: user.id, resetTokenId: reset.id, email: user.email }
      });
      return { user, reset };
    });

    try {
      await this.resetDelivery.deliver({
        tokenId: result.reset.id,
        email: result.user.email,
        token: invitationToken,
        expiresAt
      });
    } catch (error) {
      logger.error({ err: error, resetTokenId: result.reset.id }, "User invitation delivery failed");
    }
    return toUserDto(result.user);
  }

  async update(
    userId: string,
    input: {
      version: number;
      email?: string | undefined;
      name?: string | undefined;
      avatarUrl?: string | null | undefined;
      roleId?: string | undefined;
      status?: "ACTIVE" | "SUSPENDED" | "DISABLED" | undefined;
    },
    actor: AuthenticatedActor,
    context: RequestContext
  ) {
    const prisma = getPrisma();
    const current = await userRepository.findById(prisma, userId);
    if (!current) throw new ApiError("NOT_FOUND", "Usuario no encontrado.");
    if (userId === actor.user.id && (input.roleId !== undefined || input.status !== undefined)) {
      throw new ApiError("FORBIDDEN", "No podés cambiar tu propio rol o estado.");
    }
    if (input.roleId !== undefined) {
      authorizationService.requirePermission(actor, "roles.manage");
      if (!(await roleRepository.findById(prisma, input.roleId))) {
        throw new ApiError("VALIDATION_ERROR", "El rol seleccionado no existe.");
      }
    }
    if (input.email) {
      const duplicate = await userRepository.findByEmail(prisma, input.email.toLowerCase());
      if (duplicate && duplicate.id !== userId) {
        throw new ApiError("CONFLICT", "Ya existe un usuario con ese email.");
      }
    }

    const { version, ...changes } = input;
    const email = changes.email?.trim().toLowerCase();
    const shouldRevoke =
      (changes.roleId !== undefined && changes.roleId !== current.roleId) ||
      (changes.status !== undefined && changes.status !== current.status);
    const updated = await prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(2026091801)`;
      const lockedCurrent = await userRepository.findById(transaction, userId);
      if (!lockedCurrent) throw new ApiError("NOT_FOUND", "Usuario no encontrado.");
      const nextRole = changes.roleId
        ? await roleRepository.findById(transaction, changes.roleId)
        : lockedCurrent.role;
      const nextPermissions = new Set(
        nextRole?.permissions.map(({ permission }) => permission.code) ?? []
      );
      const remainsAdmin =
        (changes.status ?? lockedCurrent.status) === "ACTIVE" &&
        nextPermissions.has("users.manage") &&
        nextPermissions.has("roles.manage");
      if (
        isEffectiveAdmin(lockedCurrent) &&
        !remainsAdmin &&
        (await userRepository.countEffectiveAdmins(transaction)) <= 1
      ) {
        throw new ApiError("CONFLICT", "No se puede quitar el último administrador efectivo.");
      }
      const user = await userRepository.update(transaction, userId, version, {
        ...(email ? { email, emailNormalized: email } : {}),
        ...(changes.name !== undefined ? { name: changes.name } : {}),
        ...(changes.avatarUrl !== undefined ? { avatarUrl: changes.avatarUrl } : {}),
        ...(changes.roleId !== undefined ? { roleId: changes.roleId } : {}),
        ...(changes.status !== undefined ? { status: changes.status } : {})
      });
      if (!user) throw new ApiError("CONFLICT", "El usuario fue modificado por otra operación.");
      if (shouldRevoke) await authRepository.revokeUserSessions(transaction, userId, new Date());
      await auditService.record(transaction, {
        actorId: actor.user.id,
        action: "USER_UPDATED",
        entityType: "User",
        entityId: userId,
        before: { email: current.email, name: current.name, roleId: current.roleId, status: current.status },
        after: { email: user.email, name: user.name, roleId: user.roleId, status: user.status },
        metadata: { sessionsRevoked: shouldRevoke },
        ...auditContext(context)
      });
      await outboxService.publish(transaction, {
        type: "USER_UPDATED",
        aggregateType: "User",
        aggregateId: userId,
        payload: { userId, sessionsRevoked: shouldRevoke }
      });
      return user;
    });
    return toUserDto(updated);
  }

  async revokeSessions(userId: string, actor: AuthenticatedActor, context: RequestContext) {
    const prisma = getPrisma();
    if (!(await userRepository.findById(prisma, userId))) {
      throw new ApiError("NOT_FOUND", "Usuario no encontrado.");
    }
    await prisma.$transaction(async (transaction) => {
      const result = await authRepository.revokeUserSessions(transaction, userId, new Date());
      await auditService.record(transaction, {
        actorId: actor.user.id,
        action: "USER_SESSIONS_REVOKED",
        entityType: "User",
        entityId: userId,
        metadata: { revokedSessions: result.count },
        ...auditContext(context)
      });
    });
  }

  async issuePasswordReset(userId: string, actor: AuthenticatedActor, context: RequestContext) {
    const prisma = getPrisma();
    const user = await userRepository.findById(prisma, userId);
    if (!user) throw new ApiError("NOT_FOUND", "Usuario no encontrado.");
    const token = tokenService.generate();
    const expiresAt = new Date(Date.now() + config.PASSWORD_RESET_TTL_MINUTES * MINUTE);
    const reset = await prisma.$transaction(async (transaction) => {
      await authRepository.invalidatePasswordResetTokens(transaction, userId, new Date());
      const created = await authRepository.createPasswordResetToken(
        transaction,
        userId,
        tokenService.hash(token),
        expiresAt
      );
      await auditService.record(transaction, {
        actorId: actor.user.id,
        action: "USER_PASSWORD_RESET_ISSUED",
        entityType: "User",
        entityId: userId,
        ...auditContext(context)
      });
      await outboxService.publish(transaction, {
        type: "USER_PASSWORD_RESET_ISSUED",
        aggregateType: "User",
        aggregateId: userId,
        payload: { userId, resetTokenId: created.id, email: user.email }
      });
      return created;
    });
    try {
      await this.resetDelivery.deliver({ tokenId: reset.id, email: user.email, token, expiresAt });
    } catch (error) {
      logger.error({ err: error, resetTokenId: reset.id }, "Administrative password reset delivery failed");
    }
  }
}

export const userService = new UserService();

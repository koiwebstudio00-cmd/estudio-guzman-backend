import { config } from "../../config.js";
import { getPrisma } from "../../database/prisma.js";
import { ApiError } from "../../shared/http/errors.js";
import { logger } from "../../shared/logging/logger.js";
import {
  createPasswordResetDelivery,
  type PasswordResetDelivery
} from "../../shared/auth/password-reset-delivery.js";
import { auditService, type AuditService } from "../audit/service.js";
import { outboxService, type OutboxService } from "../outbox/service.js";
import { DUMMY_PASSWORD_HASH, passwordService, type PasswordService } from "./password.service.js";
import { authRepository } from "./repo.js";
import { sessionService, toAuthenticatedUser, type SessionService } from "./session.service.js";
import { tokenService, type TokenService } from "./token.service.js";
import type { AuthenticatedActor, AuthenticatedUser, RequestContext } from "./types.js";

const INVALID_CREDENTIALS = "Email o contraseña incorrectos.";
const MINUTE = 60_000;

interface LoginResult {
  user: AuthenticatedUser;
  sessionToken: string;
  csrfToken: string;
  expiresAt: Date;
}

function auditContext(context: RequestContext) {
  return {
    ...(context.requestId ? { requestId: context.requestId } : {}),
    ...(context.ipAddress ? { ipAddress: context.ipAddress } : {}),
    ...(context.userAgent ? { userAgent: context.userAgent } : {})
  };
}

export class AuthService {
  constructor(
    private readonly repository = authRepository,
    private readonly passwords: PasswordService = passwordService,
    private readonly tokens: TokenService = tokenService,
    private readonly sessions: SessionService = sessionService,
    private readonly audit: AuditService = auditService,
    private readonly outbox: OutboxService = outboxService,
    private readonly resetDelivery: PasswordResetDelivery = createPasswordResetDelivery()
  ) {}

  async login(email: string, password: string, context: RequestContext): Promise<LoginResult> {
    const prisma = getPrisma();
    const now = new Date();
    const emailNormalized = email.trim().toLowerCase();
    const user = await this.repository.findUserByEmail(prisma, emailNormalized);
    const hashToVerify = user?.passwordHash ?? DUMMY_PASSWORD_HASH;
    const passwordMatches = await this.passwords.verify(hashToVerify, password).catch(() => false);
    const locked = Boolean(user?.lockedUntil && user.lockedUntil > now);
    const canLogin = Boolean(user && user.status === "ACTIVE" && !locked && passwordMatches);

    if (!user || !canLogin) {
      await prisma.$transaction(async (transaction) => {
        if (user && !locked) {
          await this.repository.incrementFailedLogin(
            transaction,
            user.id,
            config.LOGIN_MAX_ATTEMPTS,
            new Date(now.getTime() + config.LOGIN_LOCK_MINUTES * MINUTE)
          );
        }

        await this.audit.record(transaction, {
          actorId: user?.id ?? null,
          action: "AUTH_LOGIN_FAILED",
          entityType: "User",
          entityId: user?.id ?? null,
          metadata: { reason: locked ? "LOCKED" : "INVALID_CREDENTIALS" },
          ...auditContext(context)
        });
      });
      throw new ApiError("UNAUTHORIZED", INVALID_CREDENTIALS);
    }

    const replacementHash = this.passwords.needsRehash(user.passwordHash)
      ? await this.passwords.hash(password)
      : undefined;

    const created = await prisma.$transaction(async (transaction) => {
      await this.repository.registerSuccessfulLogin(
        transaction,
        user.id,
        now,
        replacementHash
      );
      const session = await this.sessions.create(transaction, user.id, context, now);
      await this.audit.record(transaction, {
        actorId: user.id,
        action: "AUTH_LOGIN_SUCCEEDED",
        entityType: "Session",
        entityId: session.sessionId,
        metadata: { passwordRehashed: Boolean(replacementHash) },
        ...auditContext(context)
      });
      return session;
    });

    return {
      user: toAuthenticatedUser(user),
      sessionToken: created.sessionToken,
      csrfToken: created.csrfToken,
      expiresAt: created.expiresAt
    };
  }

  async logout(actor: AuthenticatedActor, context: RequestContext): Promise<void> {
    const prisma = getPrisma();
    const now = new Date();
    await prisma.$transaction(async (transaction) => {
      await this.repository.revokeSession(transaction, actor.sessionId, now);
      await this.audit.record(transaction, {
        actorId: actor.user.id,
        action: "AUTH_LOGOUT",
        entityType: "Session",
        entityId: actor.sessionId,
        ...auditContext(context)
      });
    });
  }

  async logoutAll(actor: AuthenticatedActor, context: RequestContext): Promise<void> {
    const prisma = getPrisma();
    const now = new Date();
    await prisma.$transaction(async (transaction) => {
      const result = await this.repository.revokeUserSessions(transaction, actor.user.id, now);
      await this.audit.record(transaction, {
        actorId: actor.user.id,
        action: "AUTH_LOGOUT_ALL",
        entityType: "User",
        entityId: actor.user.id,
        metadata: { revokedSessions: result.count },
        ...auditContext(context)
      });
    });
  }

  async forgotPassword(email: string, context: RequestContext): Promise<void> {
    const prisma = getPrisma();
    const user = await this.repository.findUserByEmail(prisma, email.trim().toLowerCase());
    if (!user || user.status !== "ACTIVE") return;

    const token = this.tokens.generate();
    const expiresAt = new Date(Date.now() + config.PASSWORD_RESET_TTL_MINUTES * MINUTE);
    const reset = await prisma.$transaction(async (transaction) => {
      await this.repository.invalidatePasswordResetTokens(transaction, user.id, new Date());
      const created = await this.repository.createPasswordResetToken(
        transaction,
        user.id,
        this.tokens.hash(token),
        expiresAt
      );
      await this.audit.record(transaction, {
        actorId: user.id,
        action: "AUTH_PASSWORD_RESET_REQUESTED",
        entityType: "PasswordResetToken",
        entityId: created.id,
        ...auditContext(context)
      });
      await this.outbox.publish(transaction, {
        type: "AUTH_PASSWORD_RESET_REQUESTED",
        aggregateType: "User",
        aggregateId: user.id,
        payload: { userId: user.id, resetTokenId: created.id, email: user.email }
      });
      return created;
    });

    try {
      await this.resetDelivery.deliver({
        tokenId: reset.id,
        email: user.email,
        token,
        expiresAt
      });
    } catch (error) {
      logger.error({ err: error, resetTokenId: reset.id }, "Password reset delivery failed");
    }
  }

  async resetPassword(token: string, newPassword: string, context: RequestContext): Promise<void> {
    const prisma = getPrisma();
    const now = new Date();
    const reset = await this.repository.findPasswordResetToken(prisma, this.tokens.hash(token));

    if (!reset || reset.usedAt || reset.expiresAt <= now || reset.user.status !== "ACTIVE") {
      throw new ApiError("VALIDATION_ERROR", "El enlace de recuperación es inválido o venció.");
    }

    const passwordHash = await this.passwords.hash(newPassword);
    await prisma.$transaction(async (transaction) => {
      const consumed = await this.repository.consumePasswordResetToken(transaction, reset.id, now);
      if (consumed.count !== 1) {
        throw new ApiError("VALIDATION_ERROR", "El enlace de recuperación es inválido o venció.");
      }
      await this.repository.invalidatePasswordResetTokens(transaction, reset.userId, now);
      await this.repository.updatePassword(transaction, reset.userId, passwordHash, now);
      const revoked = await this.repository.revokeUserSessions(transaction, reset.userId, now);
      await this.audit.record(transaction, {
        actorId: reset.userId,
        action: "AUTH_PASSWORD_RESET_COMPLETED",
        entityType: "User",
        entityId: reset.userId,
        metadata: { revokedSessions: revoked.count },
        ...auditContext(context)
      });
      await this.outbox.publish(transaction, {
        type: "AUTH_PASSWORD_CHANGED",
        aggregateType: "User",
        aggregateId: reset.userId,
        payload: { userId: reset.userId }
      });
    });

    await this.resetDelivery.consume?.(reset.id).catch((error: unknown) => {
      logger.warn({ err: error, resetTokenId: reset.id }, "Password reset artifact cleanup failed");
    });
  }

  async changePassword(
    currentPassword: string,
    newPassword: string,
    actor: AuthenticatedActor,
    context: RequestContext
  ): Promise<void> {
    const prisma = getPrisma();
    const user = await this.repository.findUserById(prisma, actor.user.id);
    if (!user || !(await this.passwords.verify(user.passwordHash, currentPassword).catch(() => false))) {
      throw new ApiError("VALIDATION_ERROR", "La contraseña actual es incorrecta.");
    }

    const passwordHash = await this.passwords.hash(newPassword);
    const now = new Date();
    await prisma.$transaction(async (transaction) => {
      await this.repository.updatePassword(transaction, actor.user.id, passwordHash, now);
      await this.repository.invalidatePasswordResetTokens(transaction, actor.user.id, now);
      const revoked = await this.repository.revokeUserSessions(transaction, actor.user.id, now);
      await this.audit.record(transaction, {
        actorId: actor.user.id,
        action: "AUTH_PASSWORD_CHANGED",
        entityType: "User",
        entityId: actor.user.id,
        metadata: { revokedSessions: revoked.count },
        ...auditContext(context)
      });
      await this.outbox.publish(transaction, {
        type: "AUTH_PASSWORD_CHANGED",
        aggregateType: "User",
        aggregateId: actor.user.id,
        payload: { userId: actor.user.id }
      });
    });
  }
}

export const authService = new AuthService();

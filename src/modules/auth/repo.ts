import type { Prisma, PrismaClient } from "../../generated/prisma/client.js";

export type DatabaseClient = PrismaClient | Prisma.TransactionClient;

const userWithAuthorization = {
  role: {
    include: {
      permissions: {
        include: { permission: true }
      }
    }
  }
} satisfies Prisma.UserInclude;

export class AuthRepository {
  findUserByEmail(database: DatabaseClient, emailNormalized: string) {
    return database.user.findUnique({
      where: { emailNormalized },
      include: userWithAuthorization
    });
  }

  findUserById(database: DatabaseClient, id: string) {
    return database.user.findUnique({
      where: { id },
      include: userWithAuthorization
    });
  }

  incrementFailedLogin(
    database: DatabaseClient,
    userId: string,
    threshold: number,
    lockedUntil: Date
  ) {
    return database.$executeRaw`
      UPDATE "users"
      SET
        "failed_login_count" = "failed_login_count" + 1,
        "locked_until" = CASE
          WHEN "failed_login_count" + 1 >= ${threshold} THEN ${lockedUntil}
          ELSE "locked_until"
        END,
        "updated_at" = NOW()
      WHERE "id" = ${userId}::uuid
    `;
  }

  registerSuccessfulLogin(
    database: DatabaseClient,
    userId: string,
    now: Date,
    passwordHash?: string
  ) {
    return database.user.update({
      where: { id: userId },
      data: {
        failedLoginCount: 0,
        lockedUntil: null,
        lastLoginAt: now,
        ...(passwordHash ? { passwordHash } : {})
      }
    });
  }

  createSession(
    database: DatabaseClient,
    data: {
      userId: string;
      tokenHash: string;
      csrfSecretHash: string;
      expiresAt: Date;
      now: Date;
      ipAddress?: string;
      userAgent?: string;
    }
  ) {
    return database.session.create({
      data: {
        userId: data.userId,
        tokenHash: data.tokenHash,
        csrfSecretHash: data.csrfSecretHash,
        expiresAt: data.expiresAt,
        lastSeenAt: data.now,
        createdAt: data.now,
        ...(data.ipAddress ? { ipAddress: data.ipAddress } : {}),
        ...(data.userAgent ? { userAgent: data.userAgent } : {})
      }
    });
  }

  findSessionByHash(database: DatabaseClient, tokenHash: string) {
    return database.session.findUnique({
      where: { tokenHash },
      include: {
        user: { include: userWithAuthorization }
      }
    });
  }

  touchSession(database: DatabaseClient, sessionId: string, now: Date) {
    return database.session.update({
      where: { id: sessionId },
      data: { lastSeenAt: now }
    });
  }

  revokeSession(database: DatabaseClient, sessionId: string, now: Date) {
    return database.session.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: now }
    });
  }

  revokeUserSessions(database: DatabaseClient, userId: string, now: Date) {
    return database.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: now }
    });
  }

  createPasswordResetToken(
    database: DatabaseClient,
    userId: string,
    tokenHash: string,
    expiresAt: Date
  ) {
    return database.passwordResetToken.create({
      data: { userId, tokenHash, expiresAt }
    });
  }

  invalidatePasswordResetTokens(database: DatabaseClient, userId: string, now: Date) {
    return database.passwordResetToken.updateMany({
      where: { userId, usedAt: null },
      data: { usedAt: now }
    });
  }

  findPasswordResetToken(database: DatabaseClient, tokenHash: string) {
    return database.passwordResetToken.findUnique({
      where: { tokenHash },
      include: { user: true }
    });
  }

  consumePasswordResetToken(database: DatabaseClient, id: string, now: Date) {
    return database.passwordResetToken.updateMany({
      where: { id, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now }
    });
  }

  updatePassword(database: DatabaseClient, userId: string, passwordHash: string, now: Date) {
    return database.user.update({
      where: { id: userId },
      data: {
        passwordHash,
        passwordChangedAt: now,
        failedLoginCount: 0,
        lockedUntil: null,
        version: { increment: 1 }
      }
    });
  }
}

export const authRepository = new AuthRepository();

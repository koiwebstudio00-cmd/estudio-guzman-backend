import { config } from "../../config.js";
import { getPrisma } from "../../database/prisma.js";
import { ApiError } from "../../shared/http/errors.js";
import { authRepository, type DatabaseClient } from "./repo.js";
import { tokenService, type TokenService } from "./token.service.js";
import type { AuthenticatedActor, AuthenticatedUser, RequestContext } from "./types.js";

const MILLISECONDS_PER_MINUTE = 60_000;
const MILLISECONDS_PER_DAY = 86_400_000;

function toAuthenticatedUser(user: Awaited<ReturnType<AuthRepositoryShape["findUserById"]>>): AuthenticatedUser {
  if (!user) throw new ApiError("UNAUTHORIZED", "Sesión inválida o vencida.");

  return {
    id: user.id,
    version: user.version,
    email: user.email,
    name: user.name,
    avatarUrl: user.avatarUrl,
    role: {
      id: user.role.id,
      code: user.role.code,
      name: user.role.name
    },
    permissions: user.role.permissions.map(({ permission }) => permission.code).sort()
  };
}

type AuthRepositoryShape = typeof authRepository;

export interface CreatedSession {
  sessionId: string;
  sessionToken: string;
  csrfToken: string;
  expiresAt: Date;
}

export class SessionService {
  constructor(
    private readonly repository = authRepository,
    private readonly tokens: TokenService = tokenService
  ) {}

  create(
    database: DatabaseClient,
    userId: string,
    context: RequestContext,
    now = new Date()
  ): Promise<CreatedSession> {
    const sessionToken = this.tokens.generate();
    const csrfToken = this.tokens.deriveCsrf(sessionToken);
    const expiresAt = new Date(now.getTime() + config.SESSION_TTL_DAYS * MILLISECONDS_PER_DAY);

    return this.repository
      .createSession(database, {
        userId,
        tokenHash: this.tokens.hash(sessionToken),
        csrfSecretHash: this.tokens.hash(csrfToken),
        expiresAt,
        now,
        ...(context.ipAddress ? { ipAddress: context.ipAddress } : {}),
        ...(context.userAgent ? { userAgent: context.userAgent } : {})
      })
      .then((session) => ({ sessionId: session.id, sessionToken, csrfToken, expiresAt }));
  }

  async authenticate(sessionToken: string | undefined, now = new Date()): Promise<AuthenticatedActor> {
    if (!sessionToken) throw new ApiError("UNAUTHORIZED", "Sesión inválida o vencida.");

    const prisma = getPrisma();
    const session = await this.repository.findSessionByHash(prisma, this.tokens.hash(sessionToken));
    const idleDeadline = session
      ? new Date(session.lastSeenAt.getTime() + config.SESSION_IDLE_MINUTES * MILLISECONDS_PER_MINUTE)
      : null;

    if (
      !session ||
      session.revokedAt ||
      session.expiresAt <= now ||
      !idleDeadline ||
      idleDeadline <= now ||
      session.user.status !== "ACTIVE"
    ) {
      if (session && !session.revokedAt) {
        await this.repository.revokeSession(prisma, session.id, now);
      }
      throw new ApiError("UNAUTHORIZED", "Sesión inválida o vencida.");
    }

    await this.repository.touchSession(prisma, session.id, now);

    return {
      sessionId: session.id,
      csrfSecretHash: session.csrfSecretHash,
      user: toAuthenticatedUser(session.user)
    };
  }

  verifyCsrf(actor: AuthenticatedActor, csrfToken: string | undefined): void {
    if (!csrfToken || !this.tokens.matches(csrfToken, actor.csrfSecretHash)) {
      throw new ApiError("FORBIDDEN", "Token CSRF inválido.");
    }
  }

  issueCsrf(actor: AuthenticatedActor, sessionToken: string): string {
    const csrfToken = this.tokens.deriveCsrf(sessionToken);
    if (!this.tokens.matches(csrfToken, actor.csrfSecretHash)) {
      throw new ApiError("UNAUTHORIZED", "Sesión inválida o vencida.");
    }
    return csrfToken;
  }
}

export const sessionService = new SessionService();
export { toAuthenticatedUser };

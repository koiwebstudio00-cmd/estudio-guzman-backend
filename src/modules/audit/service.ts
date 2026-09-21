import type { Prisma } from "../../generated/prisma/client.js";
import { getPrisma } from "../../database/prisma.js";
import { ApiError } from "../../shared/http/errors.js";
import { auditRepository } from "./repo.js";

interface AuditEntry {
  actorId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: Prisma.InputJsonValue;
  after?: Prisma.InputJsonValue;
  metadata?: Prisma.InputJsonValue;
  requestId?: string;
  ipAddress?: string;
  userAgent?: string;
}

export class AuditService {
  async list(input: { entityType?: string | undefined; entityId?: string | undefined; actorId?: string | undefined; from?: Date | undefined; to?: Date | undefined; cursor?: string | undefined; limit: number }) { let cursor: bigint | undefined; try { cursor = input.cursor ? BigInt(input.cursor) : undefined; } catch { throw new ApiError("VALIDATION_ERROR", "Cursor inválido."); } const rows = await auditRepository.list(getPrisma(), { ...input, cursor }); const more = rows.length > input.limit; const selected = more ? rows.slice(0, input.limit) : rows; const last = selected.at(-1); return { data: selected.map((item) => ({ ...item, id: item.id.toString() })), meta: { nextCursor: more && last ? last.id.toString() : null } }; }
  record(transaction: Prisma.TransactionClient, entry: AuditEntry) {
    return transaction.auditLog.create({
      data: {
        action: entry.action,
        entityType: entry.entityType,
        ...(entry.actorId !== undefined ? { actorId: entry.actorId } : {}),
        ...(entry.entityId !== undefined ? { entityId: entry.entityId } : {}),
        ...(entry.before !== undefined ? { before: entry.before } : {}),
        ...(entry.after !== undefined ? { after: entry.after } : {}),
        ...(entry.metadata !== undefined ? { metadata: entry.metadata } : {}),
        ...(entry.requestId ? { requestId: entry.requestId } : {}),
        ...(entry.ipAddress ? { ipAddress: entry.ipAddress } : {}),
        ...(entry.userAgent ? { userAgent: entry.userAgent } : {})
      }
    });
  }
}

export const auditService = new AuditService();

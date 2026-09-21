import type { Prisma, PrismaClient } from "../generated/prisma/client.js";
import type { MalwareScanner } from "../shared/storage/malware-scanner.js";

interface ClaimedEvent { id: string; payload: Prisma.JsonValue; attempts: number }
const payloadVersionId = (payload: Prisma.JsonValue) => payload && typeof payload === "object" && !Array.isArray(payload) && typeof payload.versionId === "string" ? payload.versionId : null;

export class DocumentScanWorker {
  constructor(private readonly prisma: PrismaClient, private readonly scanner: MalwareScanner, private readonly maxAttempts = 5) {}

  async runOnce(): Promise<boolean> {
    const event = await this.claim();
    if (!event) return false;
    const versionId = payloadVersionId(event.payload);
    if (!versionId) { await this.fail(event, "Payload de escaneo inválido.", true); return true; }
    const version = await this.prisma.documentVersion.findUnique({ where: { id: versionId }, select: { id: true, storageKey: true } });
    if (!version) { await this.fail(event, "Versión de documento inexistente.", true); return true; }
    try {
      const result = await this.scanner.scan(version.storageKey);
      await this.prisma.$transaction([
        this.prisma.documentVersion.update({ where: { id: version.id }, data: { scanStatus: result, scannedAt: new Date() } }),
        this.prisma.outboxEvent.update({ where: { id: event.id }, data: { status: "PROCESSED", processedAt: new Date(), lockedAt: null, lastError: null } })
      ]);
    } catch { await this.fail(event, "El análisis antivirus falló.", event.attempts >= this.maxAttempts); }
    return true;
  }

  private async claim(): Promise<ClaimedEvent | null> {
    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<ClaimedEvent[]>`
        WITH candidate AS (
          SELECT "id" FROM "outbox_events"
          WHERE "status" = 'PENDING' AND "type" = 'DOCUMENT_SCAN_REQUESTED' AND "available_at" <= ${now}
          ORDER BY "available_at", "created_at"
          FOR UPDATE SKIP LOCKED
          LIMIT 1
        )
        UPDATE "outbox_events" AS event
        SET "status" = 'PROCESSING', "locked_at" = ${now}, "attempts" = event."attempts" + 1
        FROM candidate
        WHERE event."id" = candidate."id"
        RETURNING event."id", event."payload", event."attempts"
      `;
      return rows[0] ?? null;
    });
  }

  private async fail(event: ClaimedEvent, message: string, terminal: boolean) {
    const delaySeconds = Math.min(300, 2 ** event.attempts);
    await this.prisma.$transaction(async (tx) => {
      const versionId = payloadVersionId(event.payload);
      if (terminal && versionId) await tx.documentVersion.updateMany({ where: { id: versionId }, data: { scanStatus: "FAILED", scannedAt: new Date() } });
      await tx.outboxEvent.update({ where: { id: event.id }, data: terminal ? { status: "FAILED", lockedAt: null, lastError: message } : { status: "PENDING", lockedAt: null, lastError: message, availableAt: new Date(Date.now() + delaySeconds * 1_000) } });
    });
  }
}

import { setTimeout as wait } from "node:timers/promises";
import { config } from "./config.js";
import { disconnectDatabase, getPrisma } from "./database/prisma.js";
import { logger } from "./shared/logging/logger.js";
import { ClamAvScanner } from "./shared/storage/malware-scanner.js";
import { storage } from "./shared/storage/local-storage.js";
import { DocumentScanWorker } from "./workers/document-scan-worker.js";
import { NotificationWorker } from "./workers/notification-worker.js";

await storage.ensureReady();
await storage.cleanupTemporaryOlderThan(new Date(Date.now() - 24 * 60 * 60 * 1_000));
const documentWorker = config.MALWARE_SCAN_MODE === "clamav" ? new DocumentScanWorker(getPrisma(), new ClamAvScanner()) : null;
const notificationWorker = new NotificationWorker(getPrisma());
await notificationWorker.enqueueTaskDeadlines(); await notificationWorker.housekeeping(); let nextMaintenance = Date.now() + 60 * 60 * 1_000;
const controller = new AbortController();
process.once("SIGTERM", () => controller.abort()); process.once("SIGINT", () => controller.abort());
logger.info("Outbox worker started");
while (!controller.signal.aborted) {
  try { if (Date.now() >= nextMaintenance) { await notificationWorker.enqueueTaskDeadlines(); await notificationWorker.housekeeping(); nextMaintenance = Date.now() + 60 * 60 * 1_000; } const processed = await notificationWorker.runOnce() || (documentWorker ? await documentWorker.runOnce() : false); if (!processed) await wait(config.WORKER_POLL_INTERVAL_MS, undefined, { signal: controller.signal }); }
  catch (error) { if (!controller.signal.aborted) { logger.error({ err: error }, "Document scan worker iteration failed"); await wait(config.WORKER_POLL_INTERVAL_MS, undefined, { signal: controller.signal }).catch(() => undefined); } }
}
await disconnectDatabase();
logger.info("Outbox worker stopped");

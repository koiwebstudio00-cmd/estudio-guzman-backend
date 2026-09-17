import { buildApp } from "./app.js";
import { config } from "./config.js";
import { disconnectDatabase } from "./database/prisma.js";
import { logger } from "./shared/logging/logger.js";
import { storage } from "./shared/storage/local-storage.js";

await storage.ensureReady();

const app = buildApp();
let shuttingDown = false;

const server = app.listen(config.PORT, config.HOST, () => {
  logger.info(
    { host: config.HOST, port: config.PORT, environment: config.NODE_ENV },
    "API listening"
  );
});

async function shutdown(signal: string, exitCode = 0): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, "Graceful shutdown started");

  const forceTimer = setTimeout(() => {
    logger.fatal("Graceful shutdown timed out");
    process.exit(1);
  }, 10_000);
  forceTimer.unref();

  await new Promise<void>((resolve) => server.close(() => resolve()));
  await disconnectDatabase();
  clearTimeout(forceTimer);
  logger.info("Graceful shutdown completed");
  process.exit(exitCode);
}

process.once("SIGTERM", () => void shutdown("SIGTERM"));
process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("uncaughtException", (error) => {
  logger.fatal({ err: error }, "Uncaught exception");
  void shutdown("uncaughtException", 1);
});
process.once("unhandledRejection", (error) => {
  logger.fatal({ err: error }, "Unhandled rejection");
  void shutdown("unhandledRejection", 1);
});

import { Router } from "express";
import { checkDatabase, getPrisma } from "../../database/prisma.js";
import { storage } from "../../shared/storage/local-storage.js";

export const healthRoutes = Router();

healthRoutes.get("/health/live", (_req, res) => {
  res.json({ status: "ok" });
});

healthRoutes.get("/health/ready", async (req, res) => {
  try {
    await Promise.all([checkDatabase(), storage.ensureReady()]);
    res.json({ status: "ready", checks: { database: "up", storage: "up" } });
  } catch (error) {
    req.log.warn({ err: error }, "Readiness check failed");
    res.status(503).json({
      status: "not_ready",
      checks: { database: "unknown", storage: "unknown" },
      requestId: req.id
    });
  }
});

healthRoutes.get("/health/worker", async (req, res) => {
  try {
    const staleBefore = new Date(Date.now() - 15 * 60_000);
    const [failed, stalled, last] = await Promise.all([getPrisma().outboxEvent.count({ where: { status: "FAILED" } }), getPrisma().outboxEvent.count({ where: { status: "PROCESSING", lockedAt: { lt: staleBefore } } }), getPrisma().outboxEvent.findFirst({ where: { status: "PROCESSED" }, orderBy: { processedAt: "desc" }, select: { processedAt: true } })]);
    res.status(stalled ? 503 : 200).json({ status: stalled ? "degraded" : "ok", checks: { failed, stalled, lastProcessedAt: last?.processedAt ?? null } });
  } catch (error) { req.log.warn({ err: error }, "Worker health check failed"); res.status(503).json({ status: "unknown", requestId: req.id }); }
});

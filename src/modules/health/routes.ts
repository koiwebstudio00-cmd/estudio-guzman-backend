import { Router } from "express";
import { checkDatabase } from "../../database/prisma.js";
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

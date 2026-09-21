import { Router, type Request } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { requirePermission } from "../../middleware/authorize.js";
import { validateRequest } from "../../middleware/validate.js";
import { ApiError } from "../../shared/http/errors.js";
import { dashboardQuerySchema, metricsQuerySchema } from "./schemas.js";
import { dashboardService } from "./service.js";
const actor = (request: Request) => { if (!request.auth) throw new ApiError("UNAUTHORIZED", "Sesión inválida."); return request.auth; };
export function createDashboardRoutes() { const router = Router(); router.get("/dashboard", authenticate, requirePermission("dashboard.read"), validateRequest({ query: dashboardQuerySchema }, async (request, response, { query }) => response.json(await dashboardService.get(actor(request), query)))); router.get("/team/metrics", authenticate, requirePermission("team_metrics.read"), validateRequest({ query: metricsQuerySchema }, async (_request, response, { query }) => response.json(await dashboardService.metrics(query)))); return router; }

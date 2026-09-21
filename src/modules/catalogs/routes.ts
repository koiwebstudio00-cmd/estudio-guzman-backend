import { Router, type Request } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { requirePermission } from "../../middleware/authorize.js";
import { csrfProtection } from "../../middleware/csrf.js";
import { validateRequest } from "../../middleware/validate.js";
import { ApiError } from "../../shared/http/errors.js";
import type { RequestContext } from "../auth/types.js";
import { catalogQuerySchema, courtParamsSchema, createCourtSchema, createOfficeSchema, officeParamsSchema, updateCourtSchema, updateOfficeSchema } from "./schemas.js";
import { catalogService } from "./service.js";

function context(req: Request): RequestContext { const userAgent = req.get("user-agent"); return { ...(typeof req.id === "string" ? { requestId: req.id } : {}), ...(req.ip ? { ipAddress: req.ip } : {}), ...(userAgent ? { userAgent: userAgent.slice(0, 2_000) } : {}) }; }
function actor(req: Request) { if (!req.auth) throw new ApiError("UNAUTHORIZED", "Sesión inválida o vencida."); return req.auth; }
export function createCatalogRoutes() {
  const router = Router(); router.use(["/catalogs", "/courts", "/management-offices"], authenticate);
  router.get("/catalogs", requirePermission("catalogs.read"), (_req, res) => res.json({ data: catalogService.enums() }));
  router.get("/courts", requirePermission("catalogs.read"), validateRequest({ query: catalogQuerySchema }, async (_req, res, { query }) => res.json({ data: await catalogService.courts(query) })));
  router.post("/courts", requirePermission("catalogs.manage"), csrfProtection, validateRequest({ body: createCourtSchema }, async (req, res, { body }) => res.status(201).json({ data: await catalogService.createCourt(body, actor(req), context(req)) })));
  router.get("/courts/:courtId", requirePermission("catalogs.read"), validateRequest({ params: courtParamsSchema }, async (_req, res, { params }) => res.json({ data: await catalogService.court(params.courtId) })));
  router.patch("/courts/:courtId", requirePermission("catalogs.manage"), csrfProtection, validateRequest({ params: courtParamsSchema, body: updateCourtSchema }, async (req, res, { params, body }) => res.json({ data: await catalogService.updateCourt(params.courtId, body, actor(req), context(req)) })));
  router.get("/management-offices", requirePermission("catalogs.read"), validateRequest({ query: catalogQuerySchema }, async (_req, res, { query }) => res.json({ data: await catalogService.offices(query) })));
  router.post("/management-offices", requirePermission("catalogs.manage"), csrfProtection, validateRequest({ body: createOfficeSchema }, async (req, res, { body }) => res.status(201).json({ data: await catalogService.createOffice(body, actor(req), context(req)) })));
  router.get("/management-offices/:officeId", requirePermission("catalogs.read"), validateRequest({ params: officeParamsSchema }, async (_req, res, { params }) => res.json({ data: await catalogService.office(params.officeId) })));
  router.patch("/management-offices/:officeId", requirePermission("catalogs.manage"), csrfProtection, validateRequest({ params: officeParamsSchema, body: updateOfficeSchema }, async (req, res, { params, body }) => res.json({ data: await catalogService.updateOffice(params.officeId, body, actor(req), context(req)) })));
  return router;
}

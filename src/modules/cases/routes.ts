import { Router, type Request } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { requirePermission } from "../../middleware/authorize.js";
import { csrfProtection } from "../../middleware/csrf.js";
import { validateRequest } from "../../middleware/validate.js";
import { ApiError } from "../../shared/http/errors.js";
import type { RequestContext } from "../auth/types.js";
import { actionService } from "../actions/service.js";
import { timelineQuerySchema } from "../actions/schemas.js";
import { caseService } from "./service.js";
import { caseParamsSchema, contactCasesParamsSchema, createCaseSchema, createParticipantSchema, createRepresentationSchema, createTeamMemberSchema, listCasesQuerySchema, membershipParamsSchema, participantParamsSchema, representationParamsSchema, transitionCaseSchema, updateCaseSchema, updateParticipantSchema, updateTeamMemberSchema } from "./schemas.js";

const context = (req: Request): RequestContext => { const userAgent = req.get("user-agent"); return { ...(typeof req.id === "string" ? { requestId: req.id } : {}), ...(req.ip ? { ipAddress: req.ip } : {}), ...(userAgent ? { userAgent: userAgent.slice(0, 2_000) } : {}) }; };
const actor = (req: Request) => { if (!req.auth) throw new ApiError("UNAUTHORIZED", "Sesión inválida o vencida."); return req.auth; };

export function createCaseRoutes() {
  const router = Router(); router.use(["/cases", "/contacts/:contactId/cases"], authenticate);
  router.get("/cases", requirePermission("cases.read"), validateRequest({ query: listCasesQuerySchema }, async (_req, res, { query }) => res.json(await caseService.list(query))));
  router.post("/cases", requirePermission("cases.create"), csrfProtection, validateRequest({ body: createCaseSchema }, async (req, res, { body }) => res.status(201).json({ data: await caseService.create(body, actor(req), context(req)) })));
  router.get("/cases/:caseId", requirePermission("cases.read"), validateRequest({ params: caseParamsSchema }, async (_req, res, { params }) => res.json({ data: await caseService.get(params.caseId) })));
  router.patch("/cases/:caseId", requirePermission("cases.update"), csrfProtection, validateRequest({ params: caseParamsSchema, body: updateCaseSchema }, async (req, res, { params, body }) => res.json({ data: await caseService.update(params.caseId, body, actor(req), context(req)) })));
  router.delete("/cases/:caseId", requirePermission("cases.delete"), csrfProtection, validateRequest({ params: caseParamsSchema }, async (req, res, { params }) => { await caseService.remove(params.caseId, actor(req), context(req)); res.status(204).end(); }));
  router.post("/cases/:caseId/status-transitions", requirePermission("cases.change_status"), csrfProtection, validateRequest({ params: caseParamsSchema, body: transitionCaseSchema }, async (req, res, { params, body }) => res.json({ data: await caseService.transition(params.caseId, body, actor(req), context(req)) })));
  router.get("/cases/:caseId/status-history", requirePermission("cases.read"), validateRequest({ params: caseParamsSchema }, async (_req, res, { params }) => res.json({ data: await caseService.history(params.caseId) })));
  router.get("/cases/:caseId/summary", requirePermission("cases.read"), validateRequest({ params: caseParamsSchema }, async (_req, res, { params }) => res.json({ data: await caseService.summary(params.caseId) })));
  router.get("/cases/:caseId/timeline", requirePermission("cases.read"), validateRequest({ params: caseParamsSchema, query: timelineQuerySchema }, async (_req, res, { params, query }) => res.json(await actionService.timeline(params.caseId, query))));
  router.get("/cases/:caseId/participants", requirePermission("cases.read"), validateRequest({ params: caseParamsSchema }, async (_req, res, { params }) => res.json({ data: (await caseService.get(params.caseId)).participants })));
  router.post("/cases/:caseId/participants", requirePermission("participants.manage"), csrfProtection, validateRequest({ params: caseParamsSchema, body: createParticipantSchema }, async (req, res, { params, body }) => res.status(201).json({ data: await caseService.addParticipant(params.caseId, body, actor(req), context(req)) })));
  router.patch("/cases/:caseId/participants/:participantId", requirePermission("participants.manage"), csrfProtection, validateRequest({ params: participantParamsSchema, body: updateParticipantSchema }, async (req, res, { params, body }) => res.json({ data: await caseService.updateParticipant(params.caseId, params.participantId, body, actor(req), context(req)) })));
  router.delete("/cases/:caseId/participants/:participantId", requirePermission("participants.manage"), csrfProtection, validateRequest({ params: participantParamsSchema }, async (req, res, { params }) => res.json({ data: await caseService.removeParticipant(params.caseId, params.participantId, actor(req), context(req)) })));
  router.post("/cases/:caseId/participants/:participantId/representations", requirePermission("participants.manage"), csrfProtection, validateRequest({ params: participantParamsSchema, body: createRepresentationSchema }, async (req, res, { params, body }) => res.status(201).json({ data: await caseService.addRepresentation(params.caseId, params.participantId, body, actor(req), context(req)) })));
  router.delete("/cases/:caseId/representations/:representationId", requirePermission("participants.manage"), csrfProtection, validateRequest({ params: representationParamsSchema }, async (req, res, { params }) => res.json({ data: await caseService.removeRepresentation(params.caseId, params.representationId, actor(req), context(req)) })));
  router.get("/cases/:caseId/team", requirePermission("cases.read"), validateRequest({ params: caseParamsSchema }, async (_req, res, { params }) => res.json({ data: (await caseService.get(params.caseId)).team })));
  router.post("/cases/:caseId/team", requirePermission("cases.assign"), csrfProtection, validateRequest({ params: caseParamsSchema, body: createTeamMemberSchema }, async (req, res, { params, body }) => res.status(201).json({ data: await caseService.addTeam(params.caseId, body, actor(req), context(req)) })));
  router.patch("/cases/:caseId/team/:membershipId", requirePermission("cases.assign"), csrfProtection, validateRequest({ params: membershipParamsSchema, body: updateTeamMemberSchema }, async (req, res, { params, body }) => res.json({ data: await caseService.updateTeam(params.caseId, params.membershipId, body, actor(req), context(req)) })));
  router.get("/contacts/:contactId/cases", requirePermission("cases.read"), validateRequest({ params: contactCasesParamsSchema }, async (_req, res, { params }) => res.json({ data: await caseService.forContact(params.contactId) })));
  return router;
}

import { Router, type Request } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { requirePermission } from "../../middleware/authorize.js";
import { csrfProtection } from "../../middleware/csrf.js";
import { validateRequest } from "../../middleware/validate.js";
import { ApiError } from "../../shared/http/errors.js";
import type { RequestContext } from "../auth/types.js";
import { addressParamsSchema, addressSchema, channelParamsSchema, channelSchema, contactIdParamsSchema, createContactSchema, listContactsQuerySchema, updateAddressSchema, updateChannelSchema, updateContactSchema } from "./schemas.js";
import { contactService } from "./service.js";

function context(req: Request): RequestContext { const userAgent = req.get("user-agent"); return { ...(typeof req.id === "string" ? { requestId: req.id } : {}), ...(req.ip ? { ipAddress: req.ip } : {}), ...(userAgent ? { userAgent: userAgent.slice(0, 2_000) } : {}) }; }
function actor(req: Request) { if (!req.auth) throw new ApiError("UNAUTHORIZED", "Sesión inválida o vencida."); return req.auth; }

export function createContactRoutes() {
  const router = Router(); router.use("/contacts", authenticate);
  router.get("/contacts", requirePermission("contacts.read"), validateRequest({ query: listContactsQuerySchema }, async (_req, res, { query }) => res.json(await contactService.list(query))));
  router.post("/contacts", requirePermission("contacts.create"), csrfProtection, validateRequest({ body: createContactSchema }, async (req, res, { body }) => res.status(201).json({ data: await contactService.create(body, actor(req), context(req)) })));
  router.get("/contacts/:contactId", requirePermission("contacts.read"), validateRequest({ params: contactIdParamsSchema }, async (_req, res, { params }) => res.json({ data: await contactService.get(params.contactId) })));
  router.patch("/contacts/:contactId", requirePermission("contacts.update"), csrfProtection, validateRequest({ params: contactIdParamsSchema, body: updateContactSchema }, async (req, res, { params, body }) => res.json({ data: await contactService.update(params.contactId, body, actor(req), context(req)) })));
  router.delete("/contacts/:contactId", requirePermission("contacts.delete"), csrfProtection, validateRequest({ params: contactIdParamsSchema }, async (req, res, { params }) => { await contactService.remove(params.contactId, actor(req), context(req)); res.status(204).end(); }));
  router.post("/contacts/:contactId/channels", requirePermission("contacts.update"), csrfProtection, validateRequest({ params: contactIdParamsSchema, body: channelSchema }, async (req, res, { params, body }) => res.status(201).json({ data: await contactService.addChannel(params.contactId, body, actor(req), context(req)) })));
  router.patch("/contacts/:contactId/channels/:channelId", requirePermission("contacts.update"), csrfProtection, validateRequest({ params: channelParamsSchema, body: updateChannelSchema }, async (req, res, { params, body }) => res.json({ data: await contactService.updateChannel(params.contactId, params.channelId, body, actor(req), context(req)) })));
  router.delete("/contacts/:contactId/channels/:channelId", requirePermission("contacts.update"), csrfProtection, validateRequest({ params: channelParamsSchema }, async (req, res, { params }) => { await contactService.deleteChannel(params.contactId, params.channelId, actor(req), context(req)); res.status(204).end(); }));
  router.post("/contacts/:contactId/addresses", requirePermission("contacts.update"), csrfProtection, validateRequest({ params: contactIdParamsSchema, body: addressSchema }, async (req, res, { params, body }) => res.status(201).json({ data: await contactService.addAddress(params.contactId, body, actor(req), context(req)) })));
  router.patch("/contacts/:contactId/addresses/:addressId", requirePermission("contacts.update"), csrfProtection, validateRequest({ params: addressParamsSchema, body: updateAddressSchema }, async (req, res, { params, body }) => res.json({ data: await contactService.updateAddress(params.contactId, params.addressId, body, actor(req), context(req)) })));
  router.delete("/contacts/:contactId/addresses/:addressId", requirePermission("contacts.update"), csrfProtection, validateRequest({ params: addressParamsSchema }, async (req, res, { params }) => { await contactService.deleteAddress(params.contactId, params.addressId, actor(req), context(req)); res.status(204).end(); }));
  return router;
}

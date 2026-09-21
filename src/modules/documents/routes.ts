import { pipeline } from "node:stream/promises";
import { Router, type Request, type Response } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { requirePermission } from "../../middleware/authorize.js";
import { csrfProtection } from "../../middleware/csrf.js";
import { createUploadRateLimit } from "../../middleware/rate-limit.js";
import { validateRequest } from "../../middleware/validate.js";
import { ApiError } from "../../shared/http/errors.js";
import { storage } from "../../shared/storage/local-storage.js";
import type { RequestContext } from "../auth/types.js";
import { parsePdfMultipart } from "./multipart.js";
import { archiveDocumentSchema, createDocumentFieldsSchema, documentParamsSchema, documentVersionParamsSchema, listDocumentsQuerySchema, updateDocumentSchema } from "./schemas.js";
import { documentService } from "./service.js";

const context = (req: Request): RequestContext => { const userAgent = req.get("user-agent"); return { ...(typeof req.id === "string" ? { requestId: req.id } : {}), ...(req.ip ? { ipAddress: req.ip } : {}), ...(userAgent ? { userAgent: userAgent.slice(0, 2_000) } : {}) }; };
const actor = (req: Request) => { if (!req.auth) throw new ApiError("UNAUTHORIZED", "Sesión inválida."); return req.auth; };
const disposition = (name: string) => { const fallback = name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_"); return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(name)}`; };

export function createDocumentRoutes() {
  const router = Router(); const uploadRateLimit = createUploadRateLimit(); router.use("/documents", authenticate);
  router.get("/documents", requirePermission("documents.read"), validateRequest({ query: listDocumentsQuerySchema }, async (req, res, { query }) => res.json(await documentService.list(query, actor(req)))));
  router.post("/documents", requirePermission("documents.create"), uploadRateLimit, csrfProtection, async (req, res) => { const upload = await parsePdfMultipart(req); try { const fields = createDocumentFieldsSchema.parse(upload.fields); res.status(201).json({ data: await documentService.create(fields, upload.file, actor(req), context(req)) }); } catch (error) { await storage.deleteTemporary(upload.file.temporaryId); throw error; } });
  router.get("/documents/:documentId", requirePermission("documents.read"), validateRequest({ params: documentParamsSchema }, async (req, res, { params }) => res.json({ data: await documentService.get(params.documentId, actor(req)) })));
  router.patch("/documents/:documentId", requirePermission("documents.create"), csrfProtection, validateRequest({ params: documentParamsSchema, body: updateDocumentSchema }, async (req, res, { params, body }) => res.json({ data: await documentService.update(params.documentId, body, actor(req), context(req)) })));
  router.delete("/documents/:documentId", requirePermission("documents.archive"), csrfProtection, validateRequest({ params: documentParamsSchema, body: archiveDocumentSchema }, async (req, res, { params, body }) => { await documentService.archive(params.documentId, body, actor(req), context(req)); res.status(204).end(); }));
  router.post("/documents/:documentId/versions", requirePermission("documents.version"), uploadRateLimit, csrfProtection, async (req, res) => { const { documentId } = documentParamsSchema.parse(req.params); const upload = await parsePdfMultipart(req); try { if (Object.keys(upload.fields).length > 0) throw new ApiError("VALIDATION_ERROR", "La nueva versión sólo admite el campo file."); res.status(201).json({ data: await documentService.addVersion(documentId, upload.file, actor(req), context(req)) }); } catch (error) { await storage.deleteTemporary(upload.file.temporaryId); throw error; } });
  const download = async (req: Request, res: Response, documentId: string, versionId?: string) => { const value = await documentService.download(documentId, versionId, actor(req)); res.setHeader("Content-Type", value.mimeType); res.setHeader("Content-Length", value.sizeBytes.toString()); res.setHeader("Content-Disposition", disposition(value.originalName)); res.setHeader("X-Content-Type-Options", "nosniff"); res.setHeader("Digest", `sha-256=${Buffer.from(value.sha256, "hex").toString("base64")}`); await pipeline(value.stream, res); };
  router.get("/documents/:documentId/download", requirePermission("documents.read"), validateRequest({ params: documentParamsSchema }, async (req, res, { params }) => download(req, res, params.documentId)));
  router.get("/documents/:documentId/versions/:versionId/download", requirePermission("documents.read"), validateRequest({ params: documentVersionParamsSchema }, async (req, res, { params }) => download(req, res, params.documentId, params.versionId)));
  return router;
}

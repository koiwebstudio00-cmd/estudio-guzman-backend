import { randomUUID } from "node:crypto";
import type { Prisma } from "../../generated/prisma/client.js";
import type { DocumentCategory, MalwareScanStatus } from "../../generated/prisma/enums.js";
import { config } from "../../config.js";
import { getPrisma } from "../../database/prisma.js";
import { ApiError } from "../../shared/http/errors.js";
import { storage } from "../../shared/storage/local-storage.js";
import { auditService } from "../audit/service.js";
import type { DatabaseClient } from "../auth/repo.js";
import type { AuthenticatedActor, RequestContext } from "../auth/types.js";
import { outboxService } from "../outbox/service.js";
import { decodeDocumentCursor, encodeDocumentCursor } from "./cursor.js";
import { toDocumentDto } from "./mapper.js";
import type { ParsedPdfUpload } from "./multipart.js";
import { documentRepository, type DocumentRow } from "./repo.js";

type ContextInput = { caseId?: string | undefined; subCaseId?: string | undefined; actionId?: string | undefined; taskId?: string | undefined; noteId?: string | undefined };
type CreateInput = ContextInput & { title: string; category: DocumentCategory; description?: string | undefined };
type Target = { links: ContextInput; storageCaseId: string | null; permission: string; mutable: boolean };
const metadata = (context: RequestContext) => ({ ...(context.requestId ? { requestId: context.requestId } : {}), ...(context.ipAddress ? { ipAddress: context.ipAddress } : {}), ...(context.userAgent ? { userAgent: context.userAgent } : {}) });

export class DocumentService {
  async list(input: ContextInput & { cursor?: string | undefined; limit: number }, actor: AuthenticatedActor) { const target = await this.resolveTarget(getPrisma(), input); this.assertPermission(actor, target.permission); const cursor = decodeDocumentCursor(input.cursor); const rows = await documentRepository.list(getPrisma(), { ...target.links, ...(cursor ? { cursor } : {}), limit: input.limit }); const hasMore = rows.length > input.limit; const selected = hasMore ? rows.slice(0, input.limit) : rows; const last = selected.at(-1); return { data: selected.map(toDocumentDto), meta: { nextCursor: hasMore && last ? encodeDocumentCursor({ createdAt: last.createdAt.toISOString(), id: last.id }) : null } }; }

  async get(id: string, actor: AuthenticatedActor) { const value = await this.document(id); await this.authorizeDocument(actor, value); return toDocumentDto(value); }

  async create(input: CreateInput, upload: ParsedPdfUpload, actor: AuthenticatedActor, context: RequestContext) {
    const prisma = getPrisma();
    try {
      const initialTarget = await this.resolveTarget(prisma, input);
      this.assertPermission(actor, initialTarget.permission);
      if (!initialTarget.mutable) throw new ApiError("CONFLICT", "El contexto está cerrado o archivado y es de sólo lectura.");
      const documentId = randomUUID(); const versionId = randomUUID(); const storageKey = this.storageKey(initialTarget.storageCaseId, documentId, versionId);
      await storage.moveFromTemporary(upload.temporaryId, storageKey);
      try {
        return await prisma.$transaction(async (tx) => {
          const target = await this.resolveTarget(tx, input);
          if (!target.mutable) throw new ApiError("CONFLICT", "El contexto está cerrado o archivado y es de sólo lectura.");
          const scan = this.initialScan();
          const value = await documentRepository.createWithVersion(tx, { id: documentId, title: input.title, category: input.category, description: input.description ?? null, createdById: actor.user.id, ...(target.links.caseId ? { caseId: target.links.caseId } : {}), ...(target.links.subCaseId ? { subCaseId: target.links.subCaseId } : {}), ...(target.links.actionId ? { actionId: target.links.actionId } : {}), ...(target.links.taskId ? { taskId: target.links.taskId } : {}), ...(target.links.noteId ? { noteId: target.links.noteId } : {}) }, { id: versionId, versionNumber: 1, storageKey, originalName: upload.originalName, mimeType: upload.mimeType, sizeBytes: BigInt(upload.sizeBytes), sha256: upload.sha256, scanStatus: scan.status, scannedAt: scan.scannedAt, createdById: actor.user.id });
          await this.record(tx, actor, context, "DOCUMENT_CREATED", documentId, { category: input.category, versionId, versionNumber: 1 });
          if (scan.status === "PENDING") await outboxService.publish(tx, { type: "DOCUMENT_SCAN_REQUESTED", aggregateType: "DocumentVersion", aggregateId: versionId, payload: { documentId, versionId } });
          return toDocumentDto(value);
        });
      } catch (error) { await storage.delete(storageKey); throw error; }
    } catch (error) { await storage.deleteTemporary(upload.temporaryId); throw error; }
  }

  async addVersion(id: string, upload: ParsedPdfUpload, actor: AuthenticatedActor, context: RequestContext) {
    const prisma = getPrisma();
    try {
      const current = await this.document(id); await this.authorizeDocument(actor, current, true);
      const versionId = randomUUID(); const storageKey = this.storageKey(current.caseId, current.id, versionId);
      await storage.moveFromTemporary(upload.temporaryId, storageKey);
      try {
        return await prisma.$transaction(async (tx) => {
          await documentRepository.lock(tx, id);
          const locked = await documentRepository.find(tx, id);
          if (!locked) throw new ApiError("NOT_FOUND", "Documento no encontrado.");
          await this.authorizeDocument(actor, locked, true, tx);
          const latest = await documentRepository.latestVersionNumber(tx, id); const versionNumber = (latest._max.versionNumber ?? 0) + 1; const scan = this.initialScan();
          await documentRepository.createVersion(tx, { id: versionId, documentId: id, versionNumber, storageKey, originalName: upload.originalName, mimeType: upload.mimeType, sizeBytes: BigInt(upload.sizeBytes), sha256: upload.sha256, scanStatus: scan.status, scannedAt: scan.scannedAt, createdById: actor.user.id });
          await documentRepository.touch(tx, id);
          await this.record(tx, actor, context, "DOCUMENT_VERSION_CREATED", id, { versionId, versionNumber });
          if (scan.status === "PENDING") await outboxService.publish(tx, { type: "DOCUMENT_SCAN_REQUESTED", aggregateType: "DocumentVersion", aggregateId: versionId, payload: { documentId: id, versionId } });
          const value = await documentRepository.find(tx, id); if (!value) throw new ApiError("NOT_FOUND", "Documento no encontrado."); return toDocumentDto(value);
        });
      } catch (error) { await storage.delete(storageKey); throw error; }
    } catch (error) { await storage.deleteTemporary(upload.temporaryId); throw error; }
  }

  async update(id: string, input: { version: number; title?: string | undefined; category?: DocumentCategory | undefined; description?: string | null | undefined }, actor: AuthenticatedActor, context: RequestContext) { const current = await this.document(id); await this.authorizeDocument(actor, current, true); if (current.createdById !== actor.user.id && !actor.user.permissions.includes("documents.archive")) throw new ApiError("FORBIDDEN", "Sólo el autor o un administrador puede editar el documento."); return getPrisma().$transaction(async (tx) => { const value = await documentRepository.update(tx, id, input.version, { ...(input.title !== undefined ? { title: input.title } : {}), ...(input.category !== undefined ? { category: input.category } : {}), ...(input.description !== undefined ? { description: input.description } : {}) }); if (!value) throw new ApiError("CONFLICT", "El documento fue modificado por otra operación."); await this.record(tx, actor, context, "DOCUMENT_UPDATED", id, { version: value.version }); return toDocumentDto(value); }); }

  async archive(id: string, input: { version: number; reason: string }, actor: AuthenticatedActor, context: RequestContext) { const current = await this.document(id); await this.authorizeDocument(actor, current, true); if (!actor.user.permissions.includes("cases.archive") && current.actionId && current.versions.length === 1) throw new ApiError("FORBIDDEN", "No puede archivar la única versión asociada a una actuación."); await getPrisma().$transaction(async (tx) => { if (!await documentRepository.archive(tx, id, input.version)) throw new ApiError("CONFLICT", "El documento fue modificado por otra operación."); await this.record(tx, actor, context, "DOCUMENT_ARCHIVED", id, { reason: input.reason }); }); }

  async download(documentId: string, versionId: string | undefined, actor: AuthenticatedActor) { const document = await this.document(documentId); await this.authorizeDocument(actor, document); const version = await documentRepository.findVersion(getPrisma(), documentId, versionId); if (!version) throw new ApiError("NOT_FOUND", "Versión no encontrada."); if (version.scanStatus === "PENDING") throw new ApiError("CONFLICT", "El archivo todavía está pendiente de análisis."); if (version.scanStatus === "INFECTED") throw new ApiError("FORBIDDEN", "El archivo fue bloqueado por seguridad."); if (version.scanStatus === "FAILED") throw new ApiError("SERVICE_UNAVAILABLE", "El análisis del archivo falló."); if (!await storage.exists(version.storageKey) || await storage.size(version.storageKey) !== Number(version.sizeBytes)) throw new ApiError("SERVICE_UNAVAILABLE", "El archivo no está disponible en el storage."); return { stream: storage.openReadStream(version.storageKey), originalName: version.originalName, mimeType: version.mimeType, sizeBytes: Number(version.sizeBytes), sha256: version.sha256 }; }

  private async document(id: string) { const value = await documentRepository.find(getPrisma(), id); if (!value) throw new ApiError("NOT_FOUND", "Documento no encontrado."); return value; }
  private async authorizeDocument(actor: AuthenticatedActor, value: DocumentRow, mutable = false, database: DatabaseClient = getPrisma()) { const target = await this.resolveTarget(database, this.contextOf(value)); this.assertPermission(actor, target.permission); if (mutable && !target.mutable) throw new ApiError("CONFLICT", "El contexto está cerrado o archivado y es de sólo lectura."); }
  private contextOf(value: DocumentRow): ContextInput { if (value.actionId) return { actionId: value.actionId }; if (value.taskId) return { taskId: value.taskId }; if (value.noteId) return { noteId: value.noteId }; if (value.subCaseId) return { subCaseId: value.subCaseId }; if (value.caseId) return { caseId: value.caseId }; throw new ApiError("INTERNAL", "El documento no tiene contexto."); }
  private assertPermission(actor: AuthenticatedActor, permission: string) { if (!actor.user.permissions.includes(permission)) throw new ApiError("FORBIDDEN", "No tiene acceso al recurso relacionado."); }
  private storageKey(caseId: string | null, documentId: string, versionId: string) { return caseId ? `cases/${caseId}/${documentId}/${versionId}` : `documents/${documentId}/${versionId}`; }
  private initialScan(): { status: MalwareScanStatus; scannedAt: Date | null } { return config.MALWARE_SCAN_MODE === "clamav" ? { status: "PENDING", scannedAt: null } : { status: "SKIPPED", scannedAt: new Date() }; }
  private async resolveTarget(database: DatabaseClient, input: ContextInput): Promise<Target> {
    if (input.caseId) { const value = await documentRepository.findCase(database, input.caseId); if (!value) throw new ApiError("NOT_FOUND", "Expediente no encontrado."); return { links: { caseId: value.id }, storageCaseId: value.id, permission: "cases.read", mutable: value.status !== "ARCHIVED" }; }
    if (input.subCaseId) { const value = await documentRepository.findSubCase(database, input.subCaseId); if (!value) throw new ApiError("NOT_FOUND", "Cuaderno no encontrado."); return { links: { caseId: value.caseId, subCaseId: value.id }, storageCaseId: value.caseId, permission: "cases.read", mutable: value.status !== "CLOSED" && value.legalCase.status !== "ARCHIVED" }; }
    if (input.actionId) { const value = await documentRepository.findAction(database, input.actionId); if (!value) throw new ApiError("NOT_FOUND", "Actuación no encontrada."); return { links: { caseId: value.caseId, ...(value.subCaseId ? { subCaseId: value.subCaseId } : {}), actionId: value.id }, storageCaseId: value.caseId, permission: "cases.read", mutable: value.legalCase.status !== "ARCHIVED" && value.subCase?.status !== "CLOSED" }; }
    if (input.taskId) { const value = await documentRepository.findTask(database, input.taskId); if (!value) throw new ApiError("NOT_FOUND", "Tarea no encontrada."); return { links: { ...(value.caseId ? { caseId: value.caseId } : {}), ...(value.subCaseId ? { subCaseId: value.subCaseId } : {}), taskId: value.id }, storageCaseId: value.caseId, permission: "tasks.read", mutable: value.legalCase?.status !== "ARCHIVED" }; }
    if (input.noteId) { const value = await documentRepository.findNote(database, input.noteId); if (!value) throw new ApiError("NOT_FOUND", "Nota no encontrada."); const caseId = value.caseId ?? value.subCase?.caseId ?? null; return { links: { ...(caseId ? { caseId } : {}), ...(value.subCaseId ? { subCaseId: value.subCaseId } : {}), noteId: value.id }, storageCaseId: caseId, permission: value.contactId && !caseId ? "contacts.read" : "notes.read", mutable: value.legalCase?.status !== "ARCHIVED" && value.subCase?.legalCase.status !== "ARCHIVED" }; }
    throw new ApiError("VALIDATION_ERROR", "Debe indicar un contexto para el documento.");
  }
  private async record(tx: Prisma.TransactionClient, actor: AuthenticatedActor, context: RequestContext, action: string, id: string, after: Prisma.InputJsonValue) { await auditService.record(tx, { actorId: actor.user.id, action, entityType: "Document", entityId: id, after, ...metadata(context) }); await outboxService.publish(tx, { type: action, aggregateType: "Document", aggregateId: id, payload: { documentId: id } }); }
}
export const documentService = new DocumentService();

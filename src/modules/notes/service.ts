import { getPrisma } from "../../database/prisma.js";
import { ApiError } from "../../shared/http/errors.js";
import { auditService } from "../audit/service.js";
import type { AuthenticatedActor, RequestContext } from "../auth/types.js";
import { outboxService } from "../outbox/service.js";
import { toNoteDto } from "./mapper.js";
import { noteRepository } from "./repo.js";

type NoteContext = { caseId?: string | undefined; subCaseId?: string | undefined; contactId?: string | undefined };

export class NoteService {
  async list(input: NoteContext & { cursor?: string | undefined; limit: number }) {
    const cursor = input.cursor ? this.decode(input.cursor) : undefined;
    const rows = await noteRepository.list(getPrisma(), {
      limit: input.limit,
      ...(input.caseId ? { caseId: input.caseId } : {}),
      ...(input.subCaseId ? { subCaseId: input.subCaseId } : {}),
      ...(input.contactId ? { contactId: input.contactId } : {}),
      ...(cursor ? { cursor } : {}),
    });
    const hasMore = rows.length > input.limit;
    const selected = hasMore ? rows.slice(0, input.limit) : rows;
    const last = selected.at(-1);
    return {
      data: selected.map(toNoteDto),
      meta: { nextCursor: hasMore && last ? Buffer.from(JSON.stringify({ at: last.createdAt.toISOString(), id: last.id })).toString("base64url") : null },
    };
  }

  async create(input: NoteContext & { content: string }, actor: AuthenticatedActor, context: RequestContext) {
    const links = await this.validate(input);
    return getPrisma().$transaction(async (tx) => {
      const value = await noteRepository.create(tx, { content: input.content, authorId: actor.user.id, ...links });
      await auditService.record(tx, {
        actorId: actor.user.id, action: "NOTE_CREATED", entityType: "Note", entityId: value.id,
        after: { context: links },
        ...(context.requestId ? { requestId: context.requestId } : {}),
        ...(context.ipAddress ? { ipAddress: context.ipAddress } : {}),
        ...(context.userAgent ? { userAgent: context.userAgent } : {}),
      });
      await outboxService.publish(tx, { type: "NOTE_CREATED", aggregateType: "Note", aggregateId: value.id, payload: { noteId: value.id } });
      return toNoteDto(value);
    });
  }

  private async validate(input: NoteContext): Promise<{ caseId?: string; subCaseId?: string; contactId?: string }> {
    if (input.caseId) {
      const value = await noteRepository.legalCase(getPrisma(), input.caseId);
      if (!value) throw new ApiError("NOT_FOUND", "Expediente no encontrado.");
      if (value.status === "ARCHIVED") throw new ApiError("CONFLICT", "El expediente archivado es de sólo lectura.");
      return { caseId: value.id };
    }
    if (input.subCaseId) {
      const value = await noteRepository.subcase(getPrisma(), input.subCaseId);
      if (!value) throw new ApiError("NOT_FOUND", "Cuaderno no encontrado.");
      if (value.legalCase.status === "ARCHIVED") throw new ApiError("CONFLICT", "El expediente archivado es de sólo lectura.");
      return { caseId: value.caseId, subCaseId: value.id };
    }
    if (input.contactId) {
      if (!await noteRepository.contact(getPrisma(), input.contactId)) throw new ApiError("NOT_FOUND", "Contacto no encontrado.");
      return { contactId: input.contactId };
    }
    throw new ApiError("VALIDATION_ERROR", "La nota requiere contexto.");
  }

  private decode(value: string) {
    try {
      const parsed = JSON.parse(Buffer.from(value, "base64url").toString()) as { at?: unknown; id?: unknown };
      if (typeof parsed.at !== "string" || typeof parsed.id !== "string") throw new Error("shape");
      const at = new Date(parsed.at);
      if (Number.isNaN(at.getTime())) throw new Error("date");
      return { at, id: parsed.id };
    } catch {
      throw new ApiError("VALIDATION_ERROR", "Cursor inválido.");
    }
  }
}
export const noteService = new NoteService();

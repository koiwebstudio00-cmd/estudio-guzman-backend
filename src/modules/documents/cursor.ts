import { ApiError } from "../../shared/http/errors.js";

interface DocumentCursor { createdAt: string; id: string }
export const encodeDocumentCursor = (value: DocumentCursor) => Buffer.from(JSON.stringify(value)).toString("base64url");
export function decodeDocumentCursor(value?: string) {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Partial<DocumentCursor>;
    if (typeof parsed.createdAt !== "string" || Number.isNaN(Date.parse(parsed.createdAt)) || typeof parsed.id !== "string") throw new Error("invalid");
    return { createdAt: parsed.createdAt, id: parsed.id };
  } catch { throw new ApiError("VALIDATION_ERROR", "El cursor de documentos es inválido."); }
}

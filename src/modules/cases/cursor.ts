import { ApiError } from "../../shared/http/errors.js";

export interface CaseCursor { updatedAt: string; id: string }
export const encodeCaseCursor = (cursor: CaseCursor) => Buffer.from(JSON.stringify(cursor)).toString("base64url");
export function decodeCaseCursor(value?: string) {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Partial<CaseCursor>;
    if (typeof parsed.updatedAt !== "string" || Number.isNaN(Date.parse(parsed.updatedAt)) || typeof parsed.id !== "string") throw new Error("invalid");
    return { updatedAt: parsed.updatedAt, id: parsed.id };
  } catch { throw new ApiError("VALIDATION_ERROR", "El cursor de expedientes es inválido."); }
}

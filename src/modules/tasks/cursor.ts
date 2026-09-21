import { ApiError } from "../../shared/http/errors.js";
interface Cursor { updatedAt: string; id: string }
export const encodeTaskCursor = (value: Cursor) => Buffer.from(JSON.stringify(value)).toString("base64url");
export function decodeTaskCursor(value?: string) { if (!value) return undefined; try { const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Partial<Cursor>; if (typeof parsed.updatedAt !== "string" || Number.isNaN(Date.parse(parsed.updatedAt)) || typeof parsed.id !== "string") throw new Error(); return { updatedAt: parsed.updatedAt, id: parsed.id }; } catch { throw new ApiError("VALIDATION_ERROR", "El cursor de tareas es inválido."); } }

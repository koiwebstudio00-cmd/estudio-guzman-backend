import { ApiError } from "../../shared/http/errors.js";
export interface TimelineCursor { at: string; key: string }
export const encodeTimelineCursor = (value: TimelineCursor) => Buffer.from(JSON.stringify(value)).toString("base64url");
export function decodeTimelineCursor(value?: string) { if (!value) return undefined; try { const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Partial<TimelineCursor>; if (typeof parsed.at !== "string" || Number.isNaN(Date.parse(parsed.at)) || typeof parsed.key !== "string") throw new Error("invalid"); return { at: parsed.at, key: parsed.key }; } catch { throw new ApiError("VALIDATION_ERROR", "El cursor de timeline es inválido."); } }

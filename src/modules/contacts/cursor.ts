import { ApiError } from "../../shared/http/errors.js";

export interface ContactCursor { name: string; id: string }
export function encodeContactCursor(cursor: ContactCursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}
export function decodeContactCursor(value: string | undefined): ContactCursor | undefined {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as unknown;
    if (!parsed || typeof parsed !== "object" || !("name" in parsed) || !("id" in parsed) || typeof parsed.name !== "string" || typeof parsed.id !== "string") throw new Error();
    return { name: parsed.name, id: parsed.id };
  } catch {
    throw new ApiError("VALIDATION_ERROR", "El cursor es inválido.");
  }
}

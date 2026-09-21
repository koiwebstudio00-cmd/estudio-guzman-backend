import { createHash } from "node:crypto";
import path from "node:path";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import Busboy from "busboy";
import type { Request } from "express";
import { config } from "../../config.js";
import { ApiError } from "../../shared/http/errors.js";
import { storage } from "../../shared/storage/local-storage.js";

export interface ParsedPdfUpload {
  temporaryId: string;
  originalName: string;
  mimeType: "application/pdf";
  sizeBytes: number;
  sha256: string;
}

export interface ParsedMultipartUpload {
  fields: Record<string, string>;
  file: ParsedPdfUpload;
}

const safeName = (value: string) => {
  const basename = path.posix.basename(value.replaceAll("\\", "/")).normalize("NFKC");
  const cleaned = [...basename].filter((character) => character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127).join("").trim().slice(0, 255);
  if (!cleaned || path.extname(cleaned).toLowerCase() !== ".pdf") throw new ApiError("VALIDATION_ERROR", "El archivo debe tener extensión .pdf.");
  return cleaned;
};

export async function parsePdfMultipart(req: Request): Promise<ParsedMultipartUpload> {
  if (!req.is("multipart/form-data")) throw new ApiError("VALIDATION_ERROR", "Se esperaba multipart/form-data.");
  const fields: Record<string, string> = {};
  let uploadPromise: Promise<ParsedPdfUpload> | null = null;
  let temporaryId: string | null = null;

  try {
    const result = await new Promise<ParsedMultipartUpload>((resolve, reject) => {
      let formError: ApiError | null = null;
      let parser: ReturnType<typeof Busboy>;
      try {
        parser = Busboy({ headers: req.headers, limits: { files: 1, fields: 12, fileSize: config.MAX_FILE_SIZE_BYTES, fieldSize: 20_000 } });
      } catch {
        reject(new ApiError("VALIDATION_ERROR", "Multipart inválido."));
        return;
      }

      parser.on("field", (name, value, info) => {
        if (info.valueTruncated) { formError = new ApiError("PAYLOAD_TOO_LARGE", "Un campo del formulario excede el límite."); return; }
        fields[name] = value;
      });

      parser.on("file", (name, file, info) => {
        if (name !== "file" || uploadPromise) { file.resume(); formError = new ApiError("VALIDATION_ERROR", "Debe enviarse un único archivo en el campo file."); return; }
        let originalName: string;
        try {
          if (info.mimeType.toLowerCase() !== "application/pdf") throw new ApiError("VALIDATION_ERROR", "El Content-Type del archivo debe ser application/pdf.");
          originalName = safeName(info.filename);
        } catch (error) {
          file.resume();
          const rejected = Promise.reject(error);
          void rejected.catch(() => undefined);
          uploadPromise = rejected;
          return;
        }
        const pending: Promise<ParsedPdfUpload> = (async () => {
          const temporary = await storage.createTemporary();
          temporaryId = temporary.id;
          const hash = createHash("sha256");
          let sizeBytes = 0;
          let tooLarge = false;
          let prefix = Buffer.alloc(0);
          let tail = Buffer.alloc(0);
          let scanCarry = Buffer.alloc(0);
          let encrypted = false;
          file.once("limit", () => { tooLarge = true; });
          const inspector = new Transform({
            transform(chunk: Buffer, _encoding, callback) {
              sizeBytes += chunk.length;
              hash.update(chunk);
              if (prefix.length < 1_024) prefix = Buffer.concat([prefix, chunk]).subarray(0, 1_024);
              tail = Buffer.concat([tail, chunk]).subarray(-8_192);
              const scan = Buffer.concat([scanCarry, chunk]);
              if (scan.includes(Buffer.from("/Encrypt", "ascii"))) encrypted = true;
              scanCarry = scan.subarray(-16);
              callback(null, chunk);
            }
          });
          await pipeline(file, inspector, temporary.writable);
          if (tooLarge || sizeBytes > config.MAX_FILE_SIZE_BYTES) throw new ApiError("PAYLOAD_TOO_LARGE", `El PDF supera el máximo de ${config.MAX_FILE_SIZE_MB} MB.`);
          if (sizeBytes === 0 || prefix.indexOf(Buffer.from("%PDF-", "ascii")) < 0 || !tail.includes(Buffer.from("%%EOF", "ascii"))) throw new ApiError("VALIDATION_ERROR", "El archivo no es un PDF válido o está incompleto.");
          if (encrypted) throw new ApiError("VALIDATION_ERROR", "Los PDF cifrados no están permitidos.");
          return { temporaryId: temporary.id, originalName, mimeType: "application/pdf", sizeBytes, sha256: hash.digest("hex") };
        })();
        void pending.catch(() => undefined);
        uploadPromise = pending;
      });

      parser.once("filesLimit", () => { formError = new ApiError("VALIDATION_ERROR", "Sólo se admite un archivo por solicitud."); });
      parser.once("fieldsLimit", () => { formError = new ApiError("VALIDATION_ERROR", "El formulario contiene demasiados campos."); });
      parser.once("error", () => reject(new ApiError("VALIDATION_ERROR", "No se pudo procesar el multipart.")));
      req.once("aborted", () => reject(new ApiError("VALIDATION_ERROR", "El upload fue interrumpido.")));
      parser.once("close", () => {
        if (!uploadPromise) { reject(new ApiError("VALIDATION_ERROR", "El archivo PDF es obligatorio.")); return; }
        void uploadPromise.then((file) => { if (formError) reject(formError); else resolve({ fields, file }); }).catch(reject);
      });
      req.pipe(parser);
    });
    return result;
  } catch (error) {
    const pendingUpload = uploadPromise as unknown as Promise<ParsedPdfUpload> | null;
    if (pendingUpload) await pendingUpload.catch(() => undefined);
    if (temporaryId) await storage.deleteTemporary(temporaryId);
    throw error;
  }
}

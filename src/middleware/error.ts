import type { ErrorRequestHandler, RequestHandler } from "express";
import { ZodError } from "zod";
import { ApiError } from "../shared/http/errors.js";

function problemType(code: string): string {
  return `https://api.estudioguzman.local/problems/${code.toLowerCase().replaceAll("_", "-")}`;
}

export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).type("application/problem+json").json({
    type: problemType("NOT_FOUND"),
    title: "Recurso no encontrado",
    status: 404,
    detail: "La ruta solicitada no existe.",
    instance: req.originalUrl,
    requestId: req.id
  });
};

export const errorHandler: ErrorRequestHandler = (error, req, res, _next) => {
  if (typeof error === "object" && error !== null && "type" in error && error.type === "entity.too.large") {
    res.status(413).type("application/problem+json").json({ type: problemType("PAYLOAD_TOO_LARGE"), title: "Payload demasiado grande", status: 413, detail: "El cuerpo de la solicitud supera el límite permitido.", instance: req.originalUrl, requestId: req.id }); return;
  }
  if (typeof error === "object" && error !== null && "type" in error && error.type === "entity.parse.failed") {
    res.status(400).type("application/problem+json").json({ type: problemType("INVALID_JSON"), title: "JSON inválido", status: 400, detail: "El cuerpo JSON no se pudo interpretar.", instance: req.originalUrl, requestId: req.id }); return;
  }
  if (error instanceof ZodError) {
    res.status(400).type("application/problem+json").json({
      type: problemType("VALIDATION_ERROR"),
      title: "Datos inválidos",
      status: 400,
      detail: "Revisá los campos enviados.",
      instance: req.originalUrl,
      requestId: req.id,
      errors: error.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message
      }))
    });
    return;
  }

  if (error instanceof ApiError) {
    res.status(error.status).type("application/problem+json").json({
      type: problemType(error.code),
      title: error.code,
      status: error.status,
      detail: error.message,
      instance: req.originalUrl,
      requestId: req.id,
      ...(error.issues ? { errors: error.issues } : {})
    });
    return;
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  ) {
    res.status(409).type("application/problem+json").json({
      type: problemType("CONFLICT"),
      title: "CONFLICT",
      status: 409,
      detail: "Ya existe un registro con esos datos únicos.",
      instance: req.originalUrl,
      requestId: req.id
    });
    return;
  }

  req.log.error({ err: error, requestId: req.id }, "Unhandled request error");
  res.status(500).type("application/problem+json").json({
    type: problemType("INTERNAL"),
    title: "Error interno",
    status: 500,
    detail: "Ocurrió un error interno del servidor.",
    instance: req.originalUrl,
    requestId: req.id
  });
};

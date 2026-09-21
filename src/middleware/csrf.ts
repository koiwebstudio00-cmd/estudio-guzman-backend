import type { RequestHandler } from "express";
import { ApiError } from "../shared/http/errors.js";
import { isAllowedOrigin } from "../shared/http/origin.js";
import { sessionService } from "../modules/auth/session.service.js";

export const csrfProtection: RequestHandler = (req, _res, next) => {
  try {
    if (!req.auth) throw new ApiError("UNAUTHORIZED", "Sesión inválida o vencida.");
    if (!isAllowedOrigin(req.get("origin"))) {
      throw new ApiError("FORBIDDEN", "Origen no permitido.");
    }
    sessionService.verifyCsrf(req.auth, req.get("x-csrf-token"));
    next();
  } catch (error) {
    next(error);
  }
};

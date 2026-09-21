import type { RequestHandler } from "express";
import { ApiError } from "../shared/http/errors.js";
import { authorizationService } from "../modules/authorization/service.js";

export function requirePermission(permission: string): RequestHandler {
  return (req, _res, next) => {
    try {
      if (!req.auth) throw new ApiError("UNAUTHORIZED", "Sesión inválida o vencida.");
      authorizationService.requirePermission(req.auth, permission);
      next();
    } catch (error) {
      next(error);
    }
  };
}

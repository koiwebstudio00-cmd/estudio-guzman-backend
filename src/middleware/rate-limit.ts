import { rateLimit } from "express-rate-limit";
import { config } from "../config.js";
import { ApiError } from "../shared/http/errors.js";

export function createLoginRateLimit() {
  return rateLimit({
    windowMs: config.LOGIN_RATE_LIMIT_MINUTES * 60_000,
    limit: config.LOGIN_RATE_LIMIT_MAX,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler(_req, _res, next) {
      next(new ApiError("RATE_LIMITED", "Demasiados intentos. Probá nuevamente más tarde."));
    }
  });
}

export function createUploadRateLimit() {
  return rateLimit({
    windowMs: config.UPLOAD_RATE_LIMIT_MINUTES * 60_000,
    limit: config.UPLOAD_RATE_LIMIT_MAX,
    keyGenerator(req) { return req.auth?.user.id ?? "anonymous"; },
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler(_req, _res, next) { next(new ApiError("RATE_LIMITED", "Demasiados uploads. Probá nuevamente más tarde.")); }
  });
}

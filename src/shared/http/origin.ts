import type { RequestHandler } from "express";
import { config } from "../../config.js";
import { ApiError } from "./errors.js";

export function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) return false;
  return config.CORS_ORIGINS.includes(origin);
}

export const requireAllowedOrigin: RequestHandler = (req, _res, next) => {
  const origin = req.get("origin");

  if (!isAllowedOrigin(origin)) {
    next(new ApiError("FORBIDDEN", "Origen no permitido."));
    return;
  }

  next();
};

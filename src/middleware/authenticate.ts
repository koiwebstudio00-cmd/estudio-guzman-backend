import type { RequestHandler } from "express";
import { config } from "../config.js";
import { sessionService } from "../modules/auth/session.service.js";

export const authenticate: RequestHandler = async (req, _res, next) => {
  try {
    req.auth = await sessionService.authenticate(req.cookies?.[config.SESSION_COOKIE_NAME]);
    next();
  } catch (error) {
    next(error);
  }
};

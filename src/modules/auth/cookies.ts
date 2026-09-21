import type { CookieOptions, Response } from "express";
import { config } from "../../config.js";

function baseCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: config.COOKIE_SECURE,
    sameSite: config.COOKIE_SAMESITE,
    path: "/api/v1",
    ...(config.COOKIE_DOMAIN ? { domain: config.COOKIE_DOMAIN } : {})
  };
}

export function setSessionCookie(res: Response, token: string, expiresAt: Date): void {
  res.cookie(config.SESSION_COOKIE_NAME, token, {
    ...baseCookieOptions(),
    expires: expiresAt
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(config.SESSION_COOKIE_NAME, baseCookieOptions());
}

import { Router, type Request } from "express";
import { config } from "../../config.js";
import { authenticate } from "../../middleware/authenticate.js";
import { csrfProtection } from "../../middleware/csrf.js";
import { createLoginRateLimit } from "../../middleware/rate-limit.js";
import { validateRequest } from "../../middleware/validate.js";
import { ApiError } from "../../shared/http/errors.js";
import { requireAllowedOrigin } from "../../shared/http/origin.js";
import { userService } from "../users/service.js";
import { authService } from "./auth.service.js";
import { clearSessionCookie, setSessionCookie } from "./cookies.js";
import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  resetPasswordSchema,
  updateOwnProfileSchema
} from "./schemas.js";
import { sessionService } from "./session.service.js";
import type { RequestContext } from "./types.js";

function requestContext(req: Request): RequestContext {
  const userAgent = req.get("user-agent");
  return {
    ...(typeof req.id === "string" ? { requestId: req.id } : {}),
    ...(req.ip ? { ipAddress: req.ip } : {}),
    ...(userAgent ? { userAgent: userAgent.slice(0, 2_000) } : {})
  };
}

function actor(req: Request) {
  if (!req.auth) throw new ApiError("UNAUTHORIZED", "Sesión inválida o vencida.");
  return req.auth;
}

export function createAuthRoutes(): Router {
  const router = Router();
  const loginRateLimit = createLoginRateLimit();

  router.post(
    "/auth/login",
    requireAllowedOrigin,
    loginRateLimit,
    validateRequest({ body: loginSchema }, async (req, res, { body }) => {
      const result = await authService.login(body.email, body.password, requestContext(req));
      setSessionCookie(res, result.sessionToken, result.expiresAt);
      res.status(200).json({ data: { user: result.user, csrfToken: result.csrfToken } });
    })
  );

  router.get("/auth/me", authenticate, (req, res) => {
    res.json({ data: { user: actor(req).user } });
  });

  router.patch(
    "/auth/me",
    authenticate,
    csrfProtection,
    validateRequest({ body: updateOwnProfileSchema }, async (req, res, { body }) => {
      const user = await userService.updateOwnProfile(body, actor(req), requestContext(req));
      res.json({ data: { user } });
    })
  );

  router.get("/auth/csrf", authenticate, (req, res) => {
    const sessionToken = req.cookies?.[config.SESSION_COOKIE_NAME];
    if (typeof sessionToken !== "string") {
      throw new ApiError("UNAUTHORIZED", "Sesión inválida o vencida.");
    }
    const csrfToken = sessionService.issueCsrf(actor(req), sessionToken);
    res.json({ data: { csrfToken } });
  });

  router.post("/auth/logout", authenticate, csrfProtection, async (req, res) => {
    try {
      await authService.logout(actor(req), requestContext(req));
    } finally {
      clearSessionCookie(res);
    }
    res.status(204).end();
  });

  router.post("/auth/logout-all", authenticate, csrfProtection, async (req, res) => {
    try {
      await authService.logoutAll(actor(req), requestContext(req));
    } finally {
      clearSessionCookie(res);
    }
    res.status(204).end();
  });

  router.post(
    "/auth/forgot-password",
    requireAllowedOrigin,
    loginRateLimit,
    validateRequest({ body: forgotPasswordSchema }, async (req, res, { body }) => {
      await authService.forgotPassword(body.email, requestContext(req));
      res.status(202).json({
        data: {
          message: "Si el email corresponde a una cuenta activa, vas a recibir instrucciones."
        }
      });
    })
  );

  router.post(
    "/auth/reset-password",
    requireAllowedOrigin,
    validateRequest({ body: resetPasswordSchema }, async (req, res, { body }) => {
      await authService.resetPassword(body.token, body.password, requestContext(req));
      res.status(204).end();
    })
  );

  router.post(
    "/auth/change-password",
    authenticate,
    csrfProtection,
    loginRateLimit,
    validateRequest({ body: changePasswordSchema }, async (req, res, { body }) => {
      await authService.changePassword(
        body.currentPassword,
        body.newPassword,
        actor(req),
        requestContext(req)
      );
      clearSessionCookie(res);
      res.status(204).end();
    })
  );

  return router;
}

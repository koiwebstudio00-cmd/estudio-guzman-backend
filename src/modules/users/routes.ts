import { Router, type Request } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { requirePermission } from "../../middleware/authorize.js";
import { csrfProtection } from "../../middleware/csrf.js";
import { validateRequest } from "../../middleware/validate.js";
import { ApiError } from "../../shared/http/errors.js";
import type { RequestContext } from "../auth/types.js";
import {
  createUserSchema,
  listUsersQuerySchema,
  updateUserSchema,
  userIdParamsSchema
} from "./schemas.js";
import { userService } from "./service.js";

function context(req: Request): RequestContext {
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

export function createUserRoutes(): Router {
  const router = Router();
  router.use("/users", authenticate);

  router.get(
    "/users",
    requirePermission("users.read"),
    validateRequest({ query: listUsersQuerySchema }, async (_req, res, { query }) => {
      res.json({ data: await userService.list(query) });
    })
  );
  router.post(
    "/users",
    requirePermission("users.manage"),
    csrfProtection,
    validateRequest({ body: createUserSchema }, async (req, res, { body }) => {
      const user = await userService.create(body, actor(req), context(req));
      res.status(201).json({ data: user });
    })
  );
  router.get(
    "/users/:userId",
    requirePermission("users.read"),
    validateRequest({ params: userIdParamsSchema }, async (_req, res, { params }) => {
      res.json({ data: await userService.get(params.userId) });
    })
  );
  router.patch(
    "/users/:userId",
    requirePermission("users.manage"),
    csrfProtection,
    validateRequest(
      { params: userIdParamsSchema, body: updateUserSchema },
      async (req, res, { params, body }) => {
        res.json({ data: await userService.update(params.userId, body, actor(req), context(req)) });
      }
    )
  );
  router.post(
    "/users/:userId/reset-password",
    requirePermission("users.manage"),
    csrfProtection,
    validateRequest({ params: userIdParamsSchema }, async (req, res, { params }) => {
      await userService.issuePasswordReset(params.userId, actor(req), context(req));
      res.status(202).json({ data: { message: "Recuperación generada." } });
    })
  );
  router.post(
    "/users/:userId/revoke-sessions",
    requirePermission("users.manage"),
    csrfProtection,
    validateRequest({ params: userIdParamsSchema }, async (req, res, { params }) => {
      await userService.revokeSessions(params.userId, actor(req), context(req));
      res.status(204).end();
    })
  );
  return router;
}

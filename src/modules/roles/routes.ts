import { Router, type Request } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { requirePermission } from "../../middleware/authorize.js";
import { csrfProtection } from "../../middleware/csrf.js";
import { validateRequest } from "../../middleware/validate.js";
import { ApiError } from "../../shared/http/errors.js";
import type { RequestContext } from "../auth/types.js";
import {
  createRoleSchema,
  roleIdParamsSchema,
  updateRolePermissionsSchema,
  updateRoleSchema
} from "./schemas.js";
import { roleService } from "./service.js";

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

export function createRoleRoutes(): Router {
  const router = Router();
  router.use("/roles", authenticate);
  router.get("/roles", requirePermission("roles.read"), async (_req, res) => {
    res.json({ data: await roleService.list() });
  });
  router.post(
    "/roles",
    requirePermission("roles.manage"),
    csrfProtection,
    validateRequest({ body: createRoleSchema }, async (req, res, { body }) => {
      res.status(201).json({ data: await roleService.create(body, actor(req), context(req)) });
    })
  );
  router.patch(
    "/roles/:roleId",
    requirePermission("roles.manage"),
    csrfProtection,
    validateRequest(
      { params: roleIdParamsSchema, body: updateRoleSchema },
      async (req, res, { params, body }) => {
        res.json({ data: await roleService.update(params.roleId, body, actor(req), context(req)) });
      }
    )
  );
  router.patch(
    "/roles/:roleId/permissions",
    requirePermission("roles.manage"),
    csrfProtection,
    validateRequest(
      { params: roleIdParamsSchema, body: updateRolePermissionsSchema },
      async (req, res, { params, body }) => {
        res.json({
          data: await roleService.replacePermissions(
            params.roleId,
            body.permissionCodes,
            actor(req),
            context(req)
          )
        });
      }
    )
  );
  return router;
}

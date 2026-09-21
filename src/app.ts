import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { config } from "./config.js";
import { errorHandler, notFoundHandler } from "./middleware/error.js";
import { createAuthRoutes } from "./modules/auth/routes.js";
import { healthRoutes } from "./modules/health/routes.js";
import { createRoleRoutes } from "./modules/roles/routes.js";
import { createUserRoutes } from "./modules/users/routes.js";
import { createContactRoutes } from "./modules/contacts/routes.js";
import { createCatalogRoutes } from "./modules/catalogs/routes.js";
import { createCaseRoutes } from "./modules/cases/routes.js";
import { createSubCaseRoutes } from "./modules/subcases/routes.js";
import { createActionRoutes } from "./modules/actions/routes.js";
import { createDocumentRoutes } from "./modules/documents/routes.js";
import { createTaskRoutes } from "./modules/tasks/routes.js";
import { createNoteRoutes } from "./modules/notes/routes.js";
import { createDashboardRoutes } from "./modules/dashboard/routes.js";
import { createSearchRoutes } from "./modules/search/routes.js";
import { createNotificationRoutes } from "./modules/notifications/routes.js";
import { createFeedbackRoutes } from "./modules/feedback/routes.js";
import { createAuditRoutes } from "./modules/audit/routes.js";
import { ApiError } from "./shared/http/errors.js";
import { isAllowedOrigin } from "./shared/http/origin.js";
import { requestLogger } from "./shared/logging/logger.js";

function corsOriginAllowed(origin: string | undefined): boolean {
  if (!origin) return true;
  if (isAllowedOrigin(origin)) return true;
  return config.NODE_ENV !== "production" && config.CORS_ORIGINS.length === 0;
}

export function buildApp() {
  const app = express();

  app.disable("x-powered-by");
  app.set("trust proxy", config.TRUST_PROXY);
  app.use(requestLogger());
  app.use(helmet());
  app.use(
    cors({
      credentials: true,
      origin(origin, callback) {
        if (corsOriginAllowed(origin)) {
          callback(null, true);
          return;
        }
        callback(new ApiError("FORBIDDEN", "Origen no permitido."));
      }
    })
  );
  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser());

  const api = express.Router();
  api.use(healthRoutes);
  api.use(createAuthRoutes());
  api.use(createUserRoutes());
  api.use(createRoleRoutes());
  api.use(createContactRoutes());
  api.use(createCatalogRoutes());
  api.use(createCaseRoutes());
  api.use(createSubCaseRoutes());
  api.use(createActionRoutes());
  api.use(createDocumentRoutes());
  api.use(createTaskRoutes());
  api.use(createNoteRoutes());
  api.use(createDashboardRoutes());
  api.use(createSearchRoutes());
  api.use(createNotificationRoutes());
  api.use(createFeedbackRoutes());
  api.use(createAuditRoutes());
  app.use("/api/v1", api);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

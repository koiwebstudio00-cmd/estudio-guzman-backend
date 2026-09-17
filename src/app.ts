import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { config } from "./config.js";
import { errorHandler, notFoundHandler } from "./middleware/error.js";
import { healthRoutes } from "./modules/health/routes.js";
import { ApiError } from "./shared/http/errors.js";
import { requestLogger } from "./shared/logging/logger.js";

function corsOriginAllowed(origin: string | undefined): boolean {
  if (!origin) return true;
  if (config.CORS_ORIGINS.includes(origin)) return true;
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
  app.use("/api/v1", api);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

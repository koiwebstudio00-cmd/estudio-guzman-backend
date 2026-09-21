import { randomUUID } from "node:crypto";
import pino from "pino";
import type { DestinationStream } from "pino";
import { pinoHttp } from "pino-http";
import { config } from "../../config.js";

export const LOG_REDACT_PATHS = [
      "req.headers.authorization",
      "req.headers.cookie",
      "req.headers['x-api-key']",
      "password",
      "passwordHash",
      "token",
      "csrfToken",
      "resetToken",
      "accessToken",
      "sessionToken",
      "*.password",
      "*.passwordHash",
      "*.token",
      "*.csrfToken",
      "*.resetToken",
      "*.accessToken",
      "*.sessionToken",
      "req.body.password",
      "req.body.token"
] as const;

export function createLogger(destination?: DestinationStream) {
  const options = {
    level: config.LOG_LEVEL,
    base: null,
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: {
      paths: [...LOG_REDACT_PATHS],
      censor: "[REDACTED]"
    }
  };
  return destination ? pino(options, destination) : pino(options);
}

export const logger = createLogger();

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function requestLogger() {
  return pinoHttp({
    logger,
    genReqId(req, res) {
      const incoming = req.headers["x-request-id"];
      const id = typeof incoming === "string" && UUID_PATTERN.test(incoming) ? incoming : randomUUID();
      res.setHeader("x-request-id", id);
      return id;
    },
    autoLogging: {
      ignore: (req) => req.url?.split("?")[0] === "/api/v1/health/live"
    },
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url,
          remoteAddress: req.remoteAddress
        };
      },
      res(res) {
        return { statusCode: res.statusCode };
      }
    }
  });
}

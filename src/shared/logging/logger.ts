import { randomUUID } from "node:crypto";
import pino from "pino";
import { pinoHttp } from "pino-http";
import { config } from "../../config.js";

export const logger = pino({
  level: config.LOG_LEVEL,
  base: null,
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "req.headers['x-api-key']",
      "password",
      "token",
      "accessToken",
      "sessionToken"
    ],
    censor: "[REDACTED]"
  }
});

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

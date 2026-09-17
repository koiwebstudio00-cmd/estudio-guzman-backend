import "dotenv/config";
import path from "node:path";
import { z } from "zod";

const booleanValue = z.preprocess((value) => {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return value;
}, z.boolean());

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    HOST: z.string().default("0.0.0.0"),
    PORT: z.coerce.number().int().min(1).max(65_535).default(3001),
    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
    TRUST_PROXY: z.coerce.number().int().min(0).default(1),
    DATABASE_URL: z.string().min(1, "DATABASE_URL es obligatoria."),
    CORS_ORIGIN: z.string().default(""),
    COOKIE_SECURE: booleanValue.default(false),
    COOKIE_SAMESITE: z.enum(["lax", "none", "strict"]).default("lax"),
    COOKIE_DOMAIN: z.string().trim().optional(),
    SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),
    SESSION_IDLE_MINUTES: z.coerce.number().int().min(15).max(43_200).default(480),
    STORAGE_ROOT: z.string().min(1).default("./storage"),
    MAX_FILE_SIZE_MB: z.coerce.number().int().min(1).max(500).default(50)
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === "production" && !env.CORS_ORIGIN.trim()) {
      ctx.addIssue({
        code: "custom",
        path: ["CORS_ORIGIN"],
        message: "CORS_ORIGIN es obligatorio en producción."
      });
    }
    if (env.NODE_ENV === "production" && !env.COOKIE_SECURE) {
      ctx.addIssue({
        code: "custom",
        path: ["COOKIE_SECURE"],
        message: "COOKIE_SECURE debe ser true en producción."
      });
    }
    if (env.COOKIE_SAMESITE === "none" && !env.COOKIE_SECURE) {
      ctx.addIssue({
        code: "custom",
        path: ["COOKIE_SAMESITE"],
        message: "SameSite=None requiere cookies Secure."
      });
    }
    if (env.NODE_ENV === "production" && !path.isAbsolute(env.STORAGE_ROOT)) {
      ctx.addIssue({
        code: "custom",
        path: ["STORAGE_ROOT"],
        message: "STORAGE_ROOT debe ser absoluto en producción."
      });
    }
  });

const env = envSchema.parse(process.env);

export const config = {
  ...env,
  COOKIE_DOMAIN: env.COOKIE_DOMAIN || undefined,
  CORS_ORIGINS: env.CORS_ORIGIN.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
  STORAGE_ROOT: path.resolve(env.STORAGE_ROOT),
  MAX_FILE_SIZE_BYTES: env.MAX_FILE_SIZE_MB * 1024 * 1024
} as const;

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
    SESSION_COOKIE_NAME: z.string().trim().min(1).default("eg_session"),
    LOGIN_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(20).default(5),
    LOGIN_LOCK_MINUTES: z.coerce.number().int().min(1).max(1_440).default(15),
    LOGIN_RATE_LIMIT_MAX: z.coerce.number().int().min(1).max(1_000).default(10),
    LOGIN_RATE_LIMIT_MINUTES: z.coerce.number().int().min(1).max(1_440).default(15),
    UPLOAD_RATE_LIMIT_MAX: z.coerce.number().int().min(1).max(1_000).default(20),
    UPLOAD_RATE_LIMIT_MINUTES: z.coerce.number().int().min(1).max(1_440).default(15),
    PASSWORD_RESET_TTL_MINUTES: z.coerce.number().int().min(5).max(1_440).default(30),
    ARGON2_MEMORY_KIB: z.coerce.number().int().min(19_456).max(1_048_576).default(65_536),
    ARGON2_TIME_COST: z.coerce.number().int().min(2).max(10).default(3),
    ARGON2_PARALLELISM: z.coerce.number().int().min(1).max(16).default(1),
    STORAGE_ROOT: z.string().min(1).default("./storage"),
    MAX_FILE_SIZE_MB: z.coerce.number().int().min(1).max(500).default(50),
    MALWARE_SCAN_MODE: z.enum(["skip", "clamav"]).default("skip"),
    CLAMAV_HOST: z.string().trim().min(1).default("127.0.0.1"),
    CLAMAV_PORT: z.coerce.number().int().min(1).max(65_535).default(3310),
    CLAMAV_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(300_000).default(120_000),
    WORKER_POLL_INTERVAL_MS: z.coerce.number().int().min(250).max(60_000).default(2_000)
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
    if (env.NODE_ENV === "production" && env.MALWARE_SCAN_MODE !== "clamav") {
      ctx.addIssue({ code: "custom", path: ["MALWARE_SCAN_MODE"], message: "MALWARE_SCAN_MODE debe ser clamav en producción." });
    }
    if (env.NODE_ENV === "production" && env.CORS_ORIGIN.split(",").some((origin) => !origin.trim().startsWith("https://") || origin.includes("*"))) {
      ctx.addIssue({ code: "custom", path: ["CORS_ORIGIN"], message: "Producción requiere orígenes HTTPS explícitos, sin comodines." });
    }
    if (env.NODE_ENV === "production" && ["debug", "trace"].includes(env.LOG_LEVEL)) {
      ctx.addIssue({ code: "custom", path: ["LOG_LEVEL"], message: "Producción no admite logging debug/trace." });
    }
    if (env.NODE_ENV === "production" && /(change-me|postgres:postgres)/i.test(`${env.DATABASE_URL} ${process.env.DATABASE_URL_MIGRATE ?? ""}`)) {
      ctx.addIssue({ code: "custom", path: ["DATABASE_URL"], message: "Las credenciales de ejemplo no son válidas en producción." });
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

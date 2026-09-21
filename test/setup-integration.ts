import "dotenv/config";
import { requireSafeTestDatabaseUrl } from "./helpers/database-url.js";

process.env.NODE_ENV = "test";
process.env.LOG_LEVEL = "fatal";
process.env.CORS_ORIGIN = "http://localhost:3000";
process.env.COOKIE_SECURE = "false";
process.env.STORAGE_ROOT ??= "/tmp/estudio-guzman-integration-storage";
process.env.MAX_FILE_SIZE_MB = "1";
process.env.TEST_RUNTIME_DATABASE_URL = process.env.DATABASE_URL;
process.env.DATABASE_URL = requireSafeTestDatabaseUrl(
  process.env.DATABASE_URL_TEST,
  process.env.TEST_RUNTIME_DATABASE_URL
);

import "dotenv/config";
import { defineConfig } from "prisma/config";
import { requireSafeTestDatabaseUrl } from "./test/helpers/database-url.js";

const databaseUrl = requireSafeTestDatabaseUrl(process.env.DATABASE_URL_TEST);

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations"
  },
  datasource: {
    url: databaseUrl
  }
});

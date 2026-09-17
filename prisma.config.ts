import "dotenv/config";
import { defineConfig, env } from "prisma/config";

const databaseUrl = process.env.DATABASE_URL_MIGRATE ?? env("DATABASE_URL");

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: databaseUrl,
  },
});

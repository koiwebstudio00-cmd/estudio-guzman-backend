import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client.js";
import { requireSafeTestDatabaseUrl } from "./database-url.js";

const databaseUrl = requireSafeTestDatabaseUrl(
  process.env.DATABASE_URL_TEST,
  process.env.TEST_RUNTIME_DATABASE_URL
);

export const testPrisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl })
});

export async function resetTestDatabase(): Promise<void> {
  const tables = await testPrisma.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename <> '_prisma_migrations'
    ORDER BY tablename
  `;

  if (tables.length === 0) {
    throw new Error("La DB de integración no tiene migraciones aplicadas.");
  }

  const quotedTables = tables.map(({ tablename }) => {
    if (!/^[a-z_][a-z0-9_]*$/.test(tablename)) {
      throw new Error(`Nombre de tabla inesperado en DB de test: ${tablename}`);
    }
    return `"public"."${tablename}"`;
  });

  await testPrisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${quotedTables.join(", ")} RESTART IDENTITY CASCADE`
  );
}

import { PrismaPg } from "@prisma/adapter-pg";
import argon2 from "argon2";
import "dotenv/config";
import { z } from "zod";
import { PrismaClient } from "../src/generated/prisma/client.js";

const inputSchema = z.object({
  email: z.email().transform((value) => value.trim().toLowerCase()),
  name: z.string().trim().min(2).max(160),
  password: z
    .string()
    .min(14, "La contraseña inicial debe tener al menos 14 caracteres.")
    .max(200)
});

const databaseUrl = process.env.DATABASE_URL ?? process.env.DATABASE_URL_MIGRATE;
if (!databaseUrl) throw new Error("Falta DATABASE_URL o DATABASE_URL_MIGRATE.");

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl })
});

async function main(): Promise<void> {
  const parsedInput = inputSchema.safeParse({
    email: process.env.BOOTSTRAP_ADMIN_EMAIL,
    name: process.env.BOOTSTRAP_ADMIN_NAME,
    password: process.env.BOOTSTRAP_ADMIN_PASSWORD
  });
  if (!parsedInput.success) {
    throw new Error(
      "BOOTSTRAP_ADMIN_EMAIL, BOOTSTRAP_ADMIN_NAME y BOOTSTRAP_ADMIN_PASSWORD son obligatorios; la contraseña debe tener entre 14 y 200 caracteres."
    );
  }

  const user = await prisma.$transaction(async (transaction) => {
    await transaction.$executeRaw`SELECT pg_advisory_xact_lock(2026091701)`;

    const existingUsers = await transaction.user.count();
    if (existingUsers > 0) {
      throw new Error(
        "El bootstrap sólo funciona en una instalación sin usuarios. Usá la administración normal."
      );
    }

    const headRole = await transaction.role.findUnique({ where: { code: "HEAD" } });
    if (!headRole) {
      throw new Error("No existe el rol HEAD. Ejecutá primero `npm run seed`.");
    }

    const passwordHash = await argon2.hash(parsedInput.data.password, {
      type: argon2.argon2id
    });

    return transaction.user.create({
      data: {
        email: parsedInput.data.email,
        emailNormalized: parsedInput.data.email,
        name: parsedInput.data.name,
        passwordHash,
        roleId: headRole.id,
        passwordChangedAt: new Date()
      },
      select: { id: true, email: true }
    });
  });

  console.info(`Administrador inicial creado: ${user.email} (${user.id}).`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error: unknown) => {
    console.error(error instanceof Error ? error.message : "Falló el bootstrap del administrador.");
    await prisma.$disconnect();
    process.exit(1);
  });

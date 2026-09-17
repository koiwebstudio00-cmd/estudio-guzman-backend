import { PrismaPg } from "@prisma/adapter-pg";
import { config } from "../config.js";
import { PrismaClient } from "../generated/prisma/client.js";

let prisma: PrismaClient | undefined;

export function getPrisma(): PrismaClient {
  prisma ??= new PrismaClient({
    adapter: new PrismaPg({ connectionString: config.DATABASE_URL })
  });
  return prisma;
}

export async function checkDatabase(): Promise<void> {
  await getPrisma().$queryRaw`SELECT 1`;
}

export async function disconnectDatabase(): Promise<void> {
  if (!prisma) return;
  await prisma.$disconnect();
  prisma = undefined;
}

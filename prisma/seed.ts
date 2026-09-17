import { PrismaPg } from "@prisma/adapter-pg";
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client.js";

const databaseUrl = process.env.DATABASE_URL_MIGRATE ?? process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("Falta DATABASE_URL_MIGRATE o DATABASE_URL.");

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl })
});

const permissions = [
  "users.read",
  "users.manage",
  "roles.manage",
  "contacts.read",
  "contacts.write",
  "cases.read",
  "cases.write",
  "cases.archive",
  "actions.read",
  "actions.write",
  "documents.read",
  "documents.write",
  "tasks.read",
  "tasks.write",
  "notes.read",
  "notes.write",
  "catalogs.manage",
  "audit.read",
  "feedback.manage"
] as const;

const roleDefinitions: Record<string, { name: string; permissions: readonly string[] }> = {
  HEAD: { name: "Jefe", permissions },
  PARTNER: { name: "Socia", permissions },
  LAWYER: {
    name: "Abogada",
    permissions: permissions.filter(
      (permission) => !["users.manage", "roles.manage", "catalogs.manage"].includes(permission)
    )
  },
  SECRETARY: {
    name: "Secretaria",
    permissions: [
      "users.read",
      "contacts.read",
      "contacts.write",
      "cases.read",
      "actions.read",
      "actions.write",
      "documents.read",
      "documents.write",
      "tasks.read",
      "tasks.write",
      "notes.read",
      "notes.write"
    ]
  }
};

async function main(): Promise<void> {
  const permissionByCode = new Map<string, string>();

  for (const code of permissions) {
    const permission = await prisma.permission.upsert({
      where: { code },
      create: { code },
      update: {}
    });
    permissionByCode.set(code, permission.id);
  }

  for (const [code, definition] of Object.entries(roleDefinitions)) {
    const role = await prisma.role.upsert({
      where: { code },
      create: { code, name: definition.name, isSystem: true },
      update: { name: definition.name }
    });

    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    await prisma.rolePermission.createMany({
      data: definition.permissions.map((permissionCode) => ({
        roleId: role.id,
        permissionId: permissionByCode.get(permissionCode)!
      }))
    });
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error: unknown) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });

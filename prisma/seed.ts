import { PrismaPg } from "@prisma/adapter-pg";
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client.js";

const databaseUrl = process.env.DATABASE_URL_MIGRATE ?? process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("Falta DATABASE_URL_MIGRATE o DATABASE_URL.");

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl })
});

const permissionDescriptions = {
  "users.read": "Consultar integrantes del equipo.",
  "users.manage": "Crear, modificar, suspender y rehabilitar usuarios.",
  "roles.read": "Consultar roles y permisos efectivos.",
  "roles.manage": "Administrar roles y su matriz de permisos.",
  "contacts.read": "Consultar contactos.",
  "contacts.create": "Crear contactos.",
  "contacts.update": "Modificar contactos.",
  "contacts.delete": "Dar de baja lógica contactos.",
  "catalogs.read": "Consultar juzgados, oficinas y catálogos.",
  "catalogs.manage": "Administrar juzgados, oficinas y catálogos.",
  "cases.read": "Consultar expedientes.",
  "cases.create": "Crear expedientes.",
  "cases.update": "Modificar datos generales de expedientes.",
  "cases.change_status": "Cambiar el estado de expedientes.",
  "cases.assign": "Administrar el equipo interno de expedientes.",
  "cases.archive": "Archivar, desarchivar o reabrir expedientes.",
  "cases.delete": "Dar de baja lógica altas erróneas de expedientes.",
  "participants.manage": "Administrar partes y representaciones.",
  "subcases.manage": "Administrar cuadernos e incidentes.",
  "actions.read": "Consultar actuaciones.",
  "actions.create": "Crear actuaciones.",
  "actions.update": "Corregir metadatos de actuaciones.",
  "actions.delete": "Dar de baja lógica actuaciones.",
  "documents.read": "Consultar y descargar documentos autorizados.",
  "documents.create": "Crear documentos y su primera versión.",
  "documents.version": "Agregar versiones inmutables.",
  "documents.archive": "Archivar documentos.",
  "tasks.read": "Consultar tareas.",
  "tasks.create": "Crear tareas.",
  "tasks.update": "Modificar tareas.",
  "tasks.change_status": "Cambiar el estado de tareas.",
  "tasks.assign": "Asignar y reasignar tareas.",
  "tasks.delete": "Dar de baja lógica tareas.",
  "notes.read": "Consultar notas internas.",
  "notes.create": "Crear notas internas.",
  "notes.moderate": "Ocultar notas o comentarios con auditoría.",
  "dashboard.read": "Consultar dashboard personal y general.",
  "team_metrics.read": "Consultar métricas del equipo.",
  "audit.read": "Consultar auditoría.",
  "feedback.create": "Enviar sugerencias internas.",
  "feedback.manage": "Administrar sugerencias internas."
} as const;

type PermissionCode = keyof typeof permissionDescriptions;
const permissions = Object.keys(permissionDescriptions) as PermissionCode[];

const commonReadPermissions = [
  "users.read",
  "roles.read",
  "contacts.read",
  "catalogs.read",
  "cases.read",
  "actions.read",
  "documents.read",
  "tasks.read",
  "notes.read",
  "dashboard.read",
  "feedback.create"
] as const satisfies readonly PermissionCode[];

const lawyerPermissions = [
  ...commonReadPermissions,
  "contacts.create",
  "contacts.update",
  "cases.create",
  "cases.update",
  "cases.change_status",
  "cases.assign",
  "participants.manage",
  "subcases.manage",
  "actions.create",
  "actions.update",
  "actions.delete",
  "documents.create",
  "documents.version",
  "documents.archive",
  "tasks.create",
  "tasks.update",
  "tasks.change_status",
  "tasks.assign",
  "tasks.delete",
  "notes.create",
  "team_metrics.read"
] as const satisfies readonly PermissionCode[];

const secretaryPermissions = [
  ...commonReadPermissions,
  "contacts.create",
  "contacts.update",
  "actions.create",
  "actions.update",
  "documents.create",
  "documents.version",
  "tasks.create",
  "tasks.update",
  "tasks.change_status",
  "tasks.assign",
  "notes.create"
] as const satisfies readonly PermissionCode[];

const roleDefinitions: Record<
  string,
  { name: string; description: string; permissions: readonly PermissionCode[] }
> = {
  HEAD: {
    name: "Jefe",
    description: "Administración completa del estudio.",
    permissions
  },
  PARTNER: {
    name: "Socia",
    description: "Administración y gestión jurídica completa.",
    permissions
  },
  LAWYER: {
    name: "Abogada",
    description: "Gestión jurídica sin administración de seguridad ni catálogos.",
    permissions: lawyerPermissions
  },
  SECRETARY: {
    name: "Secretaria",
    description: "Operación diaria sin cambios estructurales de expedientes.",
    permissions: secretaryPermissions
  }
};

async function main(): Promise<void> {
  await prisma.$transaction(async (transaction) => {
    const permissionByCode = new Map<string, string>();

    for (const code of permissions) {
      const permission = await transaction.permission.upsert({
        where: { code },
        create: { code, description: permissionDescriptions[code] },
        update: { description: permissionDescriptions[code] }
      });
      permissionByCode.set(code, permission.id);
    }

    for (const [code, definition] of Object.entries(roleDefinitions)) {
      const role = await transaction.role.upsert({
        where: { code },
        create: {
          code,
          name: definition.name,
          description: definition.description,
          isSystem: true
        },
        update: {
          name: definition.name,
          description: definition.description,
          isSystem: true
        }
      });

      await transaction.rolePermission.deleteMany({ where: { roleId: role.id } });
      await transaction.rolePermission.createMany({
        data: definition.permissions.map((permissionCode) => ({
          roleId: role.id,
          permissionId: permissionByCode.get(permissionCode)!
        }))
      });
    }
  });
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error: unknown) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });

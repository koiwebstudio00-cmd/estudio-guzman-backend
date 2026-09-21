import { z } from "zod";

const uuid = z.string().uuid("El identificador es inválido.");
const permissionCodes = z.array(z.string().trim().min(3).max(100)).max(100).refine(
  (values) => new Set(values).size === values.length,
  "Los permisos no pueden repetirse."
);

export const roleIdParamsSchema = z.object({ roleId: uuid });
export const createRoleSchema = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z][A-Z0-9_]{1,49}$/),
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().max(1_000).nullable().optional(),
  permissionCodes
});
export const updateRoleSchema = z
  .object({
    name: z.string().trim().min(2).max(100).optional(),
    description: z.string().trim().max(1_000).nullable().optional()
  })
  .refine(({ name, description }) => name !== undefined || description !== undefined, {
    message: "Debés enviar al menos un cambio."
  });
export const updateRolePermissionsSchema = z.object({ permissionCodes });

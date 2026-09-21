import { z } from "zod";

const uuid = z.string().uuid("El identificador es inválido.");
const email = z.string().trim().email("Ingresá un email válido.").max(320);
const name = z.string().trim().min(2).max(160);

export const userIdParamsSchema = z.object({ userId: uuid });

export const listUsersQuerySchema = z.object({
  q: z.string().trim().max(160).optional(),
  status: z.enum(["ACTIVE", "SUSPENDED", "DISABLED"]).optional(),
  roleId: uuid.optional()
});

export const createUserSchema = z.object({ email, name, roleId: uuid });

export const updateUserSchema = z
  .object({
    version: z.number().int().positive(),
    email: email.optional(),
    name: name.optional(),
    avatarUrl: z.string().trim().url().max(2_000).nullable().optional(),
    roleId: uuid.optional(),
    status: z.enum(["ACTIVE", "SUSPENDED", "DISABLED"]).optional()
  })
  .refine(
    ({ email, name: userName, avatarUrl, roleId, status }) =>
      email !== undefined ||
      userName !== undefined ||
      avatarUrl !== undefined ||
      roleId !== undefined ||
      status !== undefined,
    { message: "Debés enviar al menos un cambio." }
  );

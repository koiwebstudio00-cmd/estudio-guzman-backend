import { z } from "zod";

const email = z.string().trim().email("Ingresá un email válido.").max(320);
const password = z.string().min(8, "La contraseña debe tener al menos 8 caracteres.").max(200);
export const strongPasswordSchema = password
  .regex(/[a-z]/, "La contraseña debe incluir una minúscula.")
  .regex(/[A-Z]/, "La contraseña debe incluir una mayúscula.")
  .regex(/[0-9]/, "La contraseña debe incluir un número.");

export const loginSchema = z.object({
  email,
  password
});

export const forgotPasswordSchema = z.object({ email });

export const resetPasswordSchema = z.object({
  token: z.string().trim().min(32, "El token es inválido.").max(200),
  password: strongPasswordSchema
});

export const updateOwnProfileSchema = z
  .object({
    version: z.number().int().positive(),
    email: email.optional(),
    name: z.string().trim().min(2).max(160).optional(),
    avatarUrl: z.string().trim().url().max(2_000).nullable().optional()
  })
  .refine(
    ({ email: nextEmail, name, avatarUrl }) =>
      nextEmail !== undefined || name !== undefined || avatarUrl !== undefined,
    { message: "Debés enviar al menos un cambio." }
  );

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Ingresá tu contraseña actual.").max(200),
  newPassword: strongPasswordSchema
});

import { z } from "zod";

const email = z.string().trim().email("Ingresá un email válido.").max(320);
const password = z.string().min(8, "La contraseña debe tener al menos 8 caracteres.").max(200);

export const loginSchema = z.object({
  email,
  password
});

export const forgotPasswordSchema = z.object({ email });

export const resetPasswordSchema = z.object({
  token: z.string().trim().min(32, "El token es inválido.").max(200),
  password: password
    .regex(/[a-z]/, "La contraseña debe incluir una minúscula.")
    .regex(/[A-Z]/, "La contraseña debe incluir una mayúscula.")
    .regex(/[0-9]/, "La contraseña debe incluir un número.")
});

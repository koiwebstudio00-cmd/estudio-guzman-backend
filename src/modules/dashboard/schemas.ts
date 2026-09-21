import { z } from "zod";
const day = z.string().date().transform((value) => new Date(`${value}T00:00:00.000Z`));
export const dashboardQuerySchema = z.object({ from: day.optional(), to: day.optional() }).refine((value) => !value.from || !value.to || value.from <= value.to, { message: "El rango temporal es inválido." });
export const metricsQuerySchema = dashboardQuerySchema.refine((value) => !value.from || !value.to || value.to.getTime() - value.from.getTime() <= 366 * 86_400_000, { message: "El rango máximo es de 366 días." });

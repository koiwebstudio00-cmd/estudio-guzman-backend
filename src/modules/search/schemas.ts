import { z } from "zod";
const type = z.enum(["CASE", "CONTACT", "ACTION"]);
export const searchQuerySchema = z.object({
  q: z.string().trim().max(100).default(""),
  types: z.string().transform((value) => value.split(",").filter(Boolean)).pipe(z.array(type).max(3)).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

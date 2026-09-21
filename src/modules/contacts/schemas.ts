import { z } from "zod";

const uuid = z.string().uuid("El identificador es inválido.");
const nullableText = (max: number) => z.string().trim().max(max).nullable().optional();
const category = z.enum(["CLIENT", "LAWYER", "COMPANY", "REPRESENTATIVE", "EXPERT", "WITNESS", "JUDICIAL_CONTACT", "POLICE", "OTHER"]);
const channelType = z.enum(["EMAIL", "PHONE", "WHATSAPP", "OTHER"]);
const addressType = z.enum(["HOME", "WORK", "LEGAL", "OTHER"]);

export const contactIdParamsSchema = z.object({ contactId: uuid });
export const channelParamsSchema = z.object({ contactId: uuid, channelId: uuid });
export const addressParamsSchema = z.object({ contactId: uuid, addressId: uuid });
export const listContactsQuerySchema = z.object({
  q: z.string().trim().max(160).optional(),
  kind: z.enum(["PERSON", "ORGANIZATION"]).optional(),
  category: category.optional(),
  cursor: z.string().max(1_000).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25)
});

export const channelSchema = z.object({
  type: channelType,
  label: nullableText(80),
  value: z.string().trim().min(1).max(320),
  isPrimary: z.boolean().default(false),
  sortOrder: z.number().int().min(0).default(0)
});
export const addressSchema = z.object({
  type: addressType.default("OTHER"),
  label: nullableText(80),
  line1: z.string().trim().min(1).max(240),
  line2: nullableText(240),
  city: nullableText(120),
  province: nullableText(120),
  postalCode: nullableText(30),
  country: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/).default("AR"),
  isPrimary: z.boolean().default(false)
});

export const createContactSchema = z
  .object({
    kind: z.enum(["PERSON", "ORGANIZATION"]),
    firstName: nullableText(120),
    lastName: nullableText(120),
    legalName: nullableText(240),
    documentNumber: nullableText(40),
    taxId: nullableText(40),
    notes: nullableText(10_000),
    categories: z.array(category).min(1).max(9).refine((items) => new Set(items).size === items.length),
    channels: z.array(channelSchema).max(20).default([]),
    addresses: z.array(addressSchema).max(20).default([])
  })
  .superRefine((value, ctx) => {
    if (value.kind === "PERSON" && !value.firstName) ctx.addIssue({ code: "custom", path: ["firstName"], message: "El nombre es obligatorio para una persona." });
    if (value.kind === "ORGANIZATION" && !value.legalName) ctx.addIssue({ code: "custom", path: ["legalName"], message: "La razón social es obligatoria." });
    for (const [field, items] of [["channels", value.channels], ["addresses", value.addresses]] as const) {
      const primaryTypes = items.filter((item) => item.isPrimary).map((item) => item.type);
      if (new Set(primaryTypes).size !== primaryTypes.length) ctx.addIssue({ code: "custom", path: [field], message: "Sólo puede existir un principal por tipo." });
    }
  });

export const updateContactSchema = z.object({
  version: z.number().int().positive(),
  firstName: nullableText(120), lastName: nullableText(120), legalName: nullableText(240),
  documentNumber: nullableText(40), taxId: nullableText(40), notes: nullableText(10_000),
  categories: z.array(category).min(1).max(9).optional()
});
export const updateChannelSchema = channelSchema.partial().refine((value) => Object.keys(value).length > 0);
export const updateAddressSchema = addressSchema.partial().refine((value) => Object.keys(value).length > 0);

import { z } from "zod";
const status = z.enum(["OPEN", "IN_REVIEW", "RESOLVED", "REJECTED"]);
export const feedbackParamsSchema = z.object({ feedbackId: z.string().uuid() });
export const createFeedbackSchema = z.object({ message: z.string().trim().min(5).max(10_000) });
export const listFeedbackSchema = z.object({ status: status.optional(), cursor: z.string().max(1000).optional(), limit: z.coerce.number().int().min(1).max(100).default(25) });
export const updateFeedbackSchema = z.object({ status, resolution: z.string().trim().min(3).max(10_000).nullable().optional() }).superRefine((value, context) => { if (["RESOLVED", "REJECTED"].includes(value.status) && !value.resolution) context.addIssue({ code: "custom", path: ["resolution"], message: "La resolución es obligatoria." }); });

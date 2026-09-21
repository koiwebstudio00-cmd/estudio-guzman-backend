import { z } from "zod";
export const notificationParamsSchema = z.object({ notificationId: z.string().uuid() });
export const listNotificationsSchema = z.object({ unread: z.enum(["true", "false"]).transform((value) => value === "true").optional(), cursor: z.string().max(1000).optional(), limit: z.coerce.number().int().min(1).max(100).default(25) });
export const preferenceSchema = z.object({ taskAssigned: z.boolean().optional(), taskDueSoon: z.boolean().optional(), taskOverdue: z.boolean().optional(), caseStatusChanged: z.boolean().optional(), emailEnabled: z.boolean().optional(), dueSoonLeadDays: z.number().int().min(0).max(30).optional() }).refine((value) => Object.keys(value).length > 0);

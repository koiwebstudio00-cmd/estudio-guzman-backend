import { getPrisma } from "../../database/prisma.js";
import type { AuthenticatedActor } from "../auth/types.js";
import { dashboardRepository } from "./repo.js";

const utcDay = (date = new Date()) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
const plusDays = (date: Date, days: number) => new Date(date.getTime() + days * 86_400_000);
export class DashboardService {
  async get(actor: AuthenticatedActor, range: { from?: Date | undefined; to?: Date | undefined }) {
    const today = utcDay(); const db = getPrisma(); const canAudit = actor.user.permissions.includes("audit.read"); const canCases = actor.user.permissions.includes("cases.read"); const canTasks = actor.user.permissions.includes("tasks.read"); const canContacts = actor.user.permissions.includes("contacts.read");
    const [activeCases, openTasks, overdueTasks, dueToday, activeClients, myTasks, activity] = await Promise.all([
      canCases ? dashboardRepository.activeCases(db) : Promise.resolve(null), canTasks ? dashboardRepository.openTasks(db) : Promise.resolve(null), canTasks ? dashboardRepository.overdueTasks(db, today) : Promise.resolve(null), canTasks ? dashboardRepository.dueToday(db, today) : Promise.resolve(null), canContacts ? dashboardRepository.activeClients(db) : Promise.resolve(null), canTasks ? dashboardRepository.myTasks(db, actor.user.id) : Promise.resolve([]), dashboardRepository.activity(db, canAudit ? undefined : actor.user.id, range.from, range.to ? plusDays(range.to, 1) : undefined),
    ]);
    return { data: { range: { from: range.from ?? null, to: range.to ?? null }, kpis: { activeCases, openTasks, overdueTasks, dueToday, activeClients }, myTasks, activity: activity.map((item) => ({ ...item, id: item.id.toString() })) } };
  }
  async metrics(range: { from?: Date | undefined; to?: Date | undefined }) {
    const to = range.to ?? utcDay(); const from = range.from ?? plusDays(to, -29); const rows = await dashboardRepository.teamMetrics(getPrisma(), from, plusDays(to, 1), utcDay());
    return { data: rows.map((row) => ({ userId: row.userId, name: row.name, assigned: Number(row.assigned), completed: Number(row.completed), overdue: Number(row.overdue), primaryCases: Number(row.primaryCases) })), meta: { from, to } };
  }
}
export const dashboardService = new DashboardService();

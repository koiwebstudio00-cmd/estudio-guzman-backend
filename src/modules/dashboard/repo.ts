import type { DatabaseClient } from "../auth/repo.js";

export class DashboardRepository {
  activeCases(db: DatabaseClient) { return db.legalCase.count({ where: { deletedAt: null, status: { in: ["PENDING", "ACTIVE", "SUSPENDED"] } } }); }
  openTasks(db: DatabaseClient) { return db.task.count({ where: { deletedAt: null, status: { in: ["PENDING", "IN_PROGRESS"] } } }); }
  overdueTasks(db: DatabaseClient, today: Date) { return db.task.count({ where: { deletedAt: null, status: { in: ["PENDING", "IN_PROGRESS"] }, dueDate: { lt: today } } }); }
  dueToday(db: DatabaseClient, today: Date) { return db.task.count({ where: { deletedAt: null, status: { in: ["PENDING", "IN_PROGRESS"] }, dueDate: today } }); }
  activeClients(db: DatabaseClient) { return db.contact.count({ where: { deletedAt: null, categories: { some: { type: "CLIENT" } } } }); }
  myTasks(db: DatabaseClient, userId: string) { return db.task.findMany({ where: { deletedAt: null, status: { in: ["PENDING", "IN_PROGRESS"] }, assignments: { some: { userId, unassignedAt: null } } }, select: { id: true, title: true, status: true, priority: true, dueDate: true, version: true, legalCase: { select: { id: true, caseNumber: true, title: true } } }, orderBy: [{ dueDate: "asc" }, { priority: "desc" }, { updatedAt: "desc" }], take: 8 }); }
  activity(
    db: DatabaseClient,
    actorId: string | undefined,
    from: Date | undefined,
    toExclusive: Date | undefined
  ) {
    return db.auditLog.findMany({
      where: {
        ...(actorId ? { actorId } : {}),
        ...((from || toExclusive)
          ? {
              createdAt: {
                ...(from ? { gte: from } : {}),
                ...(toExclusive ? { lt: toExclusive } : {})
              }
            }
          : {}),
        NOT: [
          { action: { startsWith: "AUTH_" } },
          { action: { startsWith: "USER_" } }
        ]
      },
      select: {
        id: true,
        action: true,
        entityType: true,
        entityId: true,
        createdAt: true,
        actor: { select: { id: true, name: true } }
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 10
    });
  }
  teamMetrics(db: DatabaseClient, from: Date, toExclusive: Date, today: Date) { return db.$queryRaw<Array<{ userId: string; name: string; assigned: bigint; completed: bigint; overdue: bigint; primaryCases: bigint }>>`
    SELECT u.id AS "userId", u.name,
      COUNT(DISTINCT ta.task_id) FILTER (WHERE ta.unassigned_at IS NULL) AS assigned,
      COUNT(DISTINCT t.id) FILTER (WHERE t.completed_at >= ${from} AND t.completed_at < ${toExclusive}) AS completed,
      COUNT(DISTINCT t.id) FILTER (WHERE ta.unassigned_at IS NULL AND t.status IN ('PENDING','IN_PROGRESS') AND t.due_date < ${today}) AS overdue,
      COUNT(DISTINCT ctm.case_id) FILTER (WHERE ctm.role = 'PRIMARY' AND ctm.unassigned_at IS NULL) AS "primaryCases"
    FROM users u
    LEFT JOIN task_assignments ta ON ta.user_id = u.id
    LEFT JOIN tasks t ON t.id = ta.task_id AND t.deleted_at IS NULL
    LEFT JOIN case_team_members ctm ON ctm.user_id = u.id
    WHERE u.status = 'ACTIVE'
    GROUP BY u.id, u.name
    ORDER BY u.name ASC
  `; }
}
export const dashboardRepository = new DashboardRepository();

import { prisma } from "@/lib/prisma";
import { leadScope } from "@/lib/workspace";
import type { Priority, TaskCategory, TaskStatus } from "@prisma/client";

type SessionUser = { id: string; email?: string | null };

export async function getVisibleTasks(
  user: SessionUser,
  filters: { status?: string | null; category?: string | null; priority?: string | null } = {},
) {
  const where: {
    userId: string;
    status?: TaskStatus;
    category?: TaskCategory;
    priority?: Priority;
  } = { userId: user.id };
  if (filters.status) where.status = filters.status as TaskStatus;
  if (filters.category) where.category = filters.category as TaskCategory;
  if (filters.priority) where.priority = filters.priority as Priority;

  const tasks = await prisma.task.findMany({
    where,
    orderBy: [{ status: "asc" }, { priority: "desc" }, { createdAt: "desc" }],
    include: {
      lead: { select: { id: true, companyName: true, phone: true, status: true } },
    },
  });

  const visibleLeadIds = new Set(
    (
      await prisma.lead.findMany({
        where: {
          id: { in: tasks.flatMap((task) => (task.leadId ? [task.leadId] : [])) },
          ...(await leadScope(user)),
        },
        select: { id: true },
      })
    ).map((lead) => lead.id),
  );

  return tasks.map((task) =>
    task.leadId && !visibleLeadIds.has(task.leadId) ? { ...task, leadId: null, lead: null } : task,
  );
}

/** Names for the task form. Same 100 leads the picker used to load via GET /api/leads?limit=100. */
export async function listLeadOptions(user: SessionUser) {
  return prisma.lead.findMany({
    where: await leadScope(user),
    orderBy: { updatedAt: "desc" },
    take: 100,
    select: { id: true, companyName: true },
  });
}

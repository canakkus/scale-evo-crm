import type { LeadStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ARCHIVED_STATUSES } from "@/lib/leads-list";
import { leadScope as workspaceLeadScope, workspaceUserIds } from "@/lib/workspace";

type SessionUser = { id: string; email?: string | null };

const CONTACTED: LeadStatus[] = ["CONTACTED", "REPLIED", "INTERESTED", "APPOINTMENT", "OFFER_SENT"];

function iso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

function countOf(groups: { status: LeadStatus; _count: { _all: number } }[], statuses?: LeadStatus[]) {
  return groups.reduce((sum, group) => {
    if (statuses && !statuses.includes(group.status)) return sum;
    if (!statuses && ARCHIVED_STATUSES.includes(group.status)) return sum;
    return sum + group._count._all;
  }, 0);
}

async function leadsByCreator(user: SessionUser, leadScope: Awaited<ReturnType<typeof workspaceLeadScope>>) {
  const visibleUserIds = await workspaceUserIds(user);
  const [users, createdCounts, wonCounts, recentRows] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: visibleUserIds } },
      select: { id: true, displayName: true, email: true },
      orderBy: { displayName: "asc" },
    }),
    prisma.lead.groupBy({
      by: ["createdById"],
      where: { AND: [leadScope, { createdById: { in: visibleUserIds } }] },
      _count: { _all: true },
    }),
    prisma.lead.groupBy({
      by: ["createdById"],
      where: { AND: [leadScope, { createdById: { in: visibleUserIds } }, { status: "WON" }] },
      _count: { _all: true },
    }),
    prisma.lead.findMany({
      where: { AND: [leadScope, { createdById: { in: visibleUserIds } }, { status: { notIn: ARCHIVED_STATUSES } }] },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        companyName: true,
        industry: true,
        city: true,
        status: true,
        createdAt: true,
        createdById: true,
      },
    }),
  ]);

  const created = new Map(createdCounts.map((row) => [row.createdById, row._count._all]));
  const won = new Map(wonCounts.map((row) => [row.createdById, row._count._all]));
  const recent = new Map<string, typeof recentRows>();
  for (const row of recentRows) {
    const list = recent.get(row.createdById) ?? [];
    if (list.length >= 6) continue;
    list.push(row);
    recent.set(row.createdById, list);
  }

  return users
    .map((account) => ({
      user: account,
      totalCreated: created.get(account.id) ?? 0,
      wonCount: won.get(account.id) ?? 0,
      recentCreated: (recent.get(account.id) ?? []).map((lead) => ({
        id: lead.id,
        companyName: lead.companyName,
        industry: lead.industry,
        city: lead.city,
        status: lead.status,
        createdAt: lead.createdAt.toISOString(),
      })),
    }))
    .sort((a, b) => b.totalCreated - a.totalCreated);
}

/**
 * Dashboard numbers in one parallel batch.
 * Status totals come from a single GROUP BY instead of four COUNT scans.
 * Team rows (analytics) come from three queries instead of three per user.
 */
export async function loadDashboard(user: SessionUser, options?: { includeTeam?: boolean }) {
  const leadScope = await workspaceLeadScope(user);
  const includeTeam = options?.includeTeam === true;

  const [statusGroups, totalCalls, openTasks, recentLeads, upcomingFollowUps, leadsByUser] = await Promise.all([
    prisma.lead.groupBy({
      by: ["status"],
      where: leadScope,
      _count: { _all: true },
    }),
    prisma.callRecording.count({ where: { createdById: user.id } }),
    prisma.task.count({ where: { userId: user.id, status: "OPEN" } }),
    prisma.lead.findMany({
      where: { AND: [leadScope, { status: { notIn: ARCHIVED_STATUSES } }] },
      take: 5,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        companyName: true,
        industry: true,
        city: true,
        status: true,
        score: true,
        createdAt: true,
      },
    }),
    prisma.lead.findMany({
      where: { ...leadScope, status: "FOLLOW_UP" },
      take: 5,
      orderBy: { nextFollowUpAt: "asc" },
      select: { id: true, companyName: true, phone: true, nextFollowUpAt: true, city: true },
    }),
    includeTeam ? leadsByCreator(user, leadScope) : Promise.resolve(undefined),
  ]);

  const payload = {
    metrics: {
      totalLeads: countOf(statusGroups),
      contactedLeads: countOf(statusGroups, CONTACTED),
      openFollowUps: countOf(statusGroups, ["FOLLOW_UP"]),
      wonLeads: countOf(statusGroups, ["WON"]),
      totalCalls,
      openTasks,
    },
    recentLeads: recentLeads.map((lead) => ({ ...lead, createdAt: lead.createdAt.toISOString() })),
    upcomingFollowUps: upcomingFollowUps.map((lead) => ({
      ...lead,
      nextFollowUpAt: iso(lead.nextFollowUpAt),
    })),
  };

  if (!includeTeam || !leadsByUser) return payload;
  return { ...payload, leadsByUser };
}

import { prisma } from "@/lib/prisma";
import { ARCHIVED_STATUSES } from "@/lib/leads-list";
import { leadScope as workspaceLeadScope } from "@/lib/workspace";

type SessionUser = { id: string; email?: string | null };

/** Same rows as GET /api/leads/map (excludes archived/NOT_RELEVANT leads). */
export async function listMapLeads(user: SessionUser) {
  const scope = await workspaceLeadScope(user);
  const leads = await prisma.lead.findMany({
    where: {
      AND: [scope, { status: { notIn: ARCHIVED_STATUSES } }],
    },
    select: {
      id: true,
      companyName: true,
      latitude: true,
      longitude: true,
      status: true,
      acquisitionType: true,
      industry: true,
      phone: true,
      score: true,
      lastContactAt: true,
      city: true,
      address: true,
      geoPrecision: true,
      geoStatus: true,
    },
    orderBy: { companyName: "asc" },
  });

  return leads.map((lead) => ({
    ...lead,
    lastContactAt: lead.lastContactAt ? lead.lastContactAt.toISOString() : null,
  }));
}

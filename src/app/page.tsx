import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DashboardComponent } from "@/components/dashboard/dashboard-component";

export const metadata = { title: "Dashboard | Scale Evo CRM" };

async function getDashboardData(userId: string) {
  try {
    const leadScope = {
      OR: [
        { createdById: userId },
        { assignedToId: userId },
      ],
    };

    const [
      totalLeads,
      contactedLeads,
      openFollowUps,
      wonLeads,
      totalCalls,
      openTasks,
      recentLeads,
      upcomingFollowUps,
    ] = await Promise.all([
      prisma.lead.count({ where: leadScope }),
      prisma.lead.count({
        where: {
          ...leadScope,
          status: { in: ["CONTACTED", "REPLIED", "INTERESTED", "APPOINTMENT", "OFFER_SENT"] },
        },
      }),
      prisma.lead.count({ where: { ...leadScope, status: "FOLLOW_UP" } }),
      prisma.lead.count({ where: { ...leadScope, status: "WON" } }),
      prisma.callRecording.count({ where: { createdById: userId } }),
      prisma.task.count({ where: { userId, status: "OPEN" } }),
      prisma.lead.findMany({
        where: leadScope,
        take: 5,
        orderBy: { createdAt: "desc" },
        select: { id: true, companyName: true, industry: true, city: true, status: true, score: true, createdAt: true },
      }),
      prisma.lead.findMany({
        where: { ...leadScope, status: "FOLLOW_UP" },
        take: 5,
        orderBy: { nextFollowUpAt: "asc" },
        select: { id: true, companyName: true, phone: true, nextFollowUpAt: true, city: true },
      }),
    ]);

    return {
      metrics: {
        totalLeads,
        contactedLeads,
        openFollowUps,
        wonLeads,
        totalCalls,
        openTasks,
      },
      recentLeads: recentLeads.map((l) => ({ ...l, createdAt: l.createdAt.toISOString() })),
      upcomingFollowUps: upcomingFollowUps.map((f) => ({
        ...f,
        nextFollowUpAt: f.nextFollowUpAt ? f.nextFollowUpAt.toISOString() : null,
      })),
    };
  } catch (err) {
    console.error("[Dashboard] Error fetching data:", err);
    return null;
  }
}

export default async function DashboardPage() {
  const user = await requireAuth();
  const initialData = await getDashboardData(user.id);

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="font-heading text-2xl font-bold tracking-tight" style={{ color: "var(--text)" }}>
          Dashboard
        </h1>
        <p className="mt-1 text-xs" style={{ color: "var(--text-2)" }}>
          Willkommen zurück in Scale Evo CRM 3.0 — Übersicht deiner Vertriebs-Pipeline und KI-Aktivitäten.
        </p>
      </div>

      <DashboardComponent initialData={initialData} />
    </div>
  );
}

import { NextResponse } from "next/server";
import { getOptionalUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { leadScope as workspaceLeadScope, workspaceUserIds } from "@/lib/workspace";

export async function GET() {
  try {
    const user = await getOptionalUser();
    if (!user) {
      return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
    }

    const leadScope = await workspaceLeadScope(user);
    const visibleUserIds = await workspaceUserIds(user);

    const [
      totalLeads,
      contactedLeads,
      openFollowUps,
      wonLeads,
      totalCalls,
      openTasks,
      recentLeads,
      upcomingFollowUps,
      workspaceUsers,
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
      prisma.callRecording.count({ where: { createdById: user.id } }),
      prisma.task.count({ where: { userId: user.id, status: "OPEN" } }),
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
      prisma.user.findMany({
        where: { id: { in: visibleUserIds } },
        select: { id: true, displayName: true, email: true },
        orderBy: { displayName: "asc" },
      }),
    ]);

    // Aufschlüsselung der Leads nach User (Ersteller)
    const leadsByUser = await Promise.all(
      workspaceUsers.map(async (u) => {
        const [totalCreated, wonCount, recentCreated] = await Promise.all([
          prisma.lead.count({
            where: {
              ...leadScope,
              createdById: u.id,
            },
          }),
          prisma.lead.count({
            where: {
              ...leadScope,
              createdById: u.id,
              status: "WON",
            },
          }),
          prisma.lead.findMany({
            where: {
              ...leadScope,
              createdById: u.id,
            },
            take: 6,
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              companyName: true,
              industry: true,
              city: true,
              status: true,
              createdAt: true,
            },
          }),
        ]);

        return {
          user: u,
          totalCreated,
          wonCount,
          recentCreated,
        };
      })
    );

    // Sortiere nach Aktivität (meiste erstellte Leads oben)
    leadsByUser.sort((a, b) => b.totalCreated - a.totalCreated);

    return NextResponse.json({
      metrics: {
        totalLeads,
        contactedLeads,
        openFollowUps,
        wonLeads,
        totalCalls,
        openTasks,
      },
      recentLeads,
      upcomingFollowUps,
      leadsByUser,
    });
  } catch (error) {
    console.error("[GET /api/dashboard] Error:", error);
    return NextResponse.json({ error: "Fehler beim Laden des Dashboards." }, { status: 500 });
  }
}

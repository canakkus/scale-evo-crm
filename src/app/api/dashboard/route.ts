import { NextResponse } from "next/server";
import { getOptionalUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const user = await getOptionalUser();
    if (!user) {
      return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
    }

    const leadScope = {
      OR: [
        { createdById: user.id },
        { assignedToId: user.id },
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
    ]);

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
    });
  } catch (error) {
    console.error("[GET /api/dashboard] Error:", error);
    return NextResponse.json({ error: "Fehler beim Laden des Dashboards." }, { status: 500 });
  }
}

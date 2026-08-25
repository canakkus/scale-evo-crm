import { NextResponse } from "next/server";
import { getOptionalUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const user = await getOptionalUser();
    if (!user) {
      return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
    }

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
      prisma.lead.count(),
      prisma.lead.count({ where: { status: { in: ["CONTACTED", "REPLIED", "INTERESTED", "APPOINTMENT", "OFFER_SENT"] } } }),
      prisma.lead.count({ where: { status: "FOLLOW_UP" } }),
      prisma.lead.count({ where: { status: "WON" } }),
      prisma.callRecording.count(),
      prisma.task.count({ where: { status: "OPEN" } }),
      prisma.lead.findMany({
        take: 5,
        orderBy: { createdAt: "desc" },
        select: { id: true, companyName: true, industry: true, city: true, status: true, score: true, createdAt: true },
      }),
      prisma.lead.findMany({
        take: 5,
        where: { status: "FOLLOW_UP" },
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

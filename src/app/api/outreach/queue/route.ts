import { NextResponse } from "next/server";
import { getOptionalUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ensureDbUser } from "@/lib/outreach-user";
import { WARMUP_TASK_PREFIX, warmupStateFrom } from "@/lib/outreach-shared";

export async function GET() {
  try {
    const user = await getOptionalUser();
    if (!user) return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });

    const dbUser = await ensureDbUser(user);
    const mine = { OR: [{ createdById: dbUser.id }, { assignedToId: dbUser.id }] };

    const leads = await prisma.lead.findMany({
      where: {
        ...mine,
        instagram: { not: null },
        status: { notIn: ["WON", "LOST", "NOT_RELEVANT"] },
      },
      orderBy: [{ score: "desc" }, { companyName: "asc" }],
      take: 100,
      select: {
        id: true, companyName: true, industry: true, city: true, instagram: true,
        website: true, phone: true, score: true, scoreReasons: true, opportunityTags: true,
        interestingReason: true, status: true, acquisitionType: true, googleRating: true,
        lastContactAt: true,
      },
    });

    // Warm-up-Zustand aus den zugehoerigen Tasks ableiten.
    const warmupTasks = await prisma.task.findMany({
      where: {
        userId: dbUser.id,
        leadId: { in: leads.map((lead) => lead.id) },
        title: { startsWith: WARMUP_TASK_PREFIX },
      },
      select: { leadId: true, dueAt: true },
    });
    const warmupByLead = new Map(warmupTasks.map((task) => [task.leadId, task.dueAt]));

    const withWarmup = leads.map((lead) => ({
      ...lead,
      warmupState: warmupStateFrom(warmupByLead.get(lead.id)),
      warmupDueAt: warmupByLead.get(lead.id) ?? null,
    }));

    const sentToday = await prisma.interaction.count({
      where: {
        createdById: dbUser.id,
        type: "INSTAGRAM",
        createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
      },
    });

    return NextResponse.json({ leads: withWarmup, sentToday });
  } catch (error) {
    console.error("[GET /api/outreach/queue] Error:", error);
    return NextResponse.json({ error: "Warteschlange konnte nicht geladen werden." }, { status: 500 });
  }
}

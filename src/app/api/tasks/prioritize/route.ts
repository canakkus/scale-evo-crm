import { NextResponse } from "next/server";
import { getOptionalUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { prioritizeTasks } from "@/services/groq";

export async function POST(request: Request) {
  try {
    const user = await getOptionalUser();
    if (!user) {
      return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
    }

    const openTasks = await prisma.task.findMany({
      where: { userId: user.id, status: "OPEN" },
      select: { title: true, category: true, dueAt: true, priority: true },
    });

    const openFollowUps = await prisma.lead.findMany({
      where: {
        status: "FOLLOW_UP",
        OR: [
          { createdById: user.id },
          { assignedToId: user.id },
        ],
      },
      select: { companyName: true, nextFollowUpAt: true },
      take: 10,
    });

    const tasksPayload = openTasks.map((t) => ({
      title: t.title,
      category: t.category,
      dueAt: t.dueAt ? t.dueAt.toISOString() : null,
      priority: t.priority,
    }));

    const followUpsPayload = openFollowUps.map((f) => ({
      leadName: f.companyName,
      dueAt: f.nextFollowUpAt ? f.nextFollowUpAt.toISOString() : "heute",
    }));

    const result = await prioritizeTasks(tasksPayload, followUpsPayload);
    return NextResponse.json(result);
  } catch (error) {
    console.error("[POST /api/tasks/prioritize] Error:", error);
    return NextResponse.json(
      { error: "Fehler bei der KI-Priorisierung." },
      { status: 500 }
    );
  }
}

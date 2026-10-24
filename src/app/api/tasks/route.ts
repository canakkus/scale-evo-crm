import { NextResponse } from "next/server";
import { getOptionalUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { findAccessibleLead } from "@/lib/workspace";
import { getVisibleTasks } from "@/lib/tasks-query";

export async function GET(request: Request) {
  try {
    const user = await getOptionalUser();
    if (!user) {
      return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const tasks = await getVisibleTasks(user, {
      status: searchParams.get("status"),
      category: searchParams.get("category"),
      priority: searchParams.get("priority"),
    });

    return NextResponse.json({ tasks });
  } catch (error) {
    console.error("[GET /api/tasks] Error:", error);
    return NextResponse.json({ error: "Fehler beim Laden der Tasks." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getOptionalUser();
    if (!user) {
      return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
    }

    // Ensure db User exists
    let dbUser = await prisma.user.findUnique({ where: { id: user.id } });
    if (!dbUser) {
      dbUser = await prisma.user.create({
        data: { id: user.id, email: user.email ?? "user@scaleevo.at", displayName: "User" },
      });
    }

    const data = await request.json();

    if (!data.title?.trim()) {
      return NextResponse.json({ error: "Titel ist erforderlich." }, { status: 400 });
    }
    if (data.leadId && !(await findAccessibleLead(user, String(data.leadId)))) {
      return NextResponse.json({ error: "Lead nicht gefunden." }, { status: 404 });
    }

    const task = await prisma.task.create({
      data: {
        title: data.title.trim(),
        description: data.description || null,
        category: data.category || "OTHER",
        priority: data.priority || "MEDIUM",
        status: data.status || "OPEN",
        dueAt: data.dueAt ? new Date(data.dueAt) : null,
        leadId: data.leadId || null,
        userId: dbUser.id,
        aiGenerated: Boolean(data.aiGenerated),
      },
      include: {
        lead: { select: { id: true, companyName: true, phone: true, status: true } },
      },
    });

    return NextResponse.json({ task }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/tasks] Error:", error);
    return NextResponse.json({ error: "Fehler beim Erstellen des Tasks." }, { status: 500 });
  }
}

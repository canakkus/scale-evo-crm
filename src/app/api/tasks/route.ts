import { NextResponse } from "next/server";
import { getOptionalUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { findAccessibleLead, leadScope } from "@/lib/workspace";
import type { TaskCategory, TaskStatus, Priority } from "@prisma/client";

export async function GET(request: Request) {
  try {
    const user = await getOptionalUser();
    if (!user) {
      return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") as TaskStatus | null;
    const category = searchParams.get("category") as TaskCategory | null;
    const priority = searchParams.get("priority") as Priority | null;

    const where: any = { userId: user.id };
    if (status) where.status = status;
    if (category) where.category = category;
    if (priority) where.priority = priority;

    const tasks = await prisma.task.findMany({
      where,
      orderBy: [{ status: "asc" }, { priority: "desc" }, { createdAt: "desc" }],
      include: {
        lead: { select: { id: true, companyName: true, phone: true, status: true } },
      },
    });

    // Alt-Datensaetze koennen an Leads haengen, die (nicht mehr) im Arbeitsbereich
    // liegen — deren Firmenname und Telefonnummer duerfen nicht durchsickern.
    const visibleLeadIds = new Set(
      (
        await prisma.lead.findMany({
          where: { id: { in: tasks.flatMap((task) => (task.leadId ? [task.leadId] : [])) }, ...(await leadScope(user)) },
          select: { id: true },
        })
      ).map((lead) => lead.id),
    );
    const visibleTasks = tasks.map((task) =>
      task.leadId && !visibleLeadIds.has(task.leadId) ? { ...task, leadId: null, lead: null } : task,
    );

    return NextResponse.json({ tasks: visibleTasks });
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

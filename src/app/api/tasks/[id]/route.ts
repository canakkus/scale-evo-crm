import { NextResponse } from "next/server";
import { getOptionalUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { findAccessibleLead } from "@/lib/workspace";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getOptionalUser();
    if (!user) {
      return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
    }

    const { id } = await params;
    const data = await request.json();

    const isDone = data.status === "DONE";

    // Tasks sind persoenlich — nur die eigenen duerfen geaendert werden.
    const existing = await prisma.task.findFirst({ where: { id, userId: user.id }, select: { id: true } });
    if (!existing) {
      return NextResponse.json({ error: "Task nicht gefunden." }, { status: 404 });
    }
    if (data.leadId && !(await findAccessibleLead(user, String(data.leadId)))) {
      return NextResponse.json({ error: "Lead nicht gefunden." }, { status: 404 });
    }

    const updated = await prisma.task.update({
      where: { id },
      data: {
        ...(data.title !== undefined && { title: data.title.trim() }),
        ...(data.description !== undefined && { description: data.description || null }),
        ...(data.category !== undefined && { category: data.category }),
        ...(data.priority !== undefined && { priority: data.priority }),
        ...(data.status !== undefined && {
          status: data.status,
          completedAt: isDone ? new Date() : null,
        }),
        ...(data.dueAt !== undefined && { dueAt: data.dueAt ? new Date(data.dueAt) : null }),
        ...(data.leadId !== undefined && { leadId: data.leadId || null }),
      },
      include: {
        lead: { select: { id: true, companyName: true, phone: true, status: true } },
      },
    });

    return NextResponse.json({ task: updated });
  } catch (error) {
    console.error("[PATCH /api/tasks/[id]] Error:", error);
    return NextResponse.json({ error: "Fehler beim Aktualisieren des Tasks." }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getOptionalUser();
    if (!user) {
      return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
    }

    const { id } = await params;
    const { count } = await prisma.task.deleteMany({ where: { id, userId: user.id } });
    if (count === 0) {
      return NextResponse.json({ error: "Task nicht gefunden." }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[DELETE /api/tasks/[id]] Error:", error);
    return NextResponse.json({ error: "Fehler beim Löschen des Tasks." }, { status: 500 });
  }
}

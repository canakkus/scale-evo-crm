import { NextResponse } from "next/server";
import { getOptionalUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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
    await prisma.task.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[DELETE /api/tasks/[id]] Error:", error);
    return NextResponse.json({ error: "Fehler beim Löschen des Tasks." }, { status: 500 });
  }
}

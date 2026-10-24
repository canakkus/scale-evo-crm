import { NextResponse } from "next/server";
import type { PlannedCallStatus, PlannedCallType } from "@prisma/client";
import { getOptionalUser } from "@/lib/auth";
import { parseUpdatePlannedCall } from "@/lib/planned-call";
import { prisma } from "@/lib/prisma";
import { findAccessibleLead } from "@/lib/workspace";

const callInclude = {
  lead: { select: { id: true, companyName: true, phone: true } },
} as const;

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getOptionalUser();
    if (!user) return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });

    const { id } = await params;
    const parsed = parseUpdatePlannedCall(await request.json());
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

    const existing = await prisma.plannedCall.findFirst({
      where: { id, userId: user.id },
      select: { id: true },
    });
    if (!existing) return NextResponse.json({ error: "Anruf nicht gefunden." }, { status: 404 });

    if (parsed.value.leadId && !(await findAccessibleLead(user, parsed.value.leadId))) {
      return NextResponse.json({ error: "Lead nicht gefunden." }, { status: 404 });
    }

    const data = parsed.value;
    const call = await prisma.plannedCall.update({
      where: { id },
      data: {
        ...(data.leadId !== undefined ? { leadId: data.leadId } : {}),
        ...(data.startsAt !== undefined ? { startsAt: data.startsAt } : {}),
        ...(data.type !== undefined ? { type: data.type as PlannedCallType } : {}),
        ...(data.note !== undefined ? { note: data.note } : {}),
        ...(data.durationMinutes !== undefined ? { durationMinutes: data.durationMinutes } : {}),
        ...(data.reminderMinutes !== undefined ? { reminderMinutes: data.reminderMinutes } : {}),
        ...(data.status !== undefined ? { status: data.status as PlannedCallStatus } : {}),
        sequence: { increment: 1 },
      },
      include: callInclude,
    });

    return NextResponse.json({ call });
  } catch (error) {
    console.error("[PATCH /api/planned-calls/[id]] Error:", error);
    return NextResponse.json({ error: "Fehler beim Aktualisieren des Anrufs." }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getOptionalUser();
    if (!user) return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });

    const { id } = await params;
    const { count } = await prisma.plannedCall.deleteMany({ where: { id, userId: user.id } });
    if (count === 0) return NextResponse.json({ error: "Anruf nicht gefunden." }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[DELETE /api/planned-calls/[id]] Error:", error);
    return NextResponse.json({ error: "Fehler beim Löschen des Anrufs." }, { status: 500 });
  }
}

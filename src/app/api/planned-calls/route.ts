import { NextResponse } from "next/server";
import type { PlannedCallStatus, PlannedCallType } from "@prisma/client";
import { getOptionalUser } from "@/lib/auth";
import { ensureDbUser } from "@/lib/calendar-subscription";
import { feedWindow, parseCreatePlannedCall, PLANNED_CALL_STATUSES } from "@/lib/planned-call";
import { prisma } from "@/lib/prisma";
import { findAccessibleLead, leadScope } from "@/lib/workspace";

const callInclude = {
  lead: { select: { id: true, companyName: true, phone: true } },
} as const;

async function redactCalls<T extends { leadId: string; lead: unknown }>(
  user: { id: string; email?: string | null },
  calls: T[],
): Promise<T[]> {
  const ids = [...new Set(calls.map((call) => call.leadId))];
  if (ids.length === 0) return calls;
  const visible = new Set(
    (
      await prisma.lead.findMany({
        where: { id: { in: ids }, ...(await leadScope(user)) },
        select: { id: true },
      })
    ).map((lead) => lead.id),
  );
  return calls.map((call) => (visible.has(call.leadId) ? call : { ...call, lead: null }));
}

export async function GET(request: Request) {
  try {
    const user = await getOptionalUser();
    if (!user) return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const leadId = searchParams.get("leadId");
    const status = searchParams.get("status");
    let from = searchParams.get("from");
    let to = searchParams.get("to");

    if (leadId && !(await findAccessibleLead(user, leadId))) {
      return NextResponse.json({ error: "Lead nicht gefunden." }, { status: 404 });
    }
    if (status && !(PLANNED_CALL_STATUSES as readonly string[]).includes(status)) {
      return NextResponse.json({ error: "Unbekannter Status." }, { status: 400 });
    }

    if (!from || !to) {
      const window = feedWindow(new Date());
      from = from ?? window.from.toISOString();
      to = to ?? window.to.toISOString();
    }
    const fromDate = new Date(from);
    const toDate = new Date(to);
    if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime()) || fromDate > toDate) {
      return NextResponse.json({ error: "Ungültiger Zeitraum." }, { status: 400 });
    }
    if (toDate.getTime() - fromDate.getTime() > 800 * 86_400_000) {
      return NextResponse.json({ error: "Zeitraum ist zu groß." }, { status: 400 });
    }

    const calls = await prisma.plannedCall.findMany({
      where: {
        userId: user.id,
        startsAt: { gte: fromDate, lte: toDate },
        ...(leadId ? { leadId } : {}),
        ...(status ? { status: status as PlannedCallStatus } : {}),
      },
      orderBy: { startsAt: "asc" },
      include: callInclude,
    });

    return NextResponse.json({ calls: await redactCalls(user, calls) });
  } catch (error) {
    console.error("[GET /api/planned-calls] Error:", error);
    return NextResponse.json({ error: "Fehler beim Laden der Anrufe." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getOptionalUser();
    if (!user) return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });

    const parsed = parseCreatePlannedCall(await request.json());
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

    if (!(await findAccessibleLead(user, parsed.value.leadId))) {
      return NextResponse.json({ error: "Lead nicht gefunden." }, { status: 404 });
    }

    const dbUser = await ensureDbUser(user);
    const call = await prisma.plannedCall.create({
      data: {
        leadId: parsed.value.leadId,
        userId: dbUser.id,
        startsAt: parsed.value.startsAt,
        durationMinutes: parsed.value.durationMinutes,
        reminderMinutes: parsed.value.reminderMinutes,
        type: parsed.value.type as PlannedCallType,
        note: parsed.value.note,
      },
      include: callInclude,
    });

    return NextResponse.json({ call }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/planned-calls] Error:", error);
    return NextResponse.json({ error: "Fehler beim Planen des Anrufs." }, { status: 500 });
  }
}

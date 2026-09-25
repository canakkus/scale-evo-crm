import { NextResponse } from "next/server";
import { getOptionalUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { leadScope } from "@/lib/workspace";
import { ensureDbUser } from "@/lib/outreach-user";
import { WARMUP_TASK_PREFIX, WARMUP_WAIT_DAYS } from "@/lib/outreach-shared";

/**
 * Markiert den Warm-up-Schritt als erledigt (gefolgt + geliked) und legt
 * die Erinnerung an, wann die DM sinnvoll wird.
 *
 * Kein eigenes Schema: Der Warm-up-Zustand ergibt sich aus einer Task mit
 * festem Titel-Praefix. Das haelt die Aenderung klein und macht den Schritt
 * gleichzeitig in /tasks sichtbar.
 */
export async function POST(request: Request) {
  try {
    const user = await getOptionalUser();
    if (!user) return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });

    const body = await request.json();
    const leadId = String(body.leadId ?? "").trim();
    if (!leadId) return NextResponse.json({ error: "leadId fehlt." }, { status: 400 });

    const dbUser = await ensureDbUser(user);
    const lead = await prisma.lead.findFirst({
      where: { id: leadId, ...(await leadScope(dbUser)) },
      select: { id: true, companyName: true },
    });
    if (!lead) return NextResponse.json({ error: "Lead nicht gefunden." }, { status: 404 });

    const existing = await prisma.task.findFirst({
      where: { leadId: lead.id, userId: dbUser.id, title: { startsWith: WARMUP_TASK_PREFIX } },
    });
    if (existing) {
      return NextResponse.json({ ok: true, task: existing, alreadyDone: true });
    }

    const dueAt = new Date(Date.now() + WARMUP_WAIT_DAYS * 86_400_000);
    const task = await prisma.task.create({
      data: {
        title: `${WARMUP_TASK_PREFIX}${lead.companyName}`,
        description:
          "Profil wurde gefolgt und ein Beitrag geliked. Ab dem Fälligkeitsdatum ist die DM sinnvoll — " +
          "sie landet dann seltener im Anfragen-Ordner.",
        category: "COLD_OUTREACH",
        priority: "MEDIUM",
        dueAt,
        leadId: lead.id,
        userId: dbUser.id,
      },
    });

    return NextResponse.json({ ok: true, task });
  } catch (error) {
    console.error("[POST /api/outreach/warmup] Error:", error);
    return NextResponse.json({ error: "Warm-up konnte nicht gespeichert werden." }, { status: 500 });
  }
}

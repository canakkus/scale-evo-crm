import { NextResponse } from "next/server";
import { getOptionalUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ensureDbUser } from "@/lib/outreach-user";
import { FOLLOWUP_DAYS, FOLLOWUP_TASK_PREFIX } from "@/lib/outreach-shared";

/**
 * Protokolliert eine tatsaechlich gesendete Nachricht.
 * Ohne diesen Schritt weiss das CRM nicht, was rausgegangen ist —
 * deshalb wird hier immer der volle Wortlaut mitgeschrieben.
 */
export async function POST(request: Request) {
  try {
    const user = await getOptionalUser();
    if (!user) return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });

    const body = await request.json();
    const leadId = String(body.leadId ?? "").trim();
    const text = String(body.text ?? "").trim();
    const channel = body.channel === "PHONE" ? "PHONE" : "INSTAGRAM_DM";
    const skipped = Boolean(body.skipped);

    if (!leadId) return NextResponse.json({ error: "leadId fehlt." }, { status: 400 });
    if (!skipped && !text) return NextResponse.json({ error: "Kein Nachrichtentext übergeben." }, { status: 400 });

    const dbUser = await ensureDbUser(user);
    const lead = await prisma.lead.findFirst({
      where: { id: leadId, OR: [{ createdById: dbUser.id }, { assignedToId: dbUser.id }] },
    });
    if (!lead) return NextResponse.json({ error: "Lead nicht gefunden." }, { status: 404 });

    if (skipped) {
      if (body.draftId) {
        await prisma.dmDraft.updateMany({
          where: { id: String(body.draftId), createdById: dbUser.id },
          data: { status: "SKIPPED" },
        });
      }
      return NextResponse.json({ ok: true, skipped: true });
    }

    const now = new Date();
    const [interaction] = await prisma.$transaction([
      prisma.interaction.create({
        data: {
          leadId: lead.id,
          type: channel === "PHONE" ? "PHONE" : "INSTAGRAM",
          note: text,
          createdById: dbUser.id,
        },
      }),
      prisma.lead.update({
        where: { id: lead.id },
        data: {
          status: lead.status === "NEW" || lead.status === "RESEARCHED" || lead.status === "TO_CONTACT"
            ? "CONTACTED"
            : lead.status,
          lastContactAt: now,
        },
      }),
    ]);

    if (body.draftId) {
      await prisma.dmDraft.updateMany({
        where: { id: String(body.draftId), createdById: dbUser.id },
        data: { status: "SENT", sentAt: now, bodyEdited: text },
      });
    }

    // Sequenz: Nach dem Erstkontakt genau EIN Follow-up einplanen (Tag 3).
    // Tag 7 wird erst nach dem Tag-3-Versand angelegt — so entsteht keine
    // Kette, die weiterlaeuft, obwohl der Lead laengst geantwortet hat.
    const step = Math.max(0, Math.min(FOLLOWUP_DAYS.length - 1, Number(body.sequenceStep ?? 0) || 0));
    const days = FOLLOWUP_DAYS[step];
    if (days !== undefined) {
      const existing = await prisma.task.findFirst({
        where: { leadId: lead.id, userId: dbUser.id, title: { startsWith: FOLLOWUP_TASK_PREFIX }, status: "OPEN" },
      });
      if (!existing) {
        await prisma.task.create({
          data: {
            title: `${FOLLOWUP_TASK_PREFIX}${lead.companyName} (Tag ${days})`,
            description:
              "Keine Antwort? Neuen Blickwinkel bringen statt nachzuhaken — und eine Ausstiegsklausel einbauen. " +
              "Nach maximal 3 Nachrichten ist Schluss.",
            category: "COLD_OUTREACH",
            priority: "MEDIUM",
            dueAt: new Date(Date.now() + days * 86_400_000),
            leadId: lead.id,
            userId: dbUser.id,
          },
        });
      }
    }

    const sentToday = await prisma.interaction.count({
      where: {
        createdById: dbUser.id,
        type: "INSTAGRAM",
        createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
      },
    });

    return NextResponse.json({ ok: true, interactionId: interaction.id, sentToday });
  } catch (error) {
    console.error("[POST /api/outreach/sent] Error:", error);
    return NextResponse.json({ error: "Protokollierung fehlgeschlagen." }, { status: 500 });
  }
}

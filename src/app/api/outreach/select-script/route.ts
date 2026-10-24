import { NextResponse } from "next/server";
import { z } from "zod";
import { getOptionalUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { leadScope } from "@/lib/workspace";
import { ensureDbUser } from "@/lib/outreach-user";

const SelectScriptSchema = z.object({
  leadId: z.string().min(1),
  scriptText: z.string().trim().min(1).max(20_000),
  channel: z.enum(["PHONE", "INSTAGRAM_DM"]).default("PHONE"),
  tone: z
    .enum(["CASUAL_VIENNESE", "PROFESSIONAL_DU", "FORMAL_SIE"])
    .default("CASUAL_VIENNESE"),
});

export async function POST(request: Request) {
  try {
    const user = await getOptionalUser();
    if (!user) return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });

    const rawBody = await request.json();
    const parseResult = SelectScriptSchema.safeParse(rawBody);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: "Ungültige Eingabedaten", details: parseResult.error.flatten() },
        { status: 400 }
      );
    }

    const { leadId, scriptText, channel, tone } = parseResult.data;
    const dbUser = await ensureDbUser(user);

    // Run within interactive transaction for atomicity & concurrency protection
    const result = await prisma.$transaction(async (tx) => {
      // 1. Check lead existence & tenant scope
      const lead = await tx.lead.findFirst({
        where: { id: leadId, ...(await leadScope(dbUser)) },
        select: { id: true, notes: true },
      });
      if (!lead) {
        throw new Error("LEAD_NOT_FOUND");
      }

      // 2. Idempotency check: avoid duplicates if clicked rapidly or retried
      const recentDraft = await tx.dmDraft.findFirst({
        where: {
          leadId: lead.id,
          createdById: dbUser.id,
          bodyGenerated: scriptText,
          status: "DRAFT",
          createdAt: { gte: new Date(Date.now() - 60_000) },
        },
        select: { id: true },
      });

      if (recentDraft) {
        return {
          draftId: recentDraft.id,
          interactionId: null,
          notes: lead.notes,
          deduplicated: true,
        };
      }

      // 3. Format header with Vienna timezone
      const dateFormatted = new Intl.DateTimeFormat("de-AT", {
        dateStyle: "short",
        timeStyle: "short",
        timeZone: "Europe/Vienna",
      }).format(new Date());

      const scriptHeader = `📞 Ausgewähltes Kaltakquise-Skript (${channel === "PHONE" ? "Telefon" : "DM"} · ${dateFormatted} Uhr):`;

      const existingNotes = (lead.notes ?? "").trim();
      const updatedNotes = existingNotes
        ? `${existingNotes}\n\n---\n${scriptHeader}\n${scriptText}`
        : `${scriptHeader}\n${scriptText}`;

      // 4. Create DmDraft
      const draft = await tx.dmDraft.create({
        data: {
          leadId: lead.id,
          channel,
          tone,
          variantIndex: 0,
          bodyGenerated: scriptText,
          status: "DRAFT",
          createdById: dbUser.id,
        },
        select: { id: true },
      });

      // 5. Create Interaction
      const interaction = await tx.interaction.create({
        data: {
          leadId: lead.id,
          type: "NOTE",
          note: `${scriptHeader}\n\n${scriptText}`,
          createdById: dbUser.id,
        },
        select: { id: true },
      });

      // 6. Update Lead Notes
      const updatedLead = await tx.lead.update({
        where: { id: lead.id },
        data: { notes: updatedNotes },
        select: { id: true, notes: true },
      });

      return {
        draftId: draft.id,
        interactionId: interaction.id,
        notes: updatedLead.notes,
        deduplicated: false,
      };
    });

    return NextResponse.json({
      ok: true,
      draftId: result.draftId,
      interactionId: result.interactionId,
      notes: result.notes,
      deduplicated: result.deduplicated,
    });
  } catch (error: any) {
    if (error?.message === "LEAD_NOT_FOUND") {
      return NextResponse.json({ error: "Lead nicht gefunden." }, { status: 404 });
    }
    console.error("[POST /api/outreach/select-script] Error:", error);
    return NextResponse.json({ error: "Fehler beim Speichern des Skripts." }, { status: 500 });
  }
}

export async function GET(request: Request) {
  try {
    const user = await getOptionalUser();
    if (!user) return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const leadId = searchParams.get("leadId");
    if (!leadId) return NextResponse.json({ error: "leadId fehlt." }, { status: 400 });

    const dbUser = await ensureDbUser(user);
    const lead = await prisma.lead.findFirst({
      where: { id: leadId, ...(await leadScope(dbUser)) },
      select: { id: true },
    });
    if (!lead) return NextResponse.json({ error: "Lead nicht gefunden." }, { status: 404 });

    const draft = await prisma.dmDraft.findFirst({
      where: {
        leadId: lead.id,
        createdById: dbUser.id,
        status: "DRAFT",
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ draft });
  } catch (error) {
    console.error("[GET /api/outreach/select-script] Error:", error);
    return NextResponse.json({ error: "Fehler beim Laden des Skripts." }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { getOptionalUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { pushToAppleEcosystem, isAppleSyncUser, TARGET_USER_EMAIL } from "@/services/apple-bridge";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getOptionalUser();
    if (!user) {
      return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
    }

    if (!isAppleSyncUser(user.email)) {
      return NextResponse.json(
        {
          error: `Apple Bridge ist exklusiv für den Account ${TARGET_USER_EMAIL} aktiviert.`,
        },
        { status: 403 }
      );
    }

    const { id } = await params;
    const body = await request.json();
    const { text, dueDate, setAsLeadFollowUp } = body;

    if (!text || !text.trim()) {
      return NextResponse.json(
        { error: "Bitte gib einen kurzen Erinnerungstext an." },
        { status: 400 }
      );
    }

    if (!dueDate) {
      return NextResponse.json(
        { error: "Bitte gib Datum und Uhrzeit für die Erinnerung an." },
        { status: 400 }
      );
    }

    const parsedDate = new Date(dueDate);
    if (isNaN(parsedDate.getTime())) {
      return NextResponse.json(
        { error: "Ungültiges Datumsformat." },
        { status: 400 }
      );
    }

    const lead = await prisma.lead.findUnique({
      where: { id },
    });

    if (!lead) {
      return NextResponse.json({ error: "Lead nicht gefunden." }, { status: 404 });
    }

    const title = `[${lead.companyName}] ${text.trim()}`;

    // Push to Apple Reminders (WORKSHIT) and Apple Calendar (Privat, 10 min blocker)
    const syncResult = await pushToAppleEcosystem({
      userEmail: user.email,
      title,
      notes: text.trim(),
      dueDate: parsedDate,
      leadId: lead.id,
      leadCompany: lead.companyName,
      leadPhone: lead.phone,
      leadAddress: [lead.address, lead.city].filter(Boolean).join(", "),
      durationMinutes: 10,
    });

    if (!syncResult.success) {
      return NextResponse.json(
        {
          error: syncResult.error || "Fehler beim Erstellen des Apple Reminders / Kalendereintrags.",
          details: syncResult,
        },
        { status: 500 }
      );
    }

    // Optional: update lead's nextFollowUpAt if requested
    if (setAsLeadFollowUp) {
      await prisma.lead.update({
        where: { id },
        data: {
          nextFollowUpAt: parsedDate,
          status: lead.status === "NEW" ? "FOLLOW_UP" : lead.status,
        },
      });
    }

    // Add note interaction to Lead timeline
    const formattedDate = new Intl.DateTimeFormat("de-AT", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(parsedDate);

    await prisma.interaction.create({
      data: {
        leadId: id,
        type: "NOTE",
        note: `Apple Reminder & Termin (${formattedDate} Uhr): ${text.trim()}`,
        createdById: user.id,
      },
    });

    return NextResponse.json({
      success: true,
      result: syncResult,
      message: syncResult.details || "In Apple Reminders ('WORKSHIT') und Kalender ('Privat') eingetragen.",
    });
  } catch (error: any) {
    console.error("[POST /api/leads/[id]/reminder] Error:", error);
    return NextResponse.json(
      { error: error?.message || "Interner Serverfehler beim Erstellen der Apple-Erinnerung." },
      { status: 500 }
    );
  }
}

import { NextResponse } from "next/server";
import { getOptionalUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ARCHIVED_STATUSES } from "@/lib/leads-list";
import { leadScope } from "@/lib/workspace";
import {
  getBatchAuditState,
  startBatchAudit,
  cancelBatchAudit,
} from "@/services/audit/run-lead-audit";

export async function GET() {
  try {
    const user = await getOptionalUser();
    if (!user) {
      return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
    }
    const state = getBatchAuditState();
    return NextResponse.json({ state });
  } catch (error) {
    console.error("[GET /api/leads/batch-audit] Error:", error);
    return NextResponse.json({ error: "Fehler beim Abrufen des Status." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getOptionalUser();
    if (!user) {
      return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
    }

    const state = getBatchAuditState();
    if (state.running) {
      return NextResponse.json(
        { error: "Ein Batch-Audit läuft bereits.", state },
        { status: 409 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const scope = await leadScope(user);

    let targetLeadIds: string[] = [];

    if (Array.isArray(body.leadIds) && body.leadIds.length > 0) {
      // Validate that leads are accessible to the user and have a website
      const accessibleLeads = await prisma.lead.findMany({
        where: {
          id: { in: body.leadIds },
          ...scope,
          website: { not: null },
        },
        select: { id: true },
      });
      targetLeadIds = accessibleLeads.map((l) => l.id);
    } else if (body.all === true) {
      // All active leads accessible to user with a website (exclude archived)
      const accessibleLeads = await prisma.lead.findMany({
        where: {
          ...scope,
          status: { notIn: ARCHIVED_STATUSES },
          website: { not: null },
          ...(body.onlyUnaudited ? { auditStatus: { in: ["idle", "skipped", "failed"] } } : {}),
        },
        select: { id: true },
        orderBy: { createdAt: "desc" },
      });
      targetLeadIds = accessibleLeads.map((l) => l.id);
    }

    if (targetLeadIds.length === 0) {
      return NextResponse.json(
        { error: "Keine gültigen Leads mit Website für den Scan gefunden." },
        { status: 400 }
      );
    }

    const started = await startBatchAudit(targetLeadIds);
    if (!started) {
      return NextResponse.json({ error: "Batch-Audit konnte nicht gestartet werden." }, { status: 409 });
    }

    return NextResponse.json({
      success: true,
      queued: targetLeadIds.length,
      state: getBatchAuditState(),
    });
  } catch (error) {
    console.error("[POST /api/leads/batch-audit] Error:", error);
    return NextResponse.json({ error: "Fehler beim Starten des Batch-Audits." }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    const user = await getOptionalUser();
    if (!user) {
      return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
    }
    cancelBatchAudit();
    return NextResponse.json({ success: true, state: getBatchAuditState() });
  } catch (error) {
    console.error("[DELETE /api/leads/batch-audit] Error:", error);
    return NextResponse.json({ error: "Fehler beim Abbrechen." }, { status: 500 });
  }
}

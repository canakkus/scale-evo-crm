import { NextResponse, after } from "next/server";
import { getOptionalUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { findAccessibleLead } from "@/lib/workspace";
import { AUDIT_RERUN_COOLDOWN_MS, enqueueLeadAudit } from "@/services/audit/run-lead-audit";

/** Lazy: wird erst beim Aufklappen der Rubrik "Website-Probleme" geladen. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getOptionalUser();
    if (!user) return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });

    const { id } = await params;
    const lead = await findAccessibleLead(user, id);
    if (!lead) return NextResponse.json({ error: "Lead nicht gefunden." }, { status: 404 });

    const [meta, issues] = await Promise.all([
      prisma.lead.findUnique({
        where: { id },
        select: { auditStatus: true, auditSeverity: true, auditAttemptedAt: true, website: true },
      }),
      prisma.leadAuditIssue.findMany({
        where: { leadId: id },
        orderBy: [{ createdAt: "asc" }],
      }),
    ]);

    return NextResponse.json({ audit: meta, issues });
  } catch (error) {
    console.error("[GET /api/leads/[id]/audit] Error:", error);
    return NextResponse.json({ error: "Fehler beim Laden des Audits." }, { status: 500 });
  }
}

/** Manuelles Neu-Auditieren (mit Cooldown). */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getOptionalUser();
    if (!user) return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });

    const { id } = await params;
    const lead = await findAccessibleLead(user, id);
    if (!lead) return NextResponse.json({ error: "Lead nicht gefunden." }, { status: 404 });

    const meta = await prisma.lead.findUnique({
      where: { id },
      select: { website: true, auditStatus: true, auditAttemptedAt: true },
    });
    if (!meta?.website) {
      return NextResponse.json({ error: "Lead hat keine Website." }, { status: 400 });
    }
    if (meta.auditStatus === "pending" || meta.auditStatus === "running") {
      return NextResponse.json({ error: "Audit läuft bereits." }, { status: 409 });
    }
    if (
      meta.auditAttemptedAt &&
      Date.now() - meta.auditAttemptedAt.getTime() < AUDIT_RERUN_COOLDOWN_MS
    ) {
      const waitMin = Math.ceil(
        (AUDIT_RERUN_COOLDOWN_MS - (Date.now() - meta.auditAttemptedAt.getTime())) / 60_000,
      );
      return NextResponse.json(
        { error: `Cooldown aktiv. Neuer Scan in ca. ${waitMin} Min. möglich.` },
        { status: 429 },
      );
    }

    await prisma.lead.update({ where: { id }, data: { auditStatus: "pending" } });
    after(() => enqueueLeadAudit(id));

    return NextResponse.json({ ok: true }, { status: 202 });
  } catch (error) {
    console.error("[POST /api/leads/[id]/audit] Error:", error);
    return NextResponse.json({ error: "Fehler beim Starten des Audits." }, { status: 500 });
  }
}

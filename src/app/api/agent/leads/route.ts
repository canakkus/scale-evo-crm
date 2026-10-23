import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { LeadStatus } from "@prisma/client";

function isAuthorized(request: Request): boolean {
  const configured = process.env.AGENT_API_SECRET || "ultra_scaleevo_auth_99f2a71b";
  const auth = request.headers.get("authorization");
  const provided = auth?.startsWith("Bearer ")
    ? auth.substring(7).trim()
    : request.headers.get("x-agent-secret")?.trim();
  return Boolean(provided && provided === configured);
}

const unauthorized = () =>
  NextResponse.json({ error: "Unauthorized. Invalid agent secret." }, { status: 401 });

/**
 * GET /api/agent/leads?stage=raw&limit=50
 * Guy fetches raw leads from Hunter. stage=raw (default) | all-counts via ?counts=1 (for Ultra).
 */
export async function GET(request: Request) {
  if (!isAuthorized(request)) return unauthorized();
  const { searchParams } = new URL(request.url);

  if (searchParams.get("counts")) {
    const [raw, researched, rejected] = await Promise.all([
      prisma.lead.count({ where: { enrichmentStatus: "raw" } }),
      prisma.lead.count({ where: { source: { contains: "Hunter" }, status: "RESEARCHED" } }),
      prisma.lead.count({ where: { source: { contains: "Hunter" }, status: "NOT_RELEVANT" } }),
    ]);
    return NextResponse.json({ raw, qualified: researched, rejected });
  }

  const limit = Math.min(Math.max(Number(searchParams.get("limit")) || 50, 1), 200);
  const leads = await prisma.lead.findMany({
    where: { enrichmentStatus: "raw" },
    orderBy: { createdAt: "asc" },
    take: limit,
    select: {
      id: true, companyName: true, industry: true, city: true, address: true,
      website: true, treatwellUrl: true, instagram: true, phone: true, email: true,
      contactPerson: true, notes: true, source: true, createdAt: true,
    },
  });
  return NextResponse.json({ count: leads.length, leads });
}

/**
 * PATCH /api/agent/leads
 * Guy qualifies or rejects a raw lead.
 * { id, decision: "QUALIFY" | "REJECT", score?, priority?, notes?, opportunityTags?,
 *   website?, email?, phone?, instagram?, contactPerson?, nextFollowUpAt? }
 */
export async function PATCH(request: Request) {
  if (!isAuthorized(request)) return unauthorized();
  try {
    const body = await request.json();
    if (!body.id || !["QUALIFY", "REJECT"].includes(body.decision)) {
      return NextResponse.json({ error: "id and decision (QUALIFY|REJECT) required" }, { status: 400 });
    }
    const existing = await prisma.lead.findUnique({ where: { id: body.id } });
    if (!existing) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

    const note = body.notes
      ? `${existing.notes ? existing.notes + "\n\n" : ""}[Guy ${new Date().toLocaleDateString("de-AT")}]: ${body.notes}`
      : existing.notes;

    if (body.decision === "REJECT") {
      const lead = await prisma.lead.update({
        where: { id: body.id },
        data: { status: "NOT_RELEVANT" as LeadStatus, enrichmentStatus: "rejected", notes: note },
      });
      return NextResponse.json({ success: true, id: lead.id, status: lead.status });
    }

    const followUp = body.nextFollowUpAt ? new Date(body.nextFollowUpAt) : null;
    const lead = await prisma.lead.update({
      where: { id: body.id },
      data: {
        status: "RESEARCHED" as LeadStatus,
        enrichmentStatus: "completed",
        auditStatus: (body.website || existing.website) ? "pending" : "idle",
        notes: note,
        ...(typeof body.score === "number" ? { score: body.score } : {}),
        ...(["LOW", "MEDIUM", "HIGH", "URGENT"].includes(body.priority) ? { priority: body.priority } : {}),
        ...(Array.isArray(body.opportunityTags) ? { opportunityTags: body.opportunityTags } : {}),
        ...(body.website ? { website: body.website } : {}),
        ...(body.email ? { email: body.email } : {}),
        ...(body.phone ? { phone: body.phone } : {}),
        ...(body.instagram ? { instagram: body.instagram } : {}),
        ...(body.contactPerson ? { contactPerson: body.contactPerson } : {}),
        ...(followUp && !isNaN(followUp.getTime()) ? { nextFollowUpAt: followUp } : {}),
      },
    });
    return NextResponse.json({ success: true, id: lead.id, status: lead.status });
  } catch (error: any) {
    return NextResponse.json({ error: "Failed to update lead", details: error?.message }, { status: 500 });
  }
}

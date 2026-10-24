import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ARCHIVED_STATUSES, NOT_RELEVANT_PRIORITY_RESET } from "@/lib/leads-list";
import { pushToAppleEcosystem } from "@/services/apple-bridge";
import type { LeadStatus, Priority, InteractionType, TaskCategory } from "@prisma/client";

const FALLBACK_USER_EMAIL = "canakkus378@gmail.com";

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
 * GET /api/agent/leads
 * 
 * Modes:
 * 1. Counts (Ultra Manager): ?counts=1
 * 2. Coach Queue (Cold Calling): ?for=coach&limit=10
 *    -> Qualified leads with phone number, HIGH/URGENT priority, status TO_CONTACT or overdue FOLLOW_UP
 * 3. Guy Queue (Raw Intake Triage): ?stage=raw&limit=20 (Default if stage=raw or no params)
 * 4. General Filter: ?status=...&priority=...&hasPhone=true&limit=...
 */
export async function GET(request: Request) {
  if (!isAuthorized(request)) return unauthorized();
  const { searchParams } = new URL(request.url);

  // 1. Ultra Counts Mode
  if (searchParams.get("counts")) {
    const newAppointmentsSince = searchParams.get("newAppointmentsSince");
    const appointmentSinceDate = newAppointmentsSince ? new Date(newAppointmentsSince) : null;

    const [raw, researched, toContact, followUp, appointments, rejected, newAppointments] = await Promise.all([
      prisma.lead.count({
        where: {
          enrichmentStatus: "raw",
          status: { notIn: ARCHIVED_STATUSES },
        },
      }),
      // Only count leads sourced by the agent pipeline (Hunter/Guy) for qualified
      prisma.lead.count({ where: { source: { contains: "Hunter" }, status: "RESEARCHED" } }),
      prisma.lead.count({ where: { source: { contains: "Hunter" }, status: "TO_CONTACT" } }),
      prisma.lead.count({ where: { source: { contains: "Hunter" }, status: "FOLLOW_UP" } }),
      prisma.lead.count({ where: { status: "APPOINTMENT" } }),
      prisma.lead.count({ where: { source: { contains: "Hunter" }, status: "NOT_RELEVANT" } }),
      appointmentSinceDate && !isNaN(appointmentSinceDate.getTime())
        ? prisma.lead.count({
            where: {
              status: "APPOINTMENT",
              updatedAt: { gte: appointmentSinceDate },
            },
          })
        : null,
    ]);

    return NextResponse.json({
      raw,
      qualified: researched + toContact + followUp,
      toContact,
      followUp,
      appointments,
      rejected,
      ...(newAppointments !== null ? { newAppointmentsSince: newAppointments } : {}),
    });
  }

  const limit = Math.min(Math.max(Number(searchParams.get("limit")) || 20, 1), 100);

  // 2. Coach Mode (Cold Calling Queue)
  if (searchParams.get("for") === "coach") {
    const now = new Date();
    const leads = await prisma.lead.findMany({
      where: {
        phone: { not: null },
        priority: "HIGH",
        status: { in: ["TO_CONTACT", "FOLLOW_UP"] },
        OR: [
          { status: "TO_CONTACT" },
          {
            status: "FOLLOW_UP",
            nextFollowUpAt: { lte: now },
          },
        ],
      },
      orderBy: [
        { priority: "desc" },
        { nextFollowUpAt: "asc" },
        { createdAt: "desc" },
      ],
      take: limit,
      select: {
        id: true,
        companyName: true,
        industry: true,
        city: true,
        website: true,
        phone: true,
        contactPerson: true,
        notes: true,
        status: true,
        priority: true,
        score: true,
        opportunityTags: true,
        nextFollowUpAt: true,
        createdAt: true,
      },
    });

    return NextResponse.json({
      queue: "coach",
      count: leads.length,
      leads: leads.map((l) => ({
        id: l.id,
        companyName: l.companyName,
        phone: l.phone,
        contactPerson: l.contactPerson,
        city: l.city,
        website: l.website,
        industry: l.industry,
        status: l.status,
        priority: l.priority,
        score: l.score,
        opportunityTags: l.opportunityTags,
        nextFollowUpAt: l.nextFollowUpAt,
        notes: l.notes,
      })),
    });
  }

  // 3. Stage RAW (Guy Mode) or Default
  const stage = searchParams.get("stage")?.toLowerCase();
  const statusParam = searchParams.get("status")?.toUpperCase() as LeadStatus | undefined;
  const priorityParam = searchParams.get("priority")?.toUpperCase() as Priority | undefined;
  const hasPhone = searchParams.get("hasPhone") === "true";

  const whereClause: any = {};

  if (stage === "raw" || (!stage && !statusParam)) {
    whereClause.enrichmentStatus = "raw";
    whereClause.status = { notIn: ARCHIVED_STATUSES };
  } else if (stage === "qualified") {
    whereClause.enrichmentStatus = { in: ["completed", "idle"] };
    whereClause.status = { notIn: ARCHIVED_STATUSES };
  }

  if (statusParam) whereClause.status = statusParam;
  if (priorityParam) {
    whereClause.priority = priorityParam;
    if (statusParam !== "NOT_RELEVANT") {
      whereClause.AND = [...(whereClause.AND || []), { status: { not: "NOT_RELEVANT" } }];
    }
  }
  if (hasPhone) whereClause.phone = { not: null };

  const leads = await prisma.lead.findMany({
    where: whereClause,
    orderBy: { createdAt: "asc" },
    take: limit,
    select: {
      id: true,
      companyName: true,
      industry: true,
      city: true,
      address: true,
      website: true,
      treatwellUrl: true,
      instagram: true,
      phone: true,
      email: true,
      contactPerson: true,
      notes: true,
      source: true,
      status: true,
      priority: true,
      score: true,
      opportunityTags: true,
      nextFollowUpAt: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ count: leads.length, leads });
}

/**
 * PATCH /api/agent/leads
 * 
 * Supports:
 * A) Guy Triage: decision = "QUALIFY" | "REJECT"
 * B) Coach Call Result:
 *    - callOutcome: "APPOINTMENT" | "NO_ANSWER" | "CALL_BACK" | "NOT_INTERESTED" | "LOST"
 *    - appointmentAt: ISO Date string (if APPOINTMENT)
 *    - followUpAt: ISO Date string (if NO_ANSWER / CALL_BACK)
 *    - notes: summary of conversation
 */
export async function PATCH(request: Request) {
  if (!isAuthorized(request)) return unauthorized();

  try {
    const body = await request.json();
    if (!body.id) {
      return NextResponse.json({ error: "Missing required field: id" }, { status: 400 });
    }

    const lead = await prisma.lead.findUnique({
      where: { id: body.id },
      include: { assignedTo: true },
    });

    if (!lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    // Resolve user for assignments & Apple sync
    const targetUser = lead.assignedTo || await prisma.user.findFirst({
      where: { email: { contains: "canakkus378", mode: "insensitive" } },
    });

    const now = new Date();
    const dateStamp = now.toLocaleDateString("de-AT");

    // ==========================================
    // Flow 1: Coach Call Result Logging
    // ==========================================
    if (body.callOutcome) {
      const outcome = String(body.callOutcome).toUpperCase();
      let newStatus: LeadStatus = lead.status;
      let nextFollowUp: Date | null = null;
      let createdTask = null;
      let appleSyncResult = null;

      const callNote = body.notes
        ? `\n\n[Coach Call ${dateStamp}]: ${body.notes}`
        : `\n\n[Coach Call ${dateStamp}]: Outcome ${outcome}`;

      if (outcome === "APPOINTMENT") {
        newStatus = "APPOINTMENT";
        if (body.appointmentAt) {
          const appDate = new Date(body.appointmentAt);
          if (!isNaN(appDate.getTime())) {
            nextFollowUp = appDate;

            // Create Task & sync to Apple Calendar & Reminders
            if (targetUser) {
              createdTask = await prisma.task.create({
                data: {
                  title: `Termin: ${lead.companyName} (${lead.contactPerson || "Inhaber"})`,
                  description: body.notes || "Telefonisch vereinbarter Termin durch Coach Agent.",
                  category: "MEETING" as TaskCategory,
                  priority: "HIGH",
                  aiGenerated: true,
                  userId: targetUser.id,
                  leadId: lead.id,
                  dueAt: appDate,
                },
              });

              try {
                appleSyncResult = await pushToAppleEcosystem({
                  userEmail: targetUser.email || FALLBACK_USER_EMAIL,
                  title: `Call/Meeting: ${lead.companyName}`,
                  notes: `Ansprechpartner: ${lead.contactPerson || "N/A"}\nTel: ${lead.phone || "N/A"}\nNotizen: ${body.notes || ""}`,
                  dueDate: appDate,
                  leadId: lead.id,
                  leadCompany: lead.companyName,
                  leadPhone: lead.phone,
                  leadAddress: [lead.address, lead.city].filter(Boolean).join(", "),
                  durationMinutes: 30,
                });
              } catch (appleErr) {
                console.error("[Coach] Apple sync error:", appleErr);
              }
            }
          }
        }
      } else if (outcome === "NO_ANSWER" || outcome === "CALL_BACK" || outcome === "FOLLOW_UP") {
        newStatus = "FOLLOW_UP";
        if (body.followUpAt) {
          const fuDate = new Date(body.followUpAt);
          if (!isNaN(fuDate.getTime())) nextFollowUp = fuDate;
        } else {
          // Default: 2 business days later
          nextFollowUp = new Date(now.getTime() + 48 * 60 * 60 * 1000);
        }
      } else if (outcome === "NOT_INTERESTED" || outcome === "LOST") {
        newStatus = "NOT_RELEVANT";
      }

      // Record interaction log
      if (targetUser) {
        await prisma.interaction.create({
          data: {
            leadId: lead.id,
            createdById: targetUser.id,
            type: "COLD_CALL" as InteractionType,
            note: `[Call ${outcome}]: ${body.notes || "N/A"}`,
          },
        });
      }

      const updatedLead = await prisma.lead.update({
        where: { id: lead.id },
        data: {
          status: newStatus,
          notes: (lead.notes || "") + callNote,
          nextFollowUpAt: nextFollowUp,
          ...(newStatus === "NOT_RELEVANT"
            ? {
                isFocus: false,
                priority: "LOW",
                prioritySource: "SYSTEM",
                priorityRatedAt: null,
                priorityRatedById: null,
                priorityRatedByName: null,
              }
            : {}),
        },
      });

      return NextResponse.json({
        success: true,
        action: "call_logged",
        lead: {
          id: updatedLead.id,
          companyName: updatedLead.companyName,
          status: updatedLead.status,
          nextFollowUpAt: updatedLead.nextFollowUpAt,
        },
        task: createdTask ? { id: createdTask.id, dueAt: createdTask.dueAt } : null,
        appleSync: appleSyncResult,
      });
    }

    // ==========================================
    // Flow 2: Guy Triage (QUALIFY / REJECT)
    // ==========================================
    if (body.decision) {
      const decision = String(body.decision).toUpperCase();

      // Rule: Kein Urteil ohne Notiz!
      if (!body.notes || typeof body.notes !== "string" || !body.notes.trim()) {
        return NextResponse.json(
          { error: "Validation failed: notes is required for decision QUALIFY or REJECT." },
          { status: 400 }
        );
      }

      const triageNote = `${lead.notes ? lead.notes + "\n\n" : ""}[Guy ${dateStamp}]: ${body.notes.trim()}`;

      if (decision === "REJECT") {
        const rejectedLead = await prisma.lead.update({
          where: { id: lead.id },
          data: {
            status: "NOT_RELEVANT",
            isFocus: false,
            priority: "LOW",
            prioritySource: "SYSTEM",
            priorityRatedAt: null,
            priorityRatedById: null,
            priorityRatedByName: null,
            enrichmentStatus: "rejected",
            notes: triageNote,
          },
        });
        return NextResponse.json({ success: true, id: rejectedLead.id, status: rejectedLead.status });
      }

      if (decision === "QUALIFY") {
        // Rule: score & opportunityTags are required when qualifying
        if (typeof body.score !== "number" || !Array.isArray(body.opportunityTags) || body.opportunityTags.length === 0) {
          return NextResponse.json(
            { error: "Validation failed: QUALIFY requires score (number) and opportunityTags (array with at least 1 tag)." },
            { status: 400 }
          );
        }

        const followUp = body.nextFollowUpAt ? new Date(body.nextFollowUpAt) : null;
        const qualifiedLead = await prisma.lead.update({
          where: { id: lead.id },
          data: {
            status: "TO_CONTACT", // Qualified leads are immediately ready for Coach
            enrichmentStatus: "completed",
            auditStatus: (body.website || lead.website) ? "pending" : "idle",
            notes: triageNote,
            score: body.score,
            priority: (["LOW", "MEDIUM", "HIGH"].includes(body.priority) ? body.priority : "HIGH") as Priority,
            opportunityTags: body.opportunityTags,
            ...(body.website ? { website: body.website } : {}),
            ...(body.email ? { email: body.email } : {}),
            ...(body.phone ? { phone: body.phone } : {}),
            ...(body.instagram ? { instagram: body.instagram } : {}),
            ...(body.contactPerson ? { contactPerson: body.contactPerson } : {}),
            ...(followUp && !isNaN(followUp.getTime()) ? { nextFollowUpAt: followUp } : {}),
          },
        });

        return NextResponse.json({ success: true, id: qualifiedLead.id, status: qualifiedLead.status });
      }

      return NextResponse.json({ error: "Invalid decision: must be QUALIFY or REJECT" }, { status: 400 });
    }

    return NextResponse.json({ error: "Missing action: provide either callOutcome or decision" }, { status: 400 });
  } catch (error: any) {
    console.error("[Agent Leads Patch Error]:", error);
    return NextResponse.json({ error: "Failed to update lead", details: error?.message }, { status: 500 });
  }
}

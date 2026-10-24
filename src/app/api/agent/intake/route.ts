import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { NOT_RELEVANT_PRIORITY_RESET } from "@/lib/leads-list";
import { pushToAppleEcosystem } from "@/services/apple-bridge";
import type { Priority, LeadStatus, TaskCategory } from "@prisma/client";

// Primary fallback user for automated agent assignments
const FALLBACK_USER_EMAIL = "canakkus378@gmail.com";

function getProvidedSecret(request: Request): string | null {
  const authHeader = request.headers.get("authorization");
  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authHeader.substring(7).trim();
  }
  const customHeader = request.headers.get("x-agent-secret");
  if (customHeader) {
    return customHeader.trim();
  }
  return null;
}

function isAuthorized(request: Request): boolean {
  const configuredSecret = process.env.AGENT_API_SECRET || "ultra_scaleevo_auth_99f2a71b";
  const provided = getProvidedSecret(request);
  return Boolean(provided && provided === configuredSecret);
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized. Invalid agent secret." }, { status: 401 });
  }

  return NextResponse.json({
    status: "online",
    agent: "Ultra Agent Intake API",
    version: "1.0",
    timestamp: new Date().toISOString(),
  });
}

export async function POST(request: Request) {
  try {
    if (!isAuthorized(request)) {
      return NextResponse.json({ error: "Unauthorized. Invalid agent secret." }, { status: 401 });
    }

    const body = await request.json();

    // 1. Resolve Target User (Can)
    const user = await prisma.user.findFirst({
      where: {
        email: {
          contains: "canakkus378",
          mode: "insensitive",
        },
      },
    });

    if (!user) {
      return NextResponse.json(
        { error: "Target CRM user (Can) not found in database." },
        { status: 500 }
      );
    }

    let lead = null;
    let appleSyncResult = null;
    let createdTask = null;

    // 2. Lead Handling (if companyName is provided)
    if (body.companyName && typeof body.companyName === "string" && body.companyName.trim()) {
      const companyName = body.companyName.trim();
      const website = body.website?.trim() || null;
      const treatwellUrl = body.treatwellUrl?.trim() || null;
      const email = body.email?.trim() || null;
      const phone = body.phone?.trim() || null;

      // Duplicate check: Look for existing lead by website, treatwellUrl, email, phone, or companyName
      const existing = await prisma.lead.findFirst({
        where: {
          OR: [
            ...(website ? [{ website: { equals: website, mode: "insensitive" as const } }] : []),
            ...(treatwellUrl ? [{ treatwellUrl: { equals: treatwellUrl, mode: "insensitive" as const } }] : []),
            ...(email ? [{ email: { equals: email, mode: "insensitive" as const } }] : []),
            ...(phone ? [{ phone: { equals: phone, mode: "insensitive" as const } }] : []),
            { companyName: { equals: companyName, mode: "insensitive" as const } },
          ],
        },
      });

      // Hunter stage: raw, unfiltered leads. Guy later qualifies/rejects them via /api/agent/leads.
      const isRaw = String(body.stage || "").toUpperCase() === "RAW";

      // Raw leads default to LOW priority so they never pollute high-priority queues before Guy grades them.
      const priorityValue: Priority = (["LOW", "MEDIUM", "HIGH"].includes(body.priority)
        ? body.priority
        : isRaw ? "LOW" : "HIGH") as Priority;

      const statusValue: LeadStatus = (["NEW", "RESEARCHED", "CONTACTED", "INTERESTED", "NOT_RELEVANT"].includes(body.status)
        ? body.status
        : "NEW") as LeadStatus;

      const followUpDate = body.nextFollowUpAt ? new Date(body.nextFollowUpAt) : null;
      const isValidFollowUp = followUpDate && !isNaN(followUpDate.getTime());

      const isArchived = ["NOT_RELEVANT", "LOST", "VISITED_NO_INTEREST"].includes(existing?.status as string);
      if (existing && (isRaw || isArchived)) {
        // Raw duplicates and archived leads (NOT_RELEVANT, LOST, VISITED_NO_INTEREST) are skipped and never re-prioritized.
        return NextResponse.json({
          success: true,
          duplicate: true,
          lead: { id: existing.id, companyName: existing.companyName, status: existing.status },
        });
      }

      if (existing) {
        // Update existing active lead with enrichment notes & follow-up (protect user priority rating)
        lead = await prisma.lead.update({
          where: { id: existing.id },
          data: {
            notes: body.notes
              ? `${existing.notes ? existing.notes + "\n\n" : ""}[Ultra Update ${new Date().toLocaleDateString("de-AT")}]: ${body.notes}`
              : existing.notes,
            ...(isValidFollowUp ? { nextFollowUpAt: followUpDate } : {}),
            ...(body.phone && !existing.phone ? { phone: body.phone } : {}),
            ...(body.instagram && !existing.instagram ? { instagram: body.instagram } : {}),
            ...(existing.prioritySource === "USER" ? {} : { priority: priorityValue }),
          },
        });
      } else {
        // Construct prefix if huntQuery / huntCity or campaign provided
        let leadNotes = body.notes || "";
        const queryPart = body.huntQuery || body.query;
        const cityPart = body.huntCity || body.city || "";
        if (isRaw && (queryPart || cityPart)) {
          const dateStr = new Date().toLocaleDateString("de-AT");
          const prefix = `[Hunter: ${[queryPart, cityPart].filter(Boolean).join(" / ")} · ${dateStr}]`;
          leadNotes = leadNotes ? `${prefix} ${leadNotes}` : prefix;
        } else if (!leadNotes) {
          leadNotes = isRaw ? "Rohlead via Hunter Agent." : "Qualifiziert durch Ultra Agent.";
        }

        // Create brand new Lead
        lead = await prisma.lead.create({
          data: {
            companyName,
            industry: body.industry || "Fitness & Coaching",
            city: body.city || "Wien",
            address: body.address || null,
            website,
            treatwellUrl,
            instagram: body.instagram || null,
            phone: body.phone || null,
            email,
            contactPerson: body.contactPerson || null,
            notes: leadNotes,
            source: body.source || (isRaw ? "Hunter (Grok)" : "Ultra Agent (Grok)"),
            status: statusValue,
            ...(statusValue === "NOT_RELEVANT"
              ? NOT_RELEVANT_PRIORITY_RESET
              : {
                  priority: priorityValue,
                  prioritySource: "SYSTEM",
                }),
            score: typeof body.score === "number" ? body.score : isRaw ? 0 : 75,
            opportunityTags: Array.isArray(body.opportunityTags) ? body.opportunityTags : undefined,
            enrichmentStatus: isRaw ? "raw" : "completed",
            auditStatus: website && !isRaw && statusValue !== "NOT_RELEVANT" ? "pending" : "idle",
            createdById: user.id,
            assignedToId: user.id,
            ...(isValidFollowUp && statusValue !== "NOT_RELEVANT" ? { nextFollowUpAt: followUpDate } : {}),
          },
        });
      }

      // Sync follow-up to Apple Calendar & Reminders if scheduled (never for archived leads)
      if (isValidFollowUp && followUpDate && !isRaw && !["NOT_RELEVANT", "LOST", "VISITED_NO_INTEREST"].includes(lead.status)) {
        try {
          appleSyncResult = await pushToAppleEcosystem({
            userEmail: user.email || FALLBACK_USER_EMAIL,
            title: `Follow-up: ${lead.companyName}`,
            notes: `Ultra Agent Lead. Status: ${lead.status}. Notiz: ${body.notes || "Keine"}`,
            dueDate: followUpDate,
            leadId: lead.id,
            leadCompany: lead.companyName,
            leadPhone: lead.phone,
            leadAddress: [lead.address, lead.city].filter(Boolean).join(", "),
            durationMinutes: 15,
          });
        } catch (appleErr: any) {
          console.error("[Agent Intake] Apple Sync Warning:", appleErr);
        }
      }
    }

    // 3. Task Handling (if task details or meeting details provided)
    if (body.task && typeof body.task === "object") {
      const taskData = body.task;
      const taskDue = taskData.dueAt ? new Date(taskData.dueAt) : null;
      const isValidTaskDue = taskDue && !isNaN(taskDue.getTime());

      createdTask = await prisma.task.create({
        data: {
          title: taskData.title || `Task von Ultra: ${body.companyName || "Lead Action"}`,
          description: taskData.description || body.notes || "Automatisch durch Ultra generiert.",
          category: (taskData.category || "COLD_CALL") as TaskCategory,
          priority: (taskData.priority || "HIGH") as Priority,
          aiGenerated: true,
          userId: user.id,
          leadId: lead ? lead.id : undefined,
          ...(isValidTaskDue ? { dueAt: taskDue } : {}),
        },
      });

      // If task has a specific date and no lead follow-up already synced, sync task
      if (isValidTaskDue && taskDue && !appleSyncResult) {
        try {
          appleSyncResult = await pushToAppleEcosystem({
            userEmail: user.email || FALLBACK_USER_EMAIL,
            title: createdTask.title,
            notes: createdTask.description,
            dueDate: taskDue,
            leadId: lead ? lead.id : null,
            durationMinutes: 20,
          });
        } catch (appleErr: any) {
          console.error("[Agent Intake] Task Apple Sync Warning:", appleErr);
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: "Agent intake successfully processed.",
      lead: lead
        ? {
            id: lead.id,
            companyName: lead.companyName,
            status: lead.status,
            priority: lead.priority,
            nextFollowUpAt: lead.nextFollowUpAt,
          }
        : null,
      task: createdTask
        ? {
            id: createdTask.id,
            title: createdTask.title,
            dueAt: createdTask.dueAt,
          }
        : null,
      appleSync: appleSyncResult,
    });
  } catch (error: any) {
    console.error("[Agent Intake API Error]:", error);
    return NextResponse.json(
      {
        error: "Failed to process agent intake",
        details: error?.message || String(error),
      },
      { status: 500 }
    );
  }
}

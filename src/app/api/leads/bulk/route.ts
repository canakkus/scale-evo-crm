import { NextResponse } from "next/server";
import type { LeadStatus } from "@prisma/client";
import { getOptionalUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  isArchivedStatus,
  NOT_RELEVANT_PRIORITY_RESET,
  systemPriorityForScore,
} from "@/lib/leads-list";
import { leadScope } from "@/lib/workspace";

export async function PATCH(request: Request) {
  try {
    const user = await getOptionalUser();
    if (!user) {
      return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const rawIds: unknown[] = Array.isArray(body.leadIds)
      ? body.leadIds
      : Array.isArray(body.ids)
      ? body.ids
      : [];

    const leadIds = Array.from(
      new Set(
        rawIds
          .filter((id): id is string => typeof id === "string" && id.trim().length > 0)
          .map((id) => id.trim())
      )
    ).slice(0, 500);

    if (leadIds.length === 0) {
      return NextResponse.json(
        { error: "Keine Leads ausgewählt." },
        { status: 400 }
      );
    }

    const action =
      body.action === "unarchive" || (body.status && !isArchivedStatus(body.status))
        ? "unarchive"
        : "archive";

    const scope = await leadScope(user);
    const accessibleLeads = await prisma.lead.findMany({
      where: {
        AND: [scope, { id: { in: leadIds } }],
      },
      select: { id: true, status: true, score: true },
    });

    if (accessibleLeads.length === 0) {
      return NextResponse.json(
        { error: "Keine zugänglichen Leads gefunden." },
        { status: 404 }
      );
    }

    const accessibleIds = accessibleLeads.map((l) => l.id);

    if (action === "archive") {
      const targetStatus: LeadStatus =
        body.status && isArchivedStatus(body.status)
          ? (body.status as LeadStatus)
          : "NOT_RELEVANT";

      await prisma.lead.updateMany({
        where: { id: { in: accessibleIds } },
        data: {
          status: targetStatus,
          isFocus: false,
          ...(targetStatus === "NOT_RELEVANT" ? NOT_RELEVANT_PRIORITY_RESET : {}),
        },
      });

      return NextResponse.json({
        success: true,
        action: "archive",
        status: targetStatus,
        count: accessibleIds.length,
        updatedIds: accessibleIds,
      });
    }

    // action === "unarchive"
    const targetStatus: LeadStatus =
      body.status && !isArchivedStatus(body.status)
        ? (body.status as LeadStatus)
        : "NEW";

    await prisma.$transaction(
      accessibleLeads.map((lead) =>
        prisma.lead.update({
          where: { id: lead.id },
          data: {
            status: targetStatus,
            ...(lead.status === "NOT_RELEVANT"
              ? {
                  priority: systemPriorityForScore(lead.score),
                  prioritySource: "SYSTEM",
                  priorityRatedAt: null,
                  priorityRatedById: null,
                  priorityRatedByName: null,
                }
              : {}),
          },
        })
      )
    );

    return NextResponse.json({
      success: true,
      action: "unarchive",
      status: targetStatus,
      count: accessibleIds.length,
      updatedIds: accessibleIds,
    });
  } catch (error) {
    console.error("[PATCH /api/leads/bulk] Error:", error);
    return NextResponse.json(
      { error: "Fehler bei der Massenaktion." },
      { status: 500 }
    );
  }
}

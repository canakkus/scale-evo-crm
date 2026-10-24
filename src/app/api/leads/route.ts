import { NextResponse, after } from "next/server";
import { getOptionalUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseCoordinates } from "@/lib/geo";
import { notifyLeadCreated } from "@/lib/discord";
import { listLeads } from "@/lib/leads-list";

export async function GET(request: Request) {
  try {
    const user = await getOptionalUser();
    if (!user) {
      return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "25", 10);
    const data = await listLeads(user, {
      search: searchParams.get("search"),
      status: searchParams.get("status"),
      acquisitionType: searchParams.get("acquisitionType"),
      priority: searchParams.get("priority"),
      isFocus: searchParams.get("isFocus"),
      archived: searchParams.get("archived") === "true",
      includeArchived: searchParams.get("includeArchived") === "true",
      relevantOnly: searchParams.get("relevantOnly") === "true",
      createdById: searchParams.get("createdById"),
      assignedToId: searchParams.get("assignedToId"),
      webPresence: searchParams.get("webPresence"),
      enrichmentStatus: searchParams.get("enrichmentStatus"),
      source: searchParams.get("source"),
      industry: searchParams.get("industry"),
      updatedDate: searchParams.get("updatedDate"),
      sortBy: searchParams.get("sortBy"),
      sortOrder: searchParams.get("sortOrder"),
      page: Number.isNaN(page) ? 1 : page,
      limit: Number.isNaN(limit) ? 25 : limit,
    });

    return NextResponse.json(data);
  } catch (error) {
    console.error("[GET /api/leads] Error:", error);
    return NextResponse.json({ error: "Fehler beim Laden der Leads." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getOptionalUser();
    if (!user) {
      return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
    }

    // Ensure db User record exists for logged-in Supabase user
    let dbUser = await prisma.user.findUnique({ where: { id: user.id } });
    if (!dbUser) {
      dbUser = await prisma.user.create({
        data: {
          id: user.id,
          email: user.email ?? "unknown@scaleevo.at",
          displayName: user.user_metadata?.displayName ?? user.email?.split("@")[0] ?? "Can",
        },
      });
    }

    const data = await request.json();

    if (!data.companyName?.trim()) {
      return NextResponse.json({ error: "Firmenname ist erforderlich." }, { status: 400 });
    }

    // Gratis-Verortung: Scout- und Places-Autofill-Pfade liefern die Koordinaten
    // aus einem Treffer, der ohnehin schon bezahlt wurde. Nur wenn BEIDE Werte
    // plausibel sind, gilt der Lead als verortet — ein halbes Paar waere eine
    // Koordinate im Nullmeridian-Nirgendwo.
    const coords = parseCoordinates(data.latitude, data.longitude);

    const lead = await prisma.lead.create({
      data: {
        companyName: data.companyName.trim(),
        industry: data.industry || null,
        address: data.address || null,
        city: data.city || null,
        webPresence: data.webPresence || "WEBSITE",
        website: data.website || null,
        treatwellUrl: data.treatwellUrl || null,
        phone: data.phone || null,
        email: data.email || null,
        instagram: data.instagram || null,
        googleMapsUrl: data.googleMapsUrl || null,
        googleRating: data.googleRating != null ? parseFloat(data.googleRating) : null,
        googleReviewCount: data.googleReviewCount != null ? parseInt(data.googleReviewCount, 10) : null,
        contactPerson: data.contactPerson || null,
        preferredContactMethod: data.preferredContactMethod || null,
        contactNote: data.contactNote || null,
        notes: data.notes || null,
        source: data.source || "manuell",
        acquisitionType: data.acquisitionType || "CALL",
        nfcDemoUrl: data.nfcDemoUrl ? String(data.nfcDemoUrl).trim() : null,
        isFocus: (data.status === "NOT_RELEVANT") ? false : (data.isFocus === true),
        status: data.status || "NEW",
        priority: data.priority || "MEDIUM",
        prioritySource: (data.prioritySource === "USER" || data.isPriorityManuallySet || (data.priority && data.priority !== "MEDIUM")) ? "USER" : "SYSTEM",
        priorityRatedAt: (data.prioritySource === "USER" || data.isPriorityManuallySet || (data.priority && data.priority !== "MEDIUM")) ? new Date() : null,
        priorityRatedById: (data.prioritySource === "USER" || data.isPriorityManuallySet || (data.priority && data.priority !== "MEDIUM")) ? dbUser.id : null,
        priorityRatedByName: (data.prioritySource === "USER" || data.isPriorityManuallySet || (data.priority && data.priority !== "MEDIUM")) ? (dbUser.displayName || dbUser.email) : null,
        auditStatus: data.website ? "pending" : "idle",
        score: data.score != null ? parseInt(data.score, 10) : 0,
        ...(coords
          ? {
              latitude: coords.latitude,
              longitude: coords.longitude,
              geoSource: "places",
              geoPrecision: "ROOFTOP",
              geoStatus: "ok",
              geoAttemptedAt: new Date(),
            }
          : {}),
        nextFollowUpAt: data.nextFollowUpAt ? new Date(data.nextFollowUpAt) : null,
        createdById: dbUser.id,
      },
    });

    if (data.nextFollowUpAt) {
      const followUpDate = new Date(data.nextFollowUpAt);
      if (!isNaN(followUpDate.getTime())) {
        const { pushToAppleEcosystem, isAppleSyncUser } = await import("@/services/apple-bridge");
        if (isAppleSyncUser(user.email)) {
          pushToAppleEcosystem({
            userEmail: user.email,
            title: `Follow-up: ${lead.companyName}`,
            notes: `Neuer Lead angelegt. Status: ${lead.status}`,
            dueDate: followUpDate,
            leadId: lead.id,
            leadCompany: lead.companyName,
            leadPhone: lead.phone,
            leadAddress: [lead.address, lead.city].filter(Boolean).join(", "),
            durationMinutes: 10,
          }).catch((err) => {
            console.error("[POST /api/leads] Apple sync error:", err);
          });
        }
      }
    }

    // Discord Alert for the 3 ScaleEvo members
    notifyLeadCreated({
      id: lead.id,
      companyName: lead.companyName,
      city: lead.city,
      status: lead.status,
      industry: lead.industry,
      creatorName: dbUser.displayName || user.email?.split("@")[0],
    });

    // Erst-Audit im Hintergrund: laeuft nach der Response, serialisiert mit Cooldown.
    if (lead.website) {
      after(async () => {
        const { enqueueLeadAudit } = await import("@/services/audit/run-lead-audit");
        return enqueueLeadAudit(lead.id);
      });
    }

    return NextResponse.json({ lead }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/leads] Error:", error);
    return NextResponse.json({ error: "Fehler beim Erstellen des Leads." }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { getOptionalUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { mapPlaceToSuggestion, type RawPlace } from "@/lib/places";

async function getPlaceDetailsFromUrl(url: string, defaultName: string): Promise<RawPlace | null> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) return null;

  try {
    let targetUrl = url.trim();
    // Resolve short URLs
    if (targetUrl.includes("maps.app.goo.gl") || targetUrl.includes("goo.gl/maps")) {
      const response = await fetch(targetUrl, { method: "GET", redirect: "manual" });
      const location = response.headers.get("location");
      if (location) {
        targetUrl = location;
      }
    }

    // Extract name from full URL
    let query = defaultName;
    const match = targetUrl.match(/\/maps\/place\/([^/]+)/);
    if (match && match[1]) {
      query = decodeURIComponent(match[1].replace(/\+/g, " "));
    }

    // Call Google Places API
    const PLACES_URL = "https://places.googleapis.com/v1/places:searchText";
    const FIELD_MASK =
      "places.displayName,places.formattedAddress,places.internationalPhoneNumber,places.websiteUri," +
      "places.rating,places.userRatingCount,places.googleMapsUri,places.types,places.primaryTypeDisplayName";

    const response = await fetch(PLACES_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": FIELD_MASK,
      },
      body: JSON.stringify({
        textQuery: query,
        languageCode: "de",
        regionCode: process.env.GOOGLE_PLACES_REGION?.trim() || "AT",
        maxResultCount: 1,
      }),
    });

    if (response.ok) {
      const payload = await response.json();
      if (payload.places && payload.places.length > 0) {
        return payload.places[0];
      }
    }
  } catch (err) {
    console.error("[getPlaceDetailsFromUrl] Error:", err);
  }
  return null;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getOptionalUser();
    if (!user) {
      return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
    }

    const { id } = await params;
    const lead = await prisma.lead.findUnique({
      where: { id },
      include: {
        createdBy: { select: { id: true, displayName: true, email: true } },
        assignedTo: { select: { id: true, displayName: true, email: true } },
        interactions: {
          orderBy: { createdAt: "desc" },
          include: { createdBy: { select: { displayName: true } } },
        },
        audits: { orderBy: { createdAt: "desc" }, take: 1 },
        tasks: { orderBy: { createdAt: "desc" } },
        callRecordings: { orderBy: { createdAt: "desc" } },
      },
    });

    if (!lead) {
      return NextResponse.json({ error: "Lead nicht gefunden." }, { status: 404 });
    }

    return NextResponse.json({ lead });
  } catch (error) {
    console.error("[GET /api/leads/[id]] Error:", error);
    return NextResponse.json({ error: "Fehler beim Laden des Leads." }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getOptionalUser();
    if (!user) {
      return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
    }

    const { id } = await params;
    const data = await request.json();

    const existingLead = await prisma.lead.findUnique({ where: { id } });
    if (!existingLead) {
      return NextResponse.json({ error: "Lead nicht gefunden." }, { status: 404 });
    }

    // Enrichment logic if googleMapsUrl is provided or updated
    let enrichedData: any = {};
    if (data.googleMapsUrl && data.googleMapsUrl !== existingLead.googleMapsUrl) {
      const place = await getPlaceDetailsFromUrl(data.googleMapsUrl, data.companyName || existingLead.companyName);
      if (place) {
        const suggestion = mapPlaceToSuggestion(place);
        if (suggestion.address) enrichedData.address = suggestion.address;
        if (suggestion.city) enrichedData.city = suggestion.city;
        if (suggestion.phone) enrichedData.phone = suggestion.phone;
        if (suggestion.website) enrichedData.website = suggestion.website;
        if (suggestion.industry) enrichedData.industry = suggestion.industry;
        if (suggestion.rating !== null) enrichedData.googleRating = suggestion.rating;
        if (suggestion.reviewCount !== null) enrichedData.googleReviewCount = suggestion.reviewCount;
      }
    }

    const normalize = (val: any) => {
      if (val === "" || val === undefined || val === null) return null;
      return String(val).trim();
    };

    const getVal = (userVal: any, enrichedVal: any, existingVal: any) => {
      const normUser = normalize(userVal);
      const normExisting = normalize(existingVal);

      // If user manually changed the value in this request compared to the DB
      if (userVal !== undefined && normUser !== normExisting) {
        return normUser;
      }

      // Otherwise, if we have an enriched value from Google Places, overwrite the existing one!
      if (enrichedVal !== undefined && enrichedVal !== null) {
        return enrichedVal;
      }

      return normExisting;
    };

    const updated = await prisma.lead.update({
      where: { id },
      data: {
        companyName: data.companyName !== undefined ? data.companyName.trim() : existingLead.companyName,
        industry: getVal(data.industry, enrichedData.industry, existingLead.industry),
        address: getVal(data.address, enrichedData.address, existingLead.address),
        city: getVal(data.city, enrichedData.city, existingLead.city),
        webPresence: data.webPresence !== undefined ? data.webPresence : existingLead.webPresence,
        website: getVal(data.website, enrichedData.website, existingLead.website),
        treatwellUrl: data.treatwellUrl !== undefined ? data.treatwellUrl || null : existingLead.treatwellUrl,
        phone: getVal(data.phone, enrichedData.phone, existingLead.phone),
        email: data.email !== undefined ? data.email || null : existingLead.email,
        instagram: data.instagram !== undefined ? data.instagram || null : existingLead.instagram,
        googleMapsUrl: data.googleMapsUrl !== undefined ? data.googleMapsUrl || null : existingLead.googleMapsUrl,
        googleRating: data.googleRating !== undefined && data.googleRating !== null
          ? parseFloat(data.googleRating)
          : (enrichedData.googleRating !== undefined ? enrichedData.googleRating : existingLead.googleRating),
        googleReviewCount: data.googleReviewCount !== undefined && data.googleReviewCount !== null
          ? parseInt(data.googleReviewCount, 10)
          : (enrichedData.googleReviewCount !== undefined ? enrichedData.googleReviewCount : existingLead.googleReviewCount),
        contactPerson: data.contactPerson !== undefined ? data.contactPerson || null : existingLead.contactPerson,
        preferredContactMethod: data.preferredContactMethod !== undefined ? data.preferredContactMethod || null : existingLead.preferredContactMethod,
        contactNote: data.contactNote !== undefined ? data.contactNote || null : existingLead.contactNote,
        notes: data.notes !== undefined ? data.notes || null : existingLead.notes,
        richNotes: data.richNotes !== undefined ? data.richNotes : existingLead.richNotes,
        status: data.status !== undefined ? data.status : existingLead.status,
        priority: data.priority !== undefined ? data.priority : existingLead.priority,
        score: data.score !== undefined ? parseInt(data.score, 10) : existingLead.score,
        lastContactAt: data.lastContactAt !== undefined ? (data.lastContactAt ? new Date(data.lastContactAt) : null) : existingLead.lastContactAt,
        nextFollowUpAt: data.nextFollowUpAt !== undefined ? (data.nextFollowUpAt ? new Date(data.nextFollowUpAt) : null) : existingLead.nextFollowUpAt,
      },
    });

    return NextResponse.json({ lead: updated });
  } catch (error) {
    console.error("[PATCH /api/leads/[id]] Error:", error);
    return NextResponse.json({ error: "Fehler beim Aktualisieren des Leads." }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getOptionalUser();
    if (!user) {
      return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
    }

    const { id } = await params;
    await prisma.lead.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[DELETE /api/leads/[id]] Error:", error);
    return NextResponse.json({ error: "Fehler beim Löschen des Leads." }, { status: 500 });
  }
}

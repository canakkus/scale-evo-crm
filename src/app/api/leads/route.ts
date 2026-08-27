import { NextResponse } from "next/server";
import { getOptionalUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { LeadStatus, Priority, WebPresence } from "@prisma/client";
import { INDUSTRIES } from "@/lib/constants";

export async function GET(request: Request) {
  try {
    const user = await getOptionalUser();
    if (!user) {
      return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search")?.trim();
    const status = searchParams.get("status") as LeadStatus | null;
    const priority = searchParams.get("priority") as Priority | null;
    const webPresence = searchParams.get("webPresence") as WebPresence | null;
    const industryParam = searchParams.get("industry")?.trim();
    const updatedDate = searchParams.get("updatedDate")?.trim(); // e.g. "today", "yesterday", "thisWeek", or "2026-08-27"
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(100, Math.max(10, parseInt(searchParams.get("limit") || "25", 10)));

    const where: Record<string, any> = {};

    if (search) {
      where.OR = [
        { companyName: { contains: search, mode: "insensitive" } },
        { city: { contains: search, mode: "insensitive" } },
        { contactPerson: { contains: search, mode: "insensitive" } },
        { phone: { contains: search, mode: "insensitive" } },
      ];
    }

    if (status) where.status = status;
    if (priority) where.priority = priority;
    if (webPresence) where.webPresence = webPresence;

    if (updatedDate) {
      const now = new Date();
      const startOfDay = (d: Date) => {
        const copy = new Date(d);
        copy.setHours(0, 0, 0, 0);
        return copy;
      };
      const endOfDay = (d: Date) => {
        const copy = new Date(d);
        copy.setHours(23, 59, 59, 999);
        return copy;
      };

      if (updatedDate === "today") {
        where.updatedAt = {
          gte: startOfDay(now),
        };
      } else if (updatedDate === "yesterday") {
        const yesterday = new Date(now);
        yesterday.setDate(now.getDate() - 1);
        where.updatedAt = {
          gte: startOfDay(yesterday),
          lte: endOfDay(yesterday),
        };
      } else if (updatedDate === "thisWeek") {
        const monday = new Date(now);
        const day = monday.getDay();
        const diff = monday.getDate() - day + (day === 0 ? -6 : 1);
        monday.setDate(diff);
        where.updatedAt = {
          gte: startOfDay(monday),
        };
      } else {
        const parsedDate = new Date(updatedDate);
        if (!isNaN(parsedDate.getTime())) {
          where.updatedAt = {
            gte: startOfDay(parsedDate),
            lte: endOfDay(parsedDate),
          };
        }
      }
    }

    if (industryParam) {
      const industries = industryParam.split(",").map(i => i.trim()).filter(Boolean);
      if (industries.length > 0) {
        const hasNull = industries.some(i => i.toLowerCase() === "null" || i.toLowerCase() === "keine angabe" || i === "—");
        if (hasNull) {
          where.OR = [
            { industry: { in: industries } },
            { industry: null },
            { industry: "" }
          ];
        } else {
          where.industry = { in: industries };
        }
      }
    }

    const [leads, total, distinctIndustries] = await Promise.all([
      prisma.lead.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          createdBy: { select: { id: true, displayName: true, email: true } },
          assignedTo: { select: { id: true, displayName: true, email: true } },
          _count: { select: { interactions: true, audits: true, tasks: true } },
        },
      }),
      prisma.lead.count({ where }),
      prisma.lead.findMany({
        where: { industry: { not: null } },
        distinct: ["industry"],
        select: { industry: true },
      }),
    ]);

    const dbIndustries = distinctIndustries.map((d) => d.industry).filter(Boolean) as string[];
    const allIndustries = Array.from(new Set([...INDUSTRIES, ...dbIndustries])).sort();

    return NextResponse.json({
      leads,
      allIndustries,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
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
        status: data.status || "NEW",
        priority: data.priority || "MEDIUM",
        score: data.score != null ? parseInt(data.score, 10) : 0,
        createdById: dbUser.id,
      },
    });

    return NextResponse.json({ lead }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/leads] Error:", error);
    return NextResponse.json({ error: "Fehler beim Erstellen des Leads." }, { status: 500 });
  }
}

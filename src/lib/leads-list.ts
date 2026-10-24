import type { LeadStatus, Priority, WebPresence } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { INDUSTRIES } from "@/lib/constants";
import { leadScopeFor, workspaceUserIds } from "@/lib/workspace";

type SessionUser = { id: string; email?: string | null };

export const ARCHIVED_STATUSES: LeadStatus[] = ["NOT_RELEVANT", "LOST", "VISITED_NO_INTEREST"];

export type LeadListQuery = {
  search?: string | null;
  status?: string | null;
  acquisitionType?: string | null;
  priority?: string | null;
  isFocus?: string | null;
  relevantOnly?: boolean;
  archived?: boolean | string | null;
  includeArchived?: boolean | string | null;
  createdById?: string | null;
  assignedToId?: string | null;
  webPresence?: string | null;
  enrichmentStatus?: string | null;
  source?: string | null;
  industry?: string | null;
  updatedDate?: string | null;
  sortBy?: string | null;
  sortOrder?: string | null;
  page?: number;
  limit?: number;
};

// Industry names only, keyed by workspace so one user's list cannot leak to another.
const industryCache = new Map<string, { list: string[]; timestamp: number }>();
const CACHE_TTL_MS = 60_000;

async function industriesFor(scope: Awaited<ReturnType<typeof leadScopeFor>>, cacheKey: string) {
  const now = Date.now();
  const hit = industryCache.get(cacheKey);
  if (hit && now - hit.timestamp < CACHE_TTL_MS) return hit.list;

  const distinctIndustries = await prisma.lead.findMany({
    where: { industry: { not: null }, ...scope },
    distinct: ["industry"],
    select: { industry: true },
  });
  const dbIndustries = distinctIndustries.map((row) => row.industry).filter(Boolean) as string[];
  const list = Array.from(new Set([...INDUSTRIES, ...dbIndustries])).sort();
  industryCache.set(cacheKey, { list, timestamp: now });
  return list;
}

/** Same payload as GET /api/leads, shared with the server-rendered pages. */
export async function listLeads(user: SessionUser, query: LeadListQuery = {}) {
  const search = query.search?.trim() || "";
  const status = (query.status || null) as LeadStatus | null;
  const isArchived = query.archived === true || query.archived === "true";
  const includeArchived = query.includeArchived === true || query.includeArchived === "true";
  const acquisitionType = query.acquisitionType || null;
  const priority = (query.priority || null) as Priority | null;
  const isFocusParam = query.isFocus || null;
  const relevantOnly = query.relevantOnly === true;
  const createdByIdParam = query.createdById?.trim() || "";
  const assignedToIdParam = query.assignedToId?.trim() || "";
  const webPresence = (query.webPresence || null) as WebPresence | null;
  const enrichmentStatusParam = query.enrichmentStatus || null;
  const sourceParam = query.source || null;
  const industryParam = query.industry?.trim() || "";
  const updatedDate = query.updatedDate?.trim() || "";
  const sortBy = query.sortBy?.trim() || "updatedAt";
  const sortOrder = (query.sortOrder?.toLowerCase() === "asc" ? "asc" : "desc") as "asc" | "desc";
  const page = Math.max(1, Number.isFinite(query.page) ? Number(query.page) : 1);
  const limit = Math.min(100, Math.max(1, Number.isFinite(query.limit) ? Number(query.limit) : 25));

  const userIds = await workspaceUserIds(user);
  const scope = leadScopeFor(userIds);
  const andClauses: Record<string, unknown>[] = [scope];

  if (search) {
    andClauses.push({
      OR: [
        { companyName: { contains: search, mode: "insensitive" } },
        { city: { contains: search, mode: "insensitive" } },
        { contactPerson: { contains: search, mode: "insensitive" } },
        { phone: { contains: search, mode: "insensitive" } },
      ],
    });
  }

  const where: Record<string, unknown> = { AND: andClauses };

  if (createdByIdParam) where.createdById = createdByIdParam;
  if (assignedToIdParam) where.assignedToId = assignedToIdParam;

  if (status) {
    where.status = status;
  } else if (isArchived) {
    where.status = { in: ARCHIVED_STATUSES };
  } else if (!includeArchived) {
    // Default: hide archived/disqualified leads so only active leads are shown
    where.status = { notIn: ARCHIVED_STATUSES };
  }

  if (acquisitionType) where.acquisitionType = acquisitionType;
  if (priority) where.priority = priority;
  if (isFocusParam === "true") where.isFocus = true;
  if (webPresence) where.webPresence = webPresence;
  if (enrichmentStatusParam) where.enrichmentStatus = enrichmentStatusParam;
  if (sourceParam) {
    if (sourceParam === "bot") {
      where.source = { contains: "Hunter" };
    } else if (sourceParam === "manual") {
      where.OR = [{ source: null }, { NOT: { source: { contains: "Hunter" } } }];
    } else {
      where.source = { contains: sourceParam };
    }
  }

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
      where.updatedAt = { gte: startOfDay(now) };
    } else if (updatedDate === "yesterday") {
      const yesterday = new Date(now);
      yesterday.setDate(now.getDate() - 1);
      where.updatedAt = { gte: startOfDay(yesterday), lte: endOfDay(yesterday) };
    } else if (updatedDate === "thisWeek") {
      const monday = new Date(now);
      const day = monday.getDay();
      const diff = monday.getDate() - day + (day === 0 ? -6 : 1);
      monday.setDate(diff);
      where.updatedAt = { gte: startOfDay(monday) };
    } else {
      const parsedDate = new Date(updatedDate);
      if (!isNaN(parsedDate.getTime())) {
        where.updatedAt = { gte: startOfDay(parsedDate), lte: endOfDay(parsedDate) };
      }
    }
  }

  if (industryParam) {
    const industries = industryParam.split(",").map((item) => item.trim()).filter(Boolean);
    if (industries.length > 0) {
      const hasNull = industries.some(
        (item) => item.toLowerCase() === "null" || item.toLowerCase() === "keine angabe" || item === "—",
      );
      if (hasNull) {
        where.OR = [{ industry: { in: industries } }, { industry: null }, { industry: "" }];
      } else {
        where.industry = { in: industries };
      }
    }
  }

  const validSortFields = ["createdAt", "updatedAt", "score", "companyName", "status", "lastContactAt", "auditSeverity"];
  const sortField = validSortFields.includes(sortBy) ? sortBy : "updatedAt";
  const cacheKey = [...userIds].sort().join(",");

  const [leads, total, allIndustries] = await Promise.all([
    prisma.lead.findMany({
      where,
      orderBy: { [sortField]: sortOrder },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        createdBy: { select: { id: true, displayName: true, email: true } },
        assignedTo: { select: { id: true, displayName: true, email: true } },
        priorityRatedBy: { select: { id: true, displayName: true, email: true } },
        _count: { select: { interactions: true, audits: true, tasks: true } },
      },
    }),
    prisma.lead.count({ where }),
    industriesFor(scope, cacheKey),
  ]);

  return {
    leads,
    allIndustries,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

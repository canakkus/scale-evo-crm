/**
 * ============================================================================
 * SCALE EVO CRM — 90 RETRO LEADS INDEPENDENT E2E VERIFICATION HARNESS
 * ============================================================================
 * File: scripts/verify-90-retro-leads.ts
 *
 * Independent, opaque-box E2E test verification harness for 2014-Style B2B leads.
 * Connects directly to PostgreSQL / Supabase via Prisma ORM (`src/lib/prisma.ts`)
 * and validates the database against all 4 Tiers of Acceptance Criteria defined
 * in `ORIGINAL_REQUEST.md` and `PROJECT.md`.
 *
 * 4 Verification Tiers:
 * ----------------------------------------------------------------------------
 * Tier 1: Lead Count & Ownership Check
 *   - Verifies target user (Can Akkus, ID: 020c62b0-1e83-4d89-8120-328e8a5ce3b9).
 *   - Verifies total qualified retro leads >= target (default: 90).
 *   - Verifies 100% of leads belong to Can Akkus (createdById: canUser.id).
 *   - Detects any foreign / orphaned leads with retro source.
 *
 * Tier 2: Field Completeness & Quality Check
 *   - Valid companyName (non-empty string, length >= 2).
 *   - Valid phone number (Austrian international format e.g. +43..., no dummy numbers).
 *   - Valid website URL (http:// or https://, valid domain, non-directory).
 *   - Valid Google rating (number 1.0-5.0) and review count (integer >= 0).
 *   - Coordinates present (latitude & longitude valid numbers, geoStatus 'ok' or 'places').
 *   - Priority ('HIGH' or 'LOW') and opportunityTags (contains 'RETRO_WEBSITE').
 *   - Notes column contains '🔥 RETRO-AUDIT' findings and '🎯 PITCH & HEBEL FÜR DEN ANRUF'.
 *
 * Tier 3: Strict Deduplication Check
 *   - 0 duplicate company names (case-insensitive, trimmed).
 *   - 0 duplicate website domains / URLs.
 *   - 0 duplicate phone numbers (digits normalized).
 *   - Workspace collision check against existing non-retro leads.
 *
 * Tier 4: Geographic & Industry Diversity Check
 *   - Geographical coverage across Vienna districts (1010–1230) and Austrian cities (Graz, Linz, Salzburg, etc.).
 *   - Industry diversity (Gastronomie, Handwerk, KFZ & Werkstatt, Lokale Dienstleister).
 *   - Accessibility via Multi-Tenant Workspace Scoping (`leadScope(canUser)`).
 *
 * Usage:
 *   npx tsx --env-file-if-exists=.env scripts/verify-90-retro-leads.ts
 *   npx tsx --env-file-if-exists=.env scripts/verify-90-retro-leads.ts --target=90
 *   npx tsx --env-file-if-exists=.env scripts/verify-90-retro-leads.ts --target=10 --verbose
 *   npx tsx --env-file-if-exists=.env scripts/verify-90-retro-leads.ts --json
 *
 * Exit Codes:
 *   0: All 4 Tiers passed successfully (100% compliant with acceptance criteria).
 *   1: Verification failed on one or more Tiers.
 * ============================================================================
 */

import type { Lead, User } from "@prisma/client";
import { prisma } from "../src/lib/prisma";
import { leadScope } from "../src/lib/workspace";

// ----------------------------------------------------------------------------
// Configuration & Constants
// ----------------------------------------------------------------------------

export const CAN_AKKUS_USER_ID = "020c62b0-1e83-4d89-8120-328e8a5ce3b9";
export const CAN_AKKUS_EMAIL = "canakkus378@gmail.com";
export const RETRO_SOURCE = "Lead Scout (2014-Website-Detector)";

const BLOCKED_DIRECTORIES = [
  "facebook.com",
  "instagram.com",
  "wien.gv.at",
  "herold.at",
  "firmenabc.at",
  "tripadvisor",
  "lieferando",
  "gelbeseiten",
  "tutti.ch",
  "willhaben.at",
];

const VIENNA_DISTRICT_REGEX = /\b(10[1-9]0|11\d0|12[0-3]0)\b/;
const AUSTRIAN_CITIES = [
  "wien",
  "vienna",
  "graz",
  "linz",
  "salzburg",
  "innsbruck",
  "klagenfurt",
  "villach",
  "wels",
  "st. pölten",
  "st. poelten",
  "dornbirn",
  "bregenz",
];

// ----------------------------------------------------------------------------
// Types & Interfaces
// ----------------------------------------------------------------------------

export interface TierResult {
  tierNumber: number;
  tierName: string;
  passed: boolean;
  summary: string;
  checks: {
    name: string;
    passed: boolean;
    details: string;
  }[];
  violations: string[];
}

export interface VerificationReport {
  timestamp: string;
  targetUserId: string;
  targetEmail: string;
  source: string;
  targetCount: number;
  actualCount: number;
  allPassed: boolean;
  tiers: TierResult[];
}

// ----------------------------------------------------------------------------
// Helper Functions
// ----------------------------------------------------------------------------

function parseCommandLineArgs(): {
  targetCount: number;
  verbose: boolean;
  jsonOutput: boolean;
} {
  const args = process.argv.slice(2);
  let targetCount = 90;
  let verbose = false;
  let jsonOutput = false;

  for (const arg of args) {
    if (arg.startsWith("--target=")) {
      const parsed = parseInt(arg.split("=")[1], 10);
      if (!isNaN(parsed) && parsed > 0) targetCount = parsed;
    } else if (arg === "--verbose" || arg === "-v") {
      verbose = true;
    } else if (arg === "--json") {
      jsonOutput = true;
    }
  }

  return { targetCount, verbose, jsonOutput };
}

function normalizePhoneDigits(phone: string | null | undefined): string {
  if (!phone) return "";
  return phone.replace(/\D/g, "");
}

function normalizeDomain(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return null;
  }
}

function isBlockedDirectory(hostname: string): boolean {
  return BLOCKED_DIRECTORIES.some((dir) => hostname.includes(dir));
}

function categorizeIndustry(industry: string | null | undefined): string {
  const ind = (industry || "").toLowerCase();
  if (
    ind.includes("gastro") ||
    ind.includes("restaurant") ||
    ind.includes("heurig") ||
    ind.includes("pizza") ||
    ind.includes("café") ||
    ind.includes("cafe") ||
    ind.includes("bar") ||
    ind.includes("bäckerei")
  ) {
    return "Gastronomie";
  }
  if (
    ind.includes("handwerk") ||
    ind.includes("installateur") ||
    ind.includes("tischler") ||
    ind.includes("elektro") ||
    ind.includes("schlosser") ||
    ind.includes("maler") ||
    ind.includes("dach") ||
    ind.includes("boden")
  ) {
    return "Handwerk";
  }
  if (
    ind.includes("kfz") ||
    ind.includes("werkstatt") ||
    ind.includes("auto") ||
    ind.includes("lack") ||
    ind.includes("reifen")
  ) {
    return "KFZ & Werkstatt";
  }
  if (
    ind.includes("dienstleist") ||
    ind.includes("service") ||
    ind.includes("aufsperr") ||
    ind.includes("reinigung") ||
    ind.includes("schlüsseldienst")
  ) {
    return "Dienstleister";
  }
  return industry || "Sonstige";
}

// ----------------------------------------------------------------------------
// Tier Verification Functions
// ----------------------------------------------------------------------------

/**
 * TIER 1: Lead Count & Ownership Check
 */
export async function verifyTier1(
  targetCount: number,
  targetUserId: string,
  targetEmail: string,
  source: string,
): Promise<{ result: TierResult; retroLeads: Lead[]; canUser: User | null }> {
  const violations: string[] = [];
  const checks: TierResult["checks"] = [];

  // Check 1.1: Can Akkus user existence and active status
  const canUser = await prisma.user.findUnique({
    where: { email: targetEmail },
  });

  const userFound = Boolean(canUser && canUser.id === targetUserId);
  if (!userFound) {
    violations.push(
      `Can Akkus user account (${targetEmail} / ID: ${targetUserId}) not found in database or ID mismatch (found: ${canUser?.id}).`,
    );
  }
  checks.push({
    name: "User Account & Identity",
    passed: userFound,
    details: userFound
      ? `Verified user '${canUser?.displayName}' (${canUser?.id}, active: ${canUser?.active})`
      : `User verification failed for ${targetEmail}`,
  });

  // Check 1.2: Fetch retro leads belonging to Can Akkus
  const retroLeads = await prisma.lead.findMany({
    where: {
      createdById: targetUserId,
      source: source,
    },
    orderBy: { createdAt: "asc" },
  });

  const countPassed = retroLeads.length >= targetCount;
  if (!countPassed) {
    violations.push(
      `Insufficient lead count: Found ${retroLeads.length} qualified retro leads, target is ${targetCount} (gap: ${
        targetCount - retroLeads.length
      }).`,
    );
  }
  checks.push({
    name: "Lead Count Target",
    passed: countPassed,
    details: `Current count: ${retroLeads.length} / ${targetCount} leads (${
      countPassed ? "TARGET MET" : `DEFICIT: ${targetCount - retroLeads.length}`
    })`,
  });

  // Check 1.3: Foreign / Orphaned leads with same source
  const foreignLeads = await prisma.lead.findMany({
    where: {
      source: source,
      createdById: { not: targetUserId },
    },
    select: { id: true, companyName: true, createdById: true },
  });

  const foreignPassed = foreignLeads.length === 0;
  if (!foreignPassed) {
    violations.push(
      `Found ${foreignLeads.length} retro leads belonging to other users: ${foreignLeads
        .map((l) => `${l.companyName} (${l.id} -> createdBy: ${l.createdById})`)
        .join(", ")}`,
    );
  }
  checks.push({
    name: "Lead Ownership Integrity",
    passed: foreignPassed,
    details: foreignPassed
      ? `100% of retro leads strictly belong to Can Akkus (${targetUserId})`
      : `Ownership violation: ${foreignLeads.length} foreign leads found`,
  });

  const passed = checks.every((c) => c.passed);
  const summary = passed
    ? `PASSED — ${retroLeads.length} leads verified for Can Akkus (Target: ${targetCount})`
    : `FAILED — ${violations.length} count/ownership defect(s) detected (${retroLeads.length}/${targetCount} leads)`;

  return {
    result: {
      tierNumber: 1,
      tierName: "Lead Count & Ownership Check",
      passed,
      summary,
      checks,
      violations,
    },
    retroLeads,
    canUser,
  };
}

/**
 * TIER 2: Field Completeness & Quality Check
 */
export function verifyTier2(retroLeads: Lead[]): TierResult {
  const violations: string[] = [];
  const checks: TierResult["checks"] = [];

  let validCompanyCount = 0;
  let validPhoneCount = 0;
  let validWebsiteCount = 0;
  let validRatingCount = 0;
  let validCoordsCount = 0;
  let validPriorityAndTagsCount = 0;
  let validNotesCount = 0;

  for (const lead of retroLeads) {
    const leadLabel = `'${lead.companyName || "UNKNOWN"}' (${lead.id})`;

    // 2.1 Company Name
    const nameValid =
      typeof lead.companyName === "string" && lead.companyName.trim().length >= 2;
    if (nameValid) {
      validCompanyCount++;
    } else {
      violations.push(`${leadLabel}: Missing or empty companyName`);
    }

    // 2.2 Phone Number (Austrian international format, non-dummy)
    const phone = (lead.phone || "").trim();
    const phoneDigits = phone.replace(/\D/g, "");
    const isAustrianPrefix =
      phone.startsWith("+43") || phone.startsWith("0043") || phone.startsWith("0");
    const isDummyPhone =
      /^(\+?43)?0+$/.test(phoneDigits) ||
      /^12345/.test(phoneDigits) ||
      /(.)\1{6,}/.test(phoneDigits) ||
      phoneDigits.length < 7;

    const phoneValid = Boolean(phone && isAustrianPrefix && !isDummyPhone);
    if (phoneValid) {
      validPhoneCount++;
    } else {
      violations.push(
        `${leadLabel}: Invalid phone number '${lead.phone}' (expected Austrian international format e.g. +43..., min 7 digits)`,
      );
    }

    // 2.3 Website URL
    let websiteValid = false;
    if (lead.website && (lead.website.startsWith("http://") || lead.website.startsWith("https://"))) {
      try {
        const u = new URL(lead.website);
        if (u.hostname.includes(".") && !isBlockedDirectory(u.hostname)) {
          websiteValid = true;
        }
      } catch {
        websiteValid = false;
      }
    }
    if (websiteValid) {
      validWebsiteCount++;
    } else {
      violations.push(`${leadLabel}: Invalid website URL '${lead.website}'`);
    }

    // 2.4 Google Rating & Review Count
    const ratingValid =
      typeof lead.googleRating === "number" &&
      lead.googleRating >= 1.0 &&
      lead.googleRating <= 5.0 &&
      typeof lead.googleReviewCount === "number" &&
      lead.googleReviewCount >= 0;

    if (ratingValid) {
      validRatingCount++;
    } else {
      violations.push(
        `${leadLabel}: Invalid Google rating (${lead.googleRating}) or review count (${lead.googleReviewCount})`,
      );
    }

    // 2.5 Coordinates & GeoStatus
    const hasLat = typeof lead.latitude === "number" && !isNaN(lead.latitude);
    const hasLng = typeof lead.longitude === "number" && !isNaN(lead.longitude);
    const inAustriaBBox =
      hasLat &&
      hasLng &&
      (lead.latitude as number) >= 46.0 &&
      (lead.latitude as number) <= 49.5 &&
      (lead.longitude as number) >= 9.0 &&
      (lead.longitude as number) <= 17.5;
    const geoStatusValid =
      lead.geoStatus === "ok" || lead.geoStatus === "places" || lead.geoSource === "places";

    const coordsValid = hasLat && hasLng && inAustriaBBox && geoStatusValid;
    if (coordsValid) {
      validCoordsCount++;
    } else {
      violations.push(
        `${leadLabel}: Incomplete coordinates (lat: ${lead.latitude}, lng: ${lead.longitude}, geoStatus: '${lead.geoStatus}', geoSource: '${lead.geoSource}')`,
      );
    }

    // 2.6 Priority & Tags
    const priorityValid = lead.priority === "HIGH" || lead.priority === "LOW";
    const tags = Array.isArray(lead.opportunityTags)
      ? (lead.opportunityTags as string[])
      : typeof lead.opportunityTags === "string"
      ? (JSON.parse(lead.opportunityTags) as string[])
      : [];
    const hasRetroTag = tags.includes("RETRO_WEBSITE");

    const priorityTagsValid = priorityValid && hasRetroTag;
    if (priorityTagsValid) {
      validPriorityAndTagsCount++;
    } else {
      violations.push(
        `${leadLabel}: Invalid priority '${lead.priority}' or missing 'RETRO_WEBSITE' tag in ${JSON.stringify(
          tags,
        )}`,
      );
    }

    // 2.7 Notes column (Audit findings & Pitch opener)
    const notes = lead.notes || "";
    const hasAuditHeader = notes.includes("🔥 RETRO-AUDIT");
    const hasPitchHeader = notes.includes("🎯 PITCH & HEBEL FÜR DEN ANRUF");
    const hasSubstantialContent = notes.trim().length >= 80;

    const notesValid = hasAuditHeader && hasPitchHeader && hasSubstantialContent;
    if (notesValid) {
      validNotesCount++;
    } else {
      violations.push(
        `${leadLabel}: Notes column missing required sections (hasAudit: ${hasAuditHeader}, hasPitch: ${hasPitchHeader}, length: ${notes.length})`,
      );
    }
  }

  const total = retroLeads.length;

  checks.push({
    name: "Company Name Completeness",
    passed: total > 0 && validCompanyCount === total,
    details: `${validCompanyCount}/${total} valid non-empty company names`,
  });

  checks.push({
    name: "Phone Number Validity",
    passed: total > 0 && validPhoneCount === total,
    details: `${validPhoneCount}/${total} valid Austrian phone numbers (+43...)`,
  });

  checks.push({
    name: "Website URL Validity",
    passed: total > 0 && validWebsiteCount === total,
    details: `${validWebsiteCount}/${total} valid HTTP/HTTPS company websites`,
  });

  checks.push({
    name: "Google Rating & Review Count",
    passed: total > 0 && validRatingCount === total,
    details: `${validRatingCount}/${total} valid ratings (1.0-5.0★) & review counts`,
  });

  checks.push({
    name: "Geographic Coordinates & Status",
    passed: total > 0 && validCoordsCount === total,
    details: `${validCoordsCount}/${total} populated with valid coordinates & geoStatus 'ok'/'places'`,
  });

  checks.push({
    name: "Priority & Opportunity Tags",
    passed: total > 0 && validPriorityAndTagsCount === total,
    details: `${validPriorityAndTagsCount}/${total} have HIGH/LOW priority and 'RETRO_WEBSITE' tag`,
  });

  checks.push({
    name: "Retro-Audit Notes & Pitch Opener",
    passed: total > 0 && validNotesCount === total,
    details: `${validNotesCount}/${total} contain '🔥 RETRO-AUDIT' findings and '🎯 PITCH & HEBEL FÜR DEN ANRUF'`,
  });

  const passed = checks.every((c) => c.passed);
  const summary = passed
    ? `PASSED — All ${total} leads satisfy 100% of field completeness and quality criteria`
    : `FAILED — ${violations.length} defect(s) found across ${total} leads`;

  return {
    tierNumber: 2,
    tierName: "Field Completeness & Quality Check",
    passed,
    summary,
    checks,
    violations,
  };
}

/**
 * TIER 3: Strict Deduplication Check
 */
export async function verifyTier3(
  retroLeads: Lead[],
  targetUserId: string,
): Promise<TierResult> {
  const violations: string[] = [];
  const checks: TierResult["checks"] = [];

  // 3.1 Company Name Deduplication (case-insensitive, trimmed)
  const nameMap = new Map<string, string[]>();
  for (const lead of retroLeads) {
    const norm = (lead.companyName || "").toLowerCase().trim();
    if (!nameMap.has(norm)) nameMap.set(norm, []);
    nameMap.get(norm)!.push(`'${lead.companyName}' (${lead.id})`);
  }

  let duplicateNameCount = 0;
  for (const [norm, leads] of nameMap.entries()) {
    if (leads.length > 1) {
      duplicateNameCount += leads.length - 1;
      violations.push(
        `Duplicate company name '${norm}' across ${leads.length} leads: ${leads.join(", ")}`,
      );
    }
  }

  checks.push({
    name: "Company Name Uniqueness",
    passed: duplicateNameCount === 0,
    details:
      duplicateNameCount === 0
        ? `0 duplicate company names across ${retroLeads.length} leads`
        : `${duplicateNameCount} duplicate company name collision(s)`,
  });

  // 3.2 Website Domain Deduplication
  const domainMap = new Map<string, string[]>();
  for (const lead of retroLeads) {
    const domain = normalizeDomain(lead.website);
    if (domain) {
      if (!domainMap.has(domain)) domainMap.set(domain, []);
      domainMap.get(domain)!.push(`'${lead.companyName}' (${lead.id}: ${lead.website})`);
    }
  }

  let duplicateDomainCount = 0;
  for (const [domain, leads] of domainMap.entries()) {
    if (leads.length > 1) {
      duplicateDomainCount += leads.length - 1;
      violations.push(
        `Duplicate website domain '${domain}' across ${leads.length} leads: ${leads.join(", ")}`,
      );
    }
  }

  checks.push({
    name: "Website Domain Uniqueness",
    passed: duplicateDomainCount === 0,
    details:
      duplicateDomainCount === 0
        ? `0 duplicate website domains across ${retroLeads.length} leads`
        : `${duplicateDomainCount} duplicate domain collision(s)`,
  });

  // 3.3 Phone Number Deduplication (digits normalized)
  const phoneMap = new Map<string, string[]>();
  for (const lead of retroLeads) {
    const digits = normalizePhoneDigits(lead.phone);
    if (digits.length >= 7) {
      if (!phoneMap.has(digits)) phoneMap.set(digits, []);
      phoneMap.get(digits)!.push(`'${lead.companyName}' (${lead.id}: ${lead.phone})`);
    }
  }

  let duplicatePhoneCount = 0;
  for (const [digits, leads] of phoneMap.entries()) {
    if (leads.length > 1) {
      duplicatePhoneCount += leads.length - 1;
      violations.push(
        `Duplicate phone digits '${digits}' across ${leads.length} leads: ${leads.join(", ")}`,
      );
    }
  }

  checks.push({
    name: "Phone Number Uniqueness",
    passed: duplicatePhoneCount === 0,
    details:
      duplicatePhoneCount === 0
        ? `0 duplicate phone numbers across ${retroLeads.length} leads`
        : `${duplicatePhoneCount} duplicate phone collision(s)`,
  });

  // 3.4 Cross-Workspace Collision Check (retro leads vs non-retro leads in Can's workspace)
  const nonRetroLeads = await prisma.lead.findMany({
    where: {
      createdById: targetUserId,
      source: { not: RETRO_SOURCE },
    },
    select: { id: true, companyName: true, website: true, phone: true },
  });

  const existingWorkspaceNames = new Set(
    nonRetroLeads.map((l) => (l.companyName || "").toLowerCase().trim()).filter(Boolean),
  );
  const existingWorkspaceDomains = new Set(
    nonRetroLeads.map((l) => normalizeDomain(l.website)).filter(Boolean) as string[],
  );

  let workspaceCrossCollisions = 0;
  for (const lead of retroLeads) {
    const normName = (lead.companyName || "").toLowerCase().trim();
    const domain = normalizeDomain(lead.website);

    if (existingWorkspaceNames.has(normName)) {
      workspaceCrossCollisions++;
      violations.push(
        `Retro lead '${lead.companyName}' collides with an existing pre-retro lead in Can's workspace.`,
      );
    }
    if (domain && existingWorkspaceDomains.has(domain)) {
      workspaceCrossCollisions++;
      violations.push(
        `Retro lead website domain '${domain}' (${lead.companyName}) collides with an existing pre-retro lead in Can's workspace.`,
      );
    }
  }

  checks.push({
    name: "Cross-Workspace Pre-Existing Collision Check",
    passed: workspaceCrossCollisions === 0,
    details:
      workspaceCrossCollisions === 0
        ? `0 collisions with ${nonRetroLeads.length} pre-existing non-retro workspace leads`
        : `${workspaceCrossCollisions} collision(s) with pre-existing workspace leads`,
  });

  const passed = checks.every((c) => c.passed);
  const summary = passed
    ? `PASSED — 0 duplicates detected across company names, websites, and phones`
    : `FAILED — ${violations.length} duplicate collision(s) detected`;

  return {
    tierNumber: 3,
    tierName: "Strict Deduplication Check",
    passed,
    summary,
    checks,
    violations,
  };
}

/**
 * TIER 4: Geographic & Industry Diversity Check & Workspace Scoping
 */
export async function verifyTier4(
  retroLeads: Lead[],
  targetUserId: string,
  targetEmail: string,
): Promise<TierResult> {
  const violations: string[] = [];
  const checks: TierResult["checks"] = [];

  // 4.1 Geographic Representation: Vienna Districts & Austrian Cities
  const viennaDistricts = new Set<string>();
  const austrianCities = new Set<string>();

  for (const lead of retroLeads) {
    const addr = lead.address || "";
    const city = lead.city || "";
    const combined = `${city} ${addr}`.toLowerCase();

    const districtMatch = addr.match(VIENNA_DISTRICT_REGEX) || city.match(VIENNA_DISTRICT_REGEX);
    if (districtMatch) {
      viennaDistricts.add(districtMatch[1]);
    }

    for (const c of AUSTRIAN_CITIES) {
      if (combined.includes(c)) {
        austrianCities.add(c.charAt(0).toUpperCase() + c.slice(1));
      }
    }
  }

  // Geographic diversity criteria:
  // For sample runs (<= 10 leads): at least 2 distinct districts/cities
  // For full runs (>= 90 leads): at least 5 distinct Vienna districts or 2+ major cities
  const minDistrictsRequired = retroLeads.length >= 90 ? 5 : Math.min(2, retroLeads.length);
  const geoPassed =
    viennaDistricts.size >= minDistrictsRequired || austrianCities.size >= 2;

  if (!geoPassed && retroLeads.length > 0) {
    violations.push(
      `Insufficient geographic diversity: Only ${viennaDistricts.size} Vienna district(s) (${Array.from(
        viennaDistricts,
      ).join(", ")}) and ${austrianCities.size} city/cities (${Array.from(austrianCities).join(
        ", ",
      )}) represented. Expected >= ${minDistrictsRequired} districts or 2+ cities.`,
    );
  }

  checks.push({
    name: "Geographic Coverage (Vienna Districts & Cities)",
    passed: geoPassed,
    details: `Covering ${viennaDistricts.size} Vienna districts [${Array.from(viennaDistricts).sort().join(
      ", ",
    )}] and ${austrianCities.size} cities [${Array.from(austrianCities).join(", ")}]`,
  });

  // 4.2 Industry Category Diversity
  const industryDistribution = new Map<string, number>();
  for (const lead of retroLeads) {
    const cat = categorizeIndustry(lead.industry);
    industryDistribution.set(cat, (industryDistribution.get(cat) || 0) + 1);
  }

  const distinctIndustries = industryDistribution.size;
  const minIndustriesRequired = retroLeads.length >= 90 ? 3 : Math.min(2, retroLeads.length);
  const industryPassed = distinctIndustries >= minIndustriesRequired;

  if (!industryPassed && retroLeads.length > 0) {
    violations.push(
      `Insufficient industry diversity: Found ${distinctIndustries} industry categories (${Array.from(
        industryDistribution.keys(),
      ).join(", ")}). Expected >= ${minIndustriesRequired}.`,
    );
  }

  const industryBreakdown = Array.from(industryDistribution.entries())
    .map(([cat, count]) => `${cat}: ${count}`)
    .join(", ");

  checks.push({
    name: "Industry Diversity (Multi-Sector)",
    passed: industryPassed,
    details: `Covering ${distinctIndustries} industries (${industryBreakdown})`,
  });

  // 4.3 Workspace Scoping & Accessibility Query Check
  let scopePassed = false;
  let accessibleCount = 0;
  try {
    const scope = await leadScope({ id: targetUserId, email: targetEmail });
    const scopedLeads = await prisma.lead.findMany({
      where: {
        AND: [scope, { source: RETRO_SOURCE }],
      },
      select: { id: true },
    });

    accessibleCount = scopedLeads.length;
    const scopedIds = new Set(scopedLeads.map((l) => l.id));
    const inaccessible = retroLeads.filter((l) => !scopedIds.has(l.id));

    if (inaccessible.length === 0 && accessibleCount >= retroLeads.length) {
      scopePassed = true;
    } else {
      violations.push(
        `${inaccessible.length} retro lead(s) are NOT accessible via leadScope(canUser): ${inaccessible
          .map((l) => l.id)
          .join(", ")}`,
      );
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    violations.push(`Failed executing leadScope query: ${message}`);
  }

  checks.push({
    name: "Multi-Tenant Workspace Scoping (/api/leads query)",
    passed: scopePassed,
    details: scopePassed
      ? `100% of retro leads (${accessibleCount}/${retroLeads.length}) accessible via leadScope(canUser)`
      : `Scoping accessibility failed (${accessibleCount}/${retroLeads.length} accessible)`,
  });

  const passed = checks.every((c) => c.passed);
  const summary = passed
    ? `PASSED — High geographical diversity (${viennaDistricts.size} districts), ${distinctIndustries} industries, 100% scoped`
    : `FAILED — ${violations.length} diversity or scoping defect(s) detected`;

  return {
    tierNumber: 4,
    tierName: "Geographic & Industry Diversity Check",
    passed,
    summary,
    checks,
    violations,
  };
}

// ----------------------------------------------------------------------------
// Formatted Output & CLI Runner
// ----------------------------------------------------------------------------

function printBanner(targetCount: number) {
  console.log("================================================================================");
  console.log("            SCALE EVO CRM — 90 RETRO LEADS E2E VERIFICATION HARNESS            ");
  console.log("================================================================================");
  console.log(`Target User:       Can Akkus (${CAN_AKKUS_USER_ID})`);
  console.log(`User Email:        ${CAN_AKKUS_EMAIL}`);
  console.log(`Lead Source:       "${RETRO_SOURCE}"`);
  console.log(`Target Lead Count: ${targetCount} leads`);
  console.log(`Execution Time:    ${new Date().toISOString()}`);
  console.log("================================================================================\n");
}

function printTierResult(tier: TierResult, verbose: boolean) {
  const icon = tier.passed ? "✅ [PASS]" : "❌ [FAIL]";
  console.log(`--------------------------------------------------------------------------------`);
  console.log(`${icon} TIER ${tier.tierNumber}: ${tier.tierName}`);
  console.log(`Summary: ${tier.summary}`);
  console.log(`--------------------------------------------------------------------------------`);

  for (const check of tier.checks) {
    const cIcon = check.passed ? "  ✓" : "  ✗";
    console.log(`${cIcon} ${check.name.padEnd(45)} : ${check.details}`);
  }

  if (tier.violations.length > 0) {
    console.log(`\n  ⚠️  Defects & Violations (${tier.violations.length}):`);
    const displayViolations = verbose ? tier.violations : tier.violations.slice(0, 10);
    for (const v of displayViolations) {
      console.log(`     • ${v}`);
    }
    if (!verbose && tier.violations.length > 10) {
      console.log(`     ... and ${tier.violations.length - 10} more violations (run with --verbose to view all)`);
    }
  }
  console.log();
}

function printFinalSummary(report: VerificationReport) {
  console.log("================================================================================");
  console.log("                         FINAL VERIFICATION SUMMARY                             ");
  console.log("================================================================================");
  console.log(`Total Leads Analyzed: ${report.actualCount} / ${report.targetCount}`);
  console.log();

  for (const tier of report.tiers) {
    const status = tier.passed ? "PASSED" : "FAILED";
    console.log(`  Tier ${tier.tierNumber} (${tier.tierName.padEnd(38)}): [${status}]`);
  }

  console.log("--------------------------------------------------------------------------------");
  if (report.allPassed) {
    console.log("🎉 ALL 4 TIERS PASSED! VERIFICATION SUCCESSFUL (Exit Code: 0)");
    console.log("   The CRM database fulfills all acceptance criteria for 90 retro leads.");
  } else {
    console.log("❌ VERIFICATION FAILED (Exit Code: 1)");
    const failedTiers = report.tiers.filter((t) => !t.passed);
    console.log(`   ${failedTiers.length} tier(s) failed acceptance criteria:`);
    for (const ft of failedTiers) {
      console.log(`   - Tier ${ft.tierNumber} (${ft.tierName}): ${ft.summary}`);
    }
  }
  console.log("================================================================================\n");
}

export async function runVerification(options?: {
  targetCount?: number;
  verbose?: boolean;
  jsonOutput?: boolean;
}): Promise<VerificationReport> {
  const targetCount = options?.targetCount ?? 90;
  const verbose = options?.verbose ?? false;
  const jsonOutput = options?.jsonOutput ?? false;

  if (!jsonOutput) {
    printBanner(targetCount);
  }

  // Tier 1: Lead Count & Ownership
  const { result: tier1Result, retroLeads } = await verifyTier1(
    targetCount,
    CAN_AKKUS_USER_ID,
    CAN_AKKUS_EMAIL,
    RETRO_SOURCE,
  );
  if (!jsonOutput) printTierResult(tier1Result, verbose);

  // Tier 2: Field Completeness & Quality
  const tier2Result = verifyTier2(retroLeads);
  if (!jsonOutput) printTierResult(tier2Result, verbose);

  // Tier 3: Strict Deduplication
  const tier3Result = await verifyTier3(retroLeads, CAN_AKKUS_USER_ID);
  if (!jsonOutput) printTierResult(tier3Result, verbose);

  // Tier 4: Geographic & Industry Diversity
  const tier4Result = await verifyTier4(
    retroLeads,
    CAN_AKKUS_USER_ID,
    CAN_AKKUS_EMAIL,
  );
  if (!jsonOutput) printTierResult(tier4Result, verbose);

  const tiers = [tier1Result, tier2Result, tier3Result, tier4Result];
  const allPassed = tiers.every((t) => t.passed);

  const report: VerificationReport = {
    timestamp: new Date().toISOString(),
    targetUserId: CAN_AKKUS_USER_ID,
    targetEmail: CAN_AKKUS_EMAIL,
    source: RETRO_SOURCE,
    targetCount,
    actualCount: retroLeads.length,
    allPassed,
    tiers,
  };

  if (jsonOutput) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printFinalSummary(report);
  }

  return report;
}

// ----------------------------------------------------------------------------
// Script Entrypoint
// ----------------------------------------------------------------------------

if (require.main === module || process.argv[1]?.includes("verify-90-retro-leads")) {
  const cliArgs = parseCommandLineArgs();
  runVerification(cliArgs)
    .then((report) => {
      process.exit(report.allPassed ? 0 : 1);
    })
    .catch((err: unknown) => {
      console.error("FATAL ERROR during verification execution:", err);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}

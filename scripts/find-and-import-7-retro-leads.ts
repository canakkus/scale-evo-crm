import { prisma } from "../src/lib/prisma";
import { WebPresence, AcquisitionType, LeadStatus, Priority } from "@prisma/client";
import { WebsiteAuditProvider } from "../src/services/audit/website-provider";
import * as cheerio from "cheerio";

async function searchGooglePlaces(query: string) {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) throw new Error("No GOOGLE_PLACES_API_KEY");
  const url = "https://places.googleapis.com/v1/places:searchText";
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": "places.displayName,places.formattedAddress,places.websiteUri,places.rating,places.userRatingCount,places.internationalPhoneNumber,places.types,places.primaryTypeDisplayName",
    },
    body: JSON.stringify({
      textQuery: query,
      languageCode: "de",
      regionCode: process.env.GOOGLE_PLACES_REGION?.trim() || "AT",
      pageSize: 10,
    }),
  });
  if (!res.ok) {
    console.error("Places error:", res.status);
    return [];
  }
  const data = await res.json();
  return data.places || [];
}

async function analyzeOldStyle(url: string) {
  const auditor = new WebsiteAuditProvider();
  const basicAudit = await auditor.analyze(url);
  if (!basicAudit.reachable) return null;

  let html = "";
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
      },
      signal: AbortSignal.timeout(4000),
    });
    html = await res.text();
  } catch {
    // Ignore
  }

  const $ = cheerio.load(html);
  const bodyText = $("body").text().replace(/\s+/g, " ");

  const copyrightMatch = bodyText.match(/(?:©|copyright|\(c\))\s*(?:200\d|201[0-8])\b/i);
  const generator = $("meta[name='generator']").attr("content") || "";
  const layoutTables = $("table[width], table[border], td[valign]").length;

  let retroScore = 0;
  const retroFindings: string[] = [];

  if (!basicAudit.hasViewport) {
    retroScore += 45;
    retroFindings.push("Kein Mobile Viewport (nicht responsive – Schriften winzig auf Smartphones)");
  }
  if (!basicAudit.https) {
    retroScore += 25;
    retroFindings.push("Kein HTTPS (reines HTTP – Browser zeigt rote Warnung 'Nicht sicher')");
  }
  if (copyrightMatch) {
    retroScore += 20;
    retroFindings.push(`Veraltetes Copyright: '${copyrightMatch[0]}'`);
  }
  if (layoutTables > 2) {
    retroScore += 15;
    retroFindings.push(`Alte HTML-Layout-Tabellen (${layoutTables} Elemente)`);
  }
  if (generator) {
    retroFindings.push(`CMS/Generator: ${generator}`);
    if (/joomla|frontpage|dreamweaver|typo3 4|wordpress 3|wordpress 4/i.test(generator)) {
      retroScore += 20;
    }
  }
  if (basicAudit.menuIsPdf) {
    retroScore += 10;
    retroFindings.push("Speisekarte nur als PDF-Download");
  }
  if (!basicAudit.hasConsent) {
    retroScore += 10;
    retroFindings.push("Kein Cookie-Consent / DSGVO-Banner");
  }

  return {
    basicAudit,
    retroScore,
    retroFindings,
    copyright: copyrightMatch ? copyrightMatch[0] : null,
    generator,
    layoutTables,
  };
}

function buildPitch(name: string, industry: string, reviews: number, rating: number, analysis: any): { pitch: string; tags: string[]; scoreReasons: string[] } {
  const findings = analysis.retroFindings;
  const tags: string[] = ["RETRO_WEBSITE"];
  const scoreReasons: string[] = [];

  if (!analysis.basicAudit.hasViewport) {
    tags.push("NO_MOBILE_VIEWPORT");
    scoreReasons.push("Kein Mobile Viewport (<meta name='viewport'> fehlt)");
  }
  if (!analysis.basicAudit.https) {
    tags.push("NO_HTTPS");
    scoreReasons.push("Kein HTTPS (ungesichertes HTTP)");
  }
  if (analysis.copyright) {
    tags.push("OLD_COPYRIGHT");
    scoreReasons.push(`Uralt-Copyright: ${analysis.copyright}`);
  }
  if (analysis.layoutTables > 2) {
    tags.push("LAYOUT_TABLES");
    scoreReasons.push("HTML-Layout-Tabellen");
  }
  if (reviews > 100) {
    tags.push("HIGH_REVIEWS");
    scoreReasons.push(`${reviews} Google-Rezensionen (${rating}★)`);
  }

  let opener = "";
  if (!analysis.basicAudit.hasViewport && !analysis.basicAudit.https) {
    opener = `Servus! Ihr habt auf Google ${reviews > 0 ? `über ${reviews} super Bewertungen` : "einen top Ruf"}, aber wenn ein Kunde euch am Handy sucht, ist die Website komplett zerschossen und der Browser warnt vor einer ungesicherten Verbindung. Ich helfe lokalen Betrieben in Wien dabei, das kurzfristig und ohne Ausfallzeiten auf ein modernes Niveau zu bringen. Wann passt es diese Woche für ein kurzes Gespräch?`;
  } else if (!analysis.basicAudit.hasViewport) {
    opener = `Grüß Gott! Bei euren ${reviews > 0 ? `${reviews} Bewertungen` : "Kunden"} seid ihr eine feste Größe. Auf dem Smartphone lädt eure Website aber leider noch in der starren Desktop-Ansicht, sodass Kunden mühsam reinzoomen müssen, um Angebote oder Telefonnummern zu sehen. Lasst uns das glattziehen!`;
  } else {
    opener = `Servus! Eure Website läuft aktuell noch auf ungesichertem HTTP${analysis.copyright ? ` mit Stand von ${analysis.copyright}` : ""}. Moderne Browser markieren das rot als unsicher. Ich helfe Wiener Betrieben dabei, den Webauftritt abzusichern und für Mobilgeräte zu optimieren. Habt ihr 5 Minuten?`;
  }

  const pitchText = `🔥 RETRO-AUDIT (Score: ${analysis.retroScore}/100 - Handlungsbedarf):
${findings.map((f: string) => `• ${f}`).join("\n")}

🎯 PITCH & HEBEL FÜR DEN ANRUF:
"${opener}"`;

  return { pitch: pitchText, tags, scoreReasons };
}

async function main() {
  const canUser = await prisma.user.findUnique({
    where: { email: "canakkus378@gmail.com" },
  });

  if (!canUser) throw new Error("Can user not found!");

  const existingLeads = await prisma.lead.findMany({
    where: { createdById: canUser.id },
    select: { companyName: true, website: true },
  });

  const existingNames = new Set(existingLeads.map((l) => l.companyName.toLowerCase().trim()));
  const existingWebsites = new Set(existingLeads.map((l) => (l.website || "").toLowerCase().trim()));

  const searchQueries = [
    { q: "Gasthaus Wien 1030", industry: "Gastronomie" },
    { q: "Heuriger Wien 1190", industry: "Gastronomie" },
    { q: "Installateur Wien 1050", industry: "Handwerk & Haustechnik" },
    { q: "Tischlerei Wien 1050", industry: "Handwerk" },
    { q: "Schlosserei Wien", industry: "Handwerk" },
    { q: "Gasthaus Wien 1020", industry: "Gastronomie" },
    { q: "Elektriker Wien 1150", industry: "Handwerk & Elektro" },
    { q: "Autowerkstatt Wien 1100", industry: "KFZ & Werkstatt" },
    { q: "Malerbetrieb Wien", industry: "Handwerk" },
    { q: "Pizzeria Wien 1040", industry: "Gastronomie" },
  ];

  const targetCount = 7;
  const importedLeads: any[] = [];

  for (const { q, industry } of searchQueries) {
    if (importedLeads.length >= targetCount) break;
    console.log(`\n🔎 Suche: "${q}"...`);
    const places = await searchGooglePlaces(q);

    for (const p of places) {
      if (importedLeads.length >= targetCount) break;
      const name = p.displayName?.text;
      const website = p.websiteUri;
      const phone = p.internationalPhoneNumber;
      const address = p.formattedAddress;
      const rating = p.rating ?? 0;
      const reviews = p.userRatingCount ?? 0;

      if (!name || !website || !phone) continue;
      if (existingNames.has(name.toLowerCase().trim())) continue;
      if (existingWebsites.has(website.toLowerCase().trim())) continue;

      if (/facebook\.com|instagram\.com|wien\.gv\.at|herold\.at|firmenabc\.at|tripadvisor|lieferando/i.test(website)) {
        continue;
      }

      console.log(`Analysiere: ${name} (${website})...`);
      try {
        const analysis = await analyzeOldStyle(website);
        if (analysis && analysis.retroScore >= 35) {
          console.log(`-> TREFFER! Score ${analysis.retroScore}: ${analysis.retroFindings.join("; ")}`);
          
          const { pitch, tags, scoreReasons } = buildPitch(name, industry, reviews, rating, analysis);
          
          const cleanAddress = address?.split(",").slice(0, 2).join(",").trim() || address;

          const created = await prisma.lead.create({
            data: {
              companyName: name,
              industry,
              address: cleanAddress,
              city: "Wien",
              phone,
              website,
              googleRating: rating,
              googleReviewCount: reviews,
              source: "Lead Scout (2014-Website-Detector)",
              webPresence: WebPresence.WEBSITE,
              acquisitionType: AcquisitionType.CALL,
              status: LeadStatus.NEW,
              priority: Priority.HIGH,
              score: Math.min(98, analysis.retroScore + (reviews > 100 ? 10 : 0)),
              scoreReasons,
              opportunityTags: tags,
              interestingReason: `${name} in Wien: Retro-Score ${analysis.retroScore}/100 mit ${reviews} Bewertungen (${rating}★). ${analysis.retroFindings[0]}.`,
              notes: pitch,
              createdById: canUser.id,
            },
          });

          existingNames.add(name.toLowerCase().trim());
          existingWebsites.add(website.toLowerCase().trim());

          importedLeads.push({
            id: created.id,
            name: created.companyName,
            industry: created.industry,
            phone: created.phone,
            website: created.website,
            rating: created.googleRating,
            reviews: created.googleReviewCount,
            score: created.score,
            findings: analysis.retroFindings,
          });

          console.log(`✅ [${importedLeads.length}/${targetCount}] Importiert: ${name}`);
        }
      } catch (err: any) {
        console.log(`   Überspringe ${name}: ${err.message}`);
      }
    }
  }

  console.log("\n==================== ERGEBNIS ====================");
  console.log(`Erfolgreich ${importedLeads.length} Leads importiert!`);
  console.log(JSON.stringify(importedLeads, null, 2));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

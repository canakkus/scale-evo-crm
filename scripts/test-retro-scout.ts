import { WebsiteAuditProvider } from "@/services/audit/website-provider";
import * as cheerio from "cheerio";

// Candidate search queries for typical Austrian businesses with likely older websites
const testCandidates = [
  // Examples to test
  "Gasthaus Zur Stadt Frankfurt Wien",
  "Gasthaus Kopp Wien",
  "Installateur Wien 1050",
  "Tischlerei Wien",
  "Schlosserei Wien",
  "Gasthaus Wien 1030",
  "Pizzeria Wien 1100",
  "Heuriger Wien 1190",
  "Autowerkstatt Wien 1120"
];

async function searchGooglePlaces(query: string) {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    console.error("No GOOGLE_PLACES_API_KEY");
    return [];
  }
  const url = "https://places.googleapis.com/v1/places:searchText";
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": "places.displayName,places.formattedAddress,places.websiteUri,places.rating,places.userRatingCount,places.internationalPhoneNumber",
    },
    body: JSON.stringify({
      textQuery: query,
      languageCode: "de",
      regionCode: process.env.GOOGLE_PLACES_REGION?.trim() || "AT",
      pageSize: 5,
    }),
  });
  if (!res.ok) {
    console.error("Places error:", res.status, await res.text());
    return [];
  }
  const data = await res.json();
  return data.places || [];
}

async function analyzeOldStyle(url: string) {
  const auditor = new WebsiteAuditProvider();
  const basicAudit = await auditor.analyze(url);
  if (!basicAudit.reachable) return null;

  // Additional deep check for 2014-style indicators
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

  // 1. Copyright year check
  const copyrightMatch = bodyText.match(/(?:©|copyright|\(c\))\s*(?:200\d|201[0-8])\b/i);

  // 2. Old generator / CMS
  const generator = $("meta[name='generator']").attr("content") || "";

  // 3. Layout tables
  const layoutTables = $("table[width], table[border], td[valign]").length;

  // 4. Flash or old frames
  const hasFrames = $("frame, frameset, iframe[src*='swf']").length > 0;

  // 5. Retro score
  let retroScore = 0;
  const retroFindings: string[] = [];

  if (!basicAudit.hasViewport) {
    retroScore += 40;
    retroFindings.push("Kein Mobile Viewport (<meta name='viewport'> fehlt – mobil nicht responsive)");
  }
  if (!basicAudit.https) {
    retroScore += 25;
    retroFindings.push("Kein HTTPS (reines HTTP – Browser zeigt 'Nicht sicher')");
  }
  if (copyrightMatch) {
    retroScore += 20;
    retroFindings.push(`Veraltetes Copyright erkannt: '${copyrightMatch[0]}'`);
  }
  if (layoutTables > 2) {
    retroScore += 15;
    retroFindings.push(`Alte HTML-Tabellen für Layout verwendet (${layoutTables} Elemente)`);
  }
  if (generator) {
    retroFindings.push(`Generator: ${generator}`);
    if (/joomla|frontpage|dreamweaver|typo3 4|wordpress 3|wordpress 4\.[0-5]/i.test(generator)) {
      retroScore += 20;
    }
  }
  if (basicAudit.menuIsPdf) {
    retroScore += 10;
    retroFindings.push("Speisekarte nur als alter PDF-Download");
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

async function run() {
  console.log("=== STARTING 2014-STYLE TEST RUN VIA LEAD SCOUT & PLACES ===");
  const queries = [
    "Gasthaus Wien 1050",
    "Gasthaus Wien 1150",
    "Gasthaus Wien 1160",
    "Installateur Wien 1120",
    "Heuriger Wien 1190",
    "Tischlerei Wien 1100"
  ];

  const foundCandidates: any[] = [];

  for (const q of queries) {
    if (foundCandidates.length >= 3) break;
    console.log(`\nSuche Betriebe für: "${q}"...`);
    const places = await searchGooglePlaces(q);
    
    for (const p of places) {
      if (foundCandidates.length >= 3) break;
      const name = p.displayName?.text;
      const website = p.websiteUri;
      const phone = p.internationalPhoneNumber;
      const address = p.formattedAddress;
      const rating = p.rating;
      const reviews = p.userRatingCount;

      if (!website) continue;
      // Skip major chains/directories like facebook, instagram, wien.gv.at, herold
      if (/facebook\.com|instagram\.com|wien\.gv\.at|herold\.at|firmenabc\.at|tripadvisor/i.test(website)) {
        continue;
      }

      console.log(`Prüfe Website: ${name} -> ${website}`);
      try {
        const analysis = await analyzeOldStyle(website);
        if (analysis && analysis.retroScore >= 35) {
          console.log(`-> TREFFER! Retro-Score: ${analysis.retroScore}/100 (${analysis.retroFindings.join("; ")})`);
          foundCandidates.push({
            name,
            address,
            phone,
            website,
            rating,
            reviews,
            retroScore: analysis.retroScore,
            retroFindings: analysis.retroFindings,
            https: analysis.basicAudit.https,
            hasViewport: analysis.basicAudit.hasViewport,
          });
        } else if (analysis) {
          console.log(`   (Score nur ${analysis.retroScore}, nicht retro genug)`);
        }
      } catch (err: any) {
        console.log(`   Fehler beim Abruf: ${err.message}`);
      }
    }
  }

  console.log("\n==================== TEST ERGEBNIS ====================");
  console.log(JSON.stringify(foundCandidates, null, 2));
}

run().catch(console.error);

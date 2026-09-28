import { prisma } from "../src/lib/prisma";
import { WebPresence, AcquisitionType, LeadStatus, Priority } from "@prisma/client";

async function main() {
  const canUser = await prisma.user.findUnique({
    where: { email: "canakkus378@gmail.com" },
  });

  if (!canUser) {
    throw new Error("User canakkus378@gmail.com not found!");
  }

  const leadsToImport = [
    {
      companyName: "Gasthaus Woracziczky",
      industry: "Gastronomie",
      address: "Spengergasse 52",
      city: "Wien",
      phone: "+43 699 11229530",
      website: "http://www.woracziczky.at/",
      googleRating: 4.6,
      googleReviewCount: 818,
      source: "Lead Scout (2014-Website-Detector)",
      webPresence: WebPresence.WEBSITE,
      acquisitionType: AcquisitionType.CALL,
      status: LeadStatus.NEW,
      priority: Priority.HIGH,
      score: 92,
      scoreReasons: [
        "Extrem veraltete 2014-Style Website (Retro-Score 90/100)",
        "Kein Mobile Viewport (<meta name='viewport'> fehlt – mobil nicht lesbar)",
        "Kein HTTPS (reines ungesichertes HTTP)",
        "Alte HTML-Layout-Tabellen (7 Elemente)",
        "Top-Betrieb mit 818 Rezensionen (4.6★) – hohes Budget & Bedarf"
      ],
      opportunityTags: [
        "RETRO_WEBSITE",
        "NO_MOBILE_VIEWPORT",
        "NO_HTTPS",
        "LAYOUT_TABLES",
        "HIGH_REVIEWS"
      ],
      interestingReason: "Top Gasthaus im 5. Bezirk mit 818 Bewertungen (4.6★), aber Website stammt aus den 2010ern: Null Mobiloptimierung, ungesichertes HTTP und alte HTML-Tabellen.",
      notes: `🔥 RETRO-AUDIT (Score: 90/100 - Dringender Relaunch-Bedarf):
• Kein Mobile Viewport: Auf Smartphones wird die Seite mikroskopisch klein dargestellt. Gäste müssen reinzoomen und quer scrollen.
• Kein HTTPS: Reines http:// - Browser zeigen rote Sicherheitswarnung ("Nicht sicher").
• Uralte HTML-Tabellen: Seite ist noch mit 7 Layout-Tabellen gebaut wie vor 15 Jahren.
• Kein Cookie-Consent / DSGVO-Banner vorhanden.

🎯 PITCH & HEBEL FÜR DEN ANRUF:
"Servus Herr Woracziczky! Ihr habt auf Google über 800 fantastische Bewertungen, aber wenn Gäste euch mobil suchen, ist die Website komplett verschoben und der Browser warnt vor einer ungesicherten Verbindung. Wollen wir das kurzfristig auf ein modernes Niveau bringen?"`,
    },
    {
      companyName: "Gasthaus Quell",
      industry: "Gastronomie",
      address: "Reindorfgasse 19",
      city: "Wien",
      phone: "+43 1 8932407",
      website: "https://www.gasthausquell.at/",
      googleRating: 4.7,
      googleReviewCount: 1821,
      source: "Lead Scout (2014-Website-Detector)",
      webPresence: WebPresence.WEBSITE,
      acquisitionType: AcquisitionType.CALL,
      status: LeadStatus.NEW,
      priority: Priority.HIGH,
      score: 85,
      scoreReasons: [
        "Extrem viele Kunden (1.821 Rezensionen, 4.7★)",
        "Kein Mobile Viewport (<meta name='viewport'> fehlt)",
        "Desktop-Layout aus 2014 auf Smartphones",
        "Kein Cookie-Consent"
      ],
      opportunityTags: [
        "RETRO_WEBSITE",
        "NO_MOBILE_VIEWPORT",
        "HUGE_CUSTOMER_BASE",
        "HIGH_REVIEWS"
      ],
      interestingReason: "1.821 Google-Rezensionen (4.7★), aber die Website hat keinen Mobile Viewport und ist auf Smartphones überhaupt nicht optimiert.",
      notes: `🔥 RETRO-AUDIT (Score: 50/100):
• Kein Mobile Viewport: <meta name='viewport'> fehlt komplett. Auf dem Smartphone lädt die starre Desktop-Ansicht aus ca. 2014.
• Kein Cookie-Consent-System vorhanden.
• Riesige Stammkundschaft (1.821 Google-Bewertungen mit 4.7 Sternen).

🎯 PITCH & HEBEL FÜR DEN ANRUF:
"Grüß Gott! Bei fast 2.000 Bewertungen auf Google seid ihr eine der gefragtesten Adressen im 15. Bezirk. Wenn man eure Website aber am Handy aufruft, lädt noch die alte Desktop-Ansicht und man muss mühsam zoomen, um Speisen oder Öffnungszeiten zu lesen. Lasst uns das glattziehen!"`,
    },
    {
      companyName: "Zum lieben Augustin",
      industry: "Gastronomie",
      address: "Reinprechtsdorfer Str. 47",
      city: "Wien",
      phone: "+43 1 5453444",
      website: "http://gasthaus-zumliebenaugustin.at/",
      googleRating: 4.7,
      googleReviewCount: 1301,
      source: "Lead Scout (2014-Website-Detector)",
      webPresence: WebPresence.WEBSITE,
      acquisitionType: AcquisitionType.CALL,
      status: LeadStatus.NEW,
      priority: Priority.HIGH,
      score: 78,
      scoreReasons: [
        "Reines ungesichertes HTTP (Kein HTTPS)",
        "Uraltes WordPress 4.7 (Stand Ende 2016, großes Sicherheitsrisiko)",
        "Kein Cookie-Consent",
        "1.301 Bewertungen mit 4.7★"
      ],
      opportunityTags: [
        "RETRO_WEBSITE",
        "NO_HTTPS",
        "OUTDATED_CMS",
        "HIGH_REVIEWS"
      ],
      interestingReason: "Beliebtes Wiener Gasthaus (1.301 Reviews), läuft unverschlüsselt auf HTTP mit einer 10 Jahre alten WordPress 4.7 Version ohne Sicherheits-Updates.",
      notes: `🔥 RETRO-AUDIT (Score: 35/100):
• Kein HTTPS: Reines unverschlüsseltes http:// mit Warnung im Browser.
• Veraltetes CMS: Generator zeigt WordPress 4.7 (erschienen 2016 – seit 10 Jahren nicht gepflegt, akutes Sicherheitsrisiko).
• Kein Cookie-Consent / DSGVO-Banner.
• Top-Bewertungen: 1.301 Reviews (4.7★).

🎯 PITCH & HEBEL FÜR DEN ANRUF:
"Servus! Euer Gasthaus hat über 1.300 super Bewertungen auf Google. Eure Website läuft aber noch auf unverschlüsseltem HTTP und einer alten WordPress-Version von 2016. Ich helfe lokalen Gastronomen im 5. Bezirk dabei, ihren Webauftritt abzusichern und auf ein modernes Niveau zu bringen."`,
    },
  ];

  for (const item of leadsToImport) {
    const existing = await prisma.lead.findFirst({
      where: {
        createdById: canUser.id,
        companyName: item.companyName,
      },
    });

    if (existing) {
      console.log(`Lead "${item.companyName}" existiert bereits (ID: ${existing.id}). Aktualisiere...`);
      await prisma.lead.update({
        where: { id: existing.id },
        data: {
          notes: item.notes,
          score: item.score,
          scoreReasons: item.scoreReasons,
          opportunityTags: item.opportunityTags,
          interestingReason: item.interestingReason,
        },
      });
    } else {
      const created = await prisma.lead.create({
        data: {
          ...item,
          createdById: canUser.id,
        },
      });
      console.log(`✅ Lead erfolgreich importiert: "${created.companyName}" (ID: ${created.id})`);
    }
  }

  console.log("\n🎉 Alle 3 Leads wurden erfolgreich in Cans Account importiert!");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

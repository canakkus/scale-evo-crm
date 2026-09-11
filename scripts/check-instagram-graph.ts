/**
 * ============================================================
 * INSTAGRAM-QUELLEN-CHECK  —  npm run instagram:check [handle]
 * ============================================================
 * Prüft in einem Durchgang die gesamte Quellenkette:
 *
 *   1. Instagram Graph API   (offiziell, gratis, braucht Advanced Access)
 *   2. Apify                 (kostenpflichtig, ~$1,60 / 1.000 Profile)
 *   3. Öffentlicher Abruf    (gratis, liefert fast nur die Reichweite)
 *
 * Am Ende steht, welche Quelle aktuell tatsächlich greifen würde.
 *
 * Ohne Argument wird @mottoamfluss abgefragt — ein öffentliches
 * Wiener Business-Profil, das sich gut als Referenz eignet.
 *
 * ACHTUNG: Ein Testlauf über Apify ist ein echter Actor-Run und
 * kostet Geld. Er wird deshalb nur mit --apify ausgeführt.
 * ============================================================
 */

import { InstagramGraphApiProvider, getGraphApiConfig } from "../src/services/instagram/graph-api-provider";
import { InstagramApifyProvider, getApifyConfig } from "../src/services/instagram/apify-provider";
import type { InstagramProfile } from "../src/services/instagram/types";

const args = process.argv.slice(2);
const runApifyProbe = args.includes("--apify");
const TARGET = args.find((arg) => !arg.startsWith("--"))?.replace(/^@/, "") || "mottoamfluss";

function printProfile(profile: InstagramProfile) {
  console.log(`    Name:            ${profile.displayName ?? "—"}`);
  console.log(`    Follower:        ${profile.followerCount ?? "—"}`);
  console.log(`    Beiträge:        ${profile.postCount ?? "—"}`);
  console.log(`    Link in Bio:     ${profile.externalUrl ?? (profile.externalUrlKnown ? "KEINER  ← starkes Verkaufssignal" : "unbekannt")}`);
  console.log(`    Letzter Post:    ${profile.daysSinceLastPost != null ? `vor ${profile.daysSinceLastPost} Tagen` : "—"}`);
  console.log(`    Bio:             ${profile.bio ? `"${profile.bio.slice(0, 90)}"` : "—"}`);
  if (profile.latestPostCaption) {
    console.log(`    Aufhänger:       "${profile.latestPostCaption.slice(0, 90)}"`);
  }
}

/** @returns true, wenn die Graph API vollständige Fremdprofile liefert. */
async function checkGraphApi(): Promise<boolean> {
  console.log("── 1. Instagram Graph API ───────────────────────────────\n");

  const config = getGraphApiConfig();
  if (!config) {
    console.log("  ⚠ Nicht konfiguriert. Es fehlen in der .env:");
    if (!process.env.INSTAGRAM_GRAPH_TOKEN?.trim()) console.log("      - INSTAGRAM_GRAPH_TOKEN");
    if (!process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID?.trim()) console.log("      - INSTAGRAM_BUSINESS_ACCOUNT_ID");
    console.log("");
    return false;
  }

  console.log(`  API-Version:        ${config.version}`);
  console.log(`  Business-Account:   ${config.businessAccountId}`);
  console.log(`  Token:              …${config.token.slice(-8)}\n`);

  try {
    const meUrl =
      `https://graph.facebook.com/${config.version}/${config.businessAccountId}` +
      `?fields=username,name,followers_count&access_token=${encodeURIComponent(config.token)}`;
    const response = await fetch(meUrl, { cache: "no-store" });
    const data = await response.json();
    if (data.error) {
      console.log(`  ✗ Token oder Account-ID abgelehnt: ${data.error.message}`);
      console.log("    Häufige Ursachen: abgelaufenes Token (kurzlebige halten ~1 Std),");
      console.log("    falsche ID (gebraucht wird die IG-Business-Account-ID) oder fehlende Rechte.\n");
      return false;
    }
    console.log(`  ✓ Eigener Account erreichbar: @${data.username ?? "?"} (${data.followers_count ?? "?"} Follower)`);
  } catch (error) {
    console.log("  ✗ Verbindung fehlgeschlagen:", error instanceof Error ? error.message : error);
    return false;
  }

  const profile = await new InstagramGraphApiProvider(config).fetchProfile(TARGET);
  if (profile.incomplete) {
    console.log(`  ✗ business_discovery an @${TARGET}: ${profile.note}`);
    console.log("    Fremde Profile brauchen Advanced Access für instagram_basic");
    console.log("    (Meta App Review + Business-Verifizierung). Bis dahin greift Apify.\n");
    return false;
  }

  console.log(`  ✓ business_discovery funktioniert (@${TARGET}):\n`);
  printProfile(profile);
  console.log("");
  return true;
}

/** @returns true, wenn Apify als Rückfall einsatzbereit ist. */
async function checkApify(): Promise<boolean> {
  console.log("── 2. Apify ─────────────────────────────────────────────\n");

  const config = getApifyConfig();
  if (!config) {
    console.log("  ⚠ Nicht konfiguriert. In der .env fehlt: APIFY_TOKEN");
    console.log("    Token unter https://console.apify.com/settings/integrations erzeugen.\n");
    return false;
  }

  console.log(`  Actor:              ${config.actor}`);
  console.log(`  Token:              …${config.token.slice(-6)}`);
  console.log(`  Zeitgrenze:         ${Math.round(config.timeoutMs / 1000)}s\n`);

  // Kontostand-Abfrage statt Actor-Run: kostet nichts und beantwortet
  // trotzdem die eigentliche Frage — ist das Token gültig?
  try {
    const response = await fetch("https://api.apify.com/v2/users/me", {
      headers: { Authorization: `Bearer ${config.token}` },
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });

    if (response.status === 401 || response.status === 403) {
      console.log("  ✗ Token abgelehnt (HTTP 401/403). APIFY_TOKEN prüfen.\n");
      return false;
    }
    if (!response.ok) {
      console.log(`  ✗ Apify antwortet mit HTTP ${response.status}.\n`);
      return false;
    }

    const payload = (await response.json()) as { data?: { username?: string; plan?: { id?: string } } };
    console.log(`  ✓ Token gültig — Konto: ${payload.data?.username ?? "?"}${payload.data?.plan?.id ? ` (${payload.data.plan.id})` : ""}`);
  } catch (error) {
    console.log("  ✗ Apify nicht erreichbar:", error instanceof Error ? error.message : error);
    console.log("");
    return false;
  }

  if (!runApifyProbe) {
    console.log("    Ein echter Profilabruf kostet Geld (~$1,60 / 1.000 Profile).");
    console.log(`    Testlauf ausdrücklich anfordern:  npm run instagram:check -- ${TARGET} --apify\n`);
    return true;
  }

  console.log(`\n  Starte Testlauf an @${TARGET} … (kostenpflichtig)\n`);
  const run = await new InstagramApifyProvider(config).fetchProfiles([TARGET]);
  const profile = run.profiles.get(TARGET.toLowerCase());

  if (run.status !== "ok" || !profile || profile.incomplete) {
    console.log(`  ✗ Kein verwertbarer Datensatz: ${run.note ?? profile?.note ?? "unbekannter Fehler"}`);
    console.log("    Kein automatischer Neuversuch — ein abgebrochener Run läuft weiter");
    console.log("    und wird trotzdem abgerechnet.\n");
    return false;
  }

  console.log("  ✓ Apify liefert vollständige Profildaten:\n");
  printProfile(profile);
  console.log("");
  return true;
}

async function main() {
  console.log("\n══ Instagram-Datenquellen — Check ═══════════════════════\n");

  const graphOk = await checkGraphApi();
  const apifyOk = await checkApify();

  console.log("── 3. Öffentlicher Seitenabruf ──────────────────────────\n");
  console.log("  ✓ Immer verfügbar, braucht keine Konfiguration.");
  console.log("    Liefert ausgeloggt aber nur Followerzahl und Namen —");
  console.log("    Bio, Link-in-Bio und letzter Post bleiben UNBEKANNT.\n");

  console.log("── Ergebnis ─────────────────────────────────────────────\n");
  const active = graphOk ? "Instagram Graph API" : apifyOk ? "Apify" : "Öffentlicher Seitenabruf";
  console.log(`  Aktive Quelle:      ${active}`);
  console.log(`  Kette:              Graph API ${graphOk ? "✓" : "✗"}  →  Apify ${apifyOk ? "✓" : "✗"}  →  Öffentlich ✓\n`);

  if (graphOk) {
    console.log("  Die offizielle Anbindung hat Vorrang und kostet nichts.\n");
  } else if (apifyOk) {
    console.log("  Scoring läuft auf echten Daten. Jeder Abruf kostet Geld —");
    console.log("  Vorfilter und 30-Tage-Cache greifen automatisch.\n");
    console.log("  Sobald Meta Advanced Access gewährt, übernimmt die Graph API");
    console.log("  wieder automatisch. Am Code ist dafür nichts zu ändern.\n");
  } else {
    console.log("  ⚠ Keine vollständige Quelle aktiv. Bio, Link-in-Bio und");
    console.log("    letzter Post bleiben leer — das Scoring arbeitet dann");
    console.log("    nur mit der Reichweite und markiert Leads als ungefähr.\n");
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Abgebrochen:", error);
  process.exit(1);
});

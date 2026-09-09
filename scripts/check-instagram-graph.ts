/**
 * ============================================================
 * GRAPH-API-CHECK  —  npm run instagram:check [handle]
 * ============================================================
 * Prüft in einem Durchgang, ob die Instagram-Anbindung steht:
 *   1. Sind Token und Business-Account-ID gesetzt?
 *   2. Ist das Token gültig und wie lange noch?
 *   3. Liefert Business Discovery für ein echtes Profil Daten?
 *
 * Ohne Argument wird @mottoamfluss abgefragt — ein öffentliches
 * Wiener Business-Profil, das sich gut als Referenz eignet.
 * ============================================================
 */

import { InstagramGraphApiProvider, getGraphApiConfig } from "../src/services/instagram/graph-api-provider";

const TARGET = process.argv[2]?.replace(/^@/, "") || "mottoamfluss";

async function main() {
  console.log("\n── Instagram Graph API — Check ──────────────────────────\n");

  const config = getGraphApiConfig();
  if (!config) {
    console.error("✗ Nicht konfiguriert.\n");
    console.error("  In der .env fehlen:");
    if (!process.env.INSTAGRAM_GRAPH_TOKEN?.trim()) console.error("    - INSTAGRAM_GRAPH_TOKEN");
    if (!process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID?.trim()) console.error("    - INSTAGRAM_BUSINESS_ACCOUNT_ID");
    console.error("\n  Solange das fehlt, nutzt das CRM den öffentlichen Seitenabruf.");
    console.error("  Der liefert nur die Followerzahl — Bio und Link-in-Bio bleiben leer.\n");
    process.exit(1);
  }

  console.log(`  API-Version:        ${config.version}`);
  console.log(`  Business-Account:   ${config.businessAccountId}`);
  console.log(`  Token:              …${config.token.slice(-8)}\n`);

  // 1. Token prüfen
  try {
    const meUrl = `https://graph.facebook.com/${config.version}/${config.businessAccountId}?fields=username,name,followers_count&access_token=${encodeURIComponent(config.token)}`;
    const response = await fetch(meUrl, { cache: "no-store" });
    const data = await response.json();
    if (data.error) {
      console.error(`✗ Token oder Account-ID abgelehnt: ${data.error.message}`);
      console.error("\n  Häufige Ursachen:");
      console.error("    - Token abgelaufen (kurzlebige Tokens halten nur ~1 Stunde)");
      console.error("    - Falsche ID: gebraucht wird die Instagram-Business-Account-ID,");
      console.error("      nicht die Facebook-Seiten-ID und nicht die App-ID");
      console.error("    - Fehlende Berechtigungen für Instagram in der Meta-App\n");
      process.exit(1);
    }
    console.log(`✓ Eigener Account erreichbar: @${data.username ?? "?"} (${data.followers_count ?? "?"} Follower)\n`);
  } catch (error) {
    console.error("✗ Verbindung zur Graph API fehlgeschlagen:", error instanceof Error ? error.message : error);
    process.exit(1);
  }

  // 2. Business Discovery an einem echten Profil
  console.log(`  Teste Business Discovery an @${TARGET} …\n`);
  const profile = await new InstagramGraphApiProvider(config).fetchProfile(TARGET);

  if (profile.incomplete) {
    console.error(`✗ Keine Daten: ${profile.note}`);
    console.error("\n  Falls die Meldung auf ein fehlendes Business-Profil hinweist:");
    console.error("  das Ziel muss selbst ein öffentliches Business-/Creator-Konto sein.\n");
    process.exit(1);
  }

  console.log(`✓ Business Discovery funktioniert.\n`);
  console.log(`    Name:            ${profile.displayName ?? "—"}`);
  console.log(`    Follower:        ${profile.followerCount ?? "—"}`);
  console.log(`    Beiträge:        ${profile.postCount ?? "—"}`);
  console.log(`    Link in Bio:     ${profile.externalUrl ?? "KEINER  ← starkes Verkaufssignal"}`);
  console.log(`    Letzter Post:    ${profile.daysSinceLastPost != null ? `vor ${profile.daysSinceLastPost} Tagen` : "—"}`);
  console.log(`    Bio:             ${profile.bio ? `"${profile.bio.slice(0, 90)}"` : "—"}`);
  console.log("\n  Damit läuft das Scoring auf echten Daten statt auf Vermutungen.\n");
}

main().catch((error) => {
  console.error("Abgebrochen:", error);
  process.exit(1);
});

/**
 * ============================================================
 * GRAPH-API-EINRICHTUNG  —  npm run instagram:setup <token>
 * ============================================================
 * Nimmt das kurzlebige Token aus dem Graph API Explorer und
 * erledigt den Rest:
 *
 *   1. tauscht es gegen ein langlebiges (~60 Tage)
 *   2. sucht die verknüpfte Facebook-Seite
 *   3. liest die Instagram-Business-Account-ID aus
 *   4. gibt aus, was in die .env gehört
 *
 * Voraussetzung in der .env:
 *   INSTAGRAM_APP_ID     — steht in der URL des Explorers
 *   INSTAGRAM_APP_SECRET — App-Einstellungen → Allgemein
 * ============================================================
 */

const VERSION = process.env.INSTAGRAM_GRAPH_VERSION?.trim() || "v21.0";

type PageEntry = {
  id: string;
  name?: string;
  instagram_business_account?: { id: string; username?: string };
};

async function graph(path: string, params: Record<string, string>) {
  const query = new URLSearchParams(params).toString();
  const response = await fetch(`https://graph.facebook.com/${VERSION}/${path}?${query}`, { cache: "no-store" });
  const data = await response.json();
  if (data.error) throw new Error(data.error.message ?? "Unbekannter Graph-API-Fehler");
  return data;
}

async function main() {
  const shortToken = process.argv[2]?.trim();
  const appId = process.env.INSTAGRAM_APP_ID?.trim();
  const appSecret = process.env.INSTAGRAM_APP_SECRET?.trim();

  console.log("\n── Instagram Graph API — Einrichtung ────────────────────\n");

  if (!shortToken) {
    console.error("✗ Kein Token übergeben.\n");
    console.error("  Aufruf:  npm run instagram:setup -- <kurzlebiges-Token>\n");
    console.error("  Das Token stammt aus dem Graph API Explorer, Feld „Zugriffstoken“.\n");
    process.exit(1);
  }
  if (!appId || !appSecret) {
    console.error("✗ In der .env fehlt:\n");
    if (!appId) {
      console.error("  · INSTAGRAM_APP_ID");
      console.error("      Die lange Zahl in der Adresszeile des Graph API Explorers.\n");
    }
    if (!appSecret) {
      console.error("  · INSTAGRAM_APP_SECRET");
      console.error("      developers.facebook.com → deine App „ScaleEvoCRM“");
      console.error("      → App-Einstellungen → Allgemein → App-Geheimnis → „Anzeigen“");
      console.error("      (Passwort-Abfrage von Facebook, dann kopieren)\n");
    }
    if (appId) console.error(`  App-ID ist gesetzt: ${appId}\n`);
    process.exit(1);
  }

  // 1. Langlebiges Token
  console.log("  1/3  Token wird gegen ein langlebiges getauscht …");
  let longToken: string;
  let expiresInDays: number | null = null;
  try {
    const data = await graph("oauth/access_token", {
      grant_type: "fb_exchange_token",
      client_id: appId,
      client_secret: appSecret,
      fb_exchange_token: shortToken,
    });
    longToken = data.access_token;
    if (typeof data.expires_in === "number") expiresInDays = Math.round(data.expires_in / 86400);
    console.log(`       ✓ erhalten${expiresInDays ? ` (gültig ca. ${expiresInDays} Tage)` : ""}\n`);
  } catch (error) {
    console.error(`       ✗ ${error instanceof Error ? error.message : error}\n`);
    console.error("  Häufigste Ursache: Das kurzlebige Token ist bereits abgelaufen.");
    console.error("  Im Explorer neu erzeugen und sofort hier einsetzen.\n");
    process.exit(1);
  }

  // 2. Seiten des Nutzers
  console.log("  2/3  Verknüpfte Facebook-Seiten werden gesucht …");
  let pages: PageEntry[] = [];
  try {
    const data = await graph("me/accounts", {
      fields: "name,instagram_business_account{id,username}",
      access_token: longToken,
    });
    pages = data.data ?? [];
  } catch (error) {
    console.error(`       ✗ ${error instanceof Error ? error.message : error}\n`);
    process.exit(1);
  }

  if (pages.length === 0) {
    console.error("       ✗ Keine Facebook-Seite gefunden.\n");
    console.error("  Dein Instagram-Konto muss ein Business- oder Creator-Konto sein");
    console.error("  UND mit einer Facebook-Seite verknüpft sein. Beim Erzeugen des");
    console.error("  Tokens musste die Seite außerdem ausgewählt (angehakt) werden.\n");
    process.exit(1);
  }
  console.log(`       ✓ ${pages.length} Seite(n) gefunden\n`);

  // 3. Instagram-Business-Account
  console.log("  3/3  Instagram-Business-Account wird ausgelesen …\n");
  const linked = pages.filter((page) => page.instagram_business_account?.id);

  if (linked.length === 0) {
    console.error("       ✗ Keine der Seiten hat ein verknüpftes Instagram-Business-Konto.\n");
    for (const page of pages) console.error(`         · ${page.name ?? page.id} — nicht verknüpft`);
    console.error("\n  In der Meta Business Suite: Seite → Einstellungen → Verknüpfte Konten\n");
    process.exit(1);
  }

  for (const page of linked) {
    const ig = page.instagram_business_account!;
    console.log(`       ✓ ${page.name ?? page.id}  →  @${ig.username ?? "?"}  (ID ${ig.id})`);
  }

  const chosen = linked[0].instagram_business_account!;
  if (linked.length > 1) {
    console.log(`\n  Mehrere gefunden — unten steht die erste (@${chosen.username ?? "?"}).`);
    console.log("  Falls das die falsche ist, nimm die passende ID von oben.");
  }

  console.log("\n────────────────────────────────────────────────────────");
  console.log("  Das gehört jetzt in die .env:\n");
  console.log(`INSTAGRAM_GRAPH_TOKEN="${longToken}"`);
  console.log(`INSTAGRAM_BUSINESS_ACCOUNT_ID="${chosen.id}"`);
  console.log("\n  Danach prüfen mit:  npm run instagram:check");
  if (expiresInDays) {
    const until = new Date(Date.now() + expiresInDays * 86400000).toLocaleDateString("de-AT");
    console.log(`\n  ⚠ Das Token läuft um den ${until} ab und muss dann erneuert werden.`);
  }
  console.log("");
}

main().catch((error) => {
  console.error("\nAbgebrochen:", error instanceof Error ? error.message : error, "\n");
  process.exit(1);
});

import * as cheerio from "cheerio";
import type { AuditCategory, AuditSeverity } from "@prisma/client";
import { normalizeUrl } from "@/lib/utils";

/**
 * Passiver Erst-Audit einer Lead-Website. Es wird genau EINE Seite per GET
 * geladen und ausgewertet — keine Payloads, kein Crawling, keine Angriffe.
 */

export type AuditIssueDraft = {
  category: AuditCategory;
  severity: AuditSeverity;
  code: string;
  title: string;
  description?: string;
  snippet?: string;
};

export type SecurityAuditResult = {
  url: string;
  issues: AuditIssueDraft[];
  reachable: boolean;
  /** true, wenn ein Screenshot als Beleg sinnvoll ist (Security / Old-Gen / Broken). */
  shouldScreenshot: boolean;
};

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

const SEVERITY_POINTS: Record<AuditSeverity, number> = {
  INFO: 0,
  LOW: 3,
  MEDIUM: 8,
  HIGH: 18,
  CRITICAL: 30,
};

/** 0-100, gedeckelt. Mehr/schwerere Probleme = hoeherer Wert. */
export function computeSeverityScore(issues: Pick<AuditIssueDraft, "severity">[]): number {
  const total = issues.reduce((sum, issue) => sum + SEVERITY_POINTS[issue.severity], 0);
  return Math.min(100, total);
}

function clip(value: string, max = 400): string {
  const flat = value.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max)}...` : flat;
}

const ERROR_LEAK_PATTERNS: { re: RegExp; label: string }[] = [
  { re: /Traceback \(most recent call last\)/i, label: "Python Stack Trace" },
  { re: /Fatal error:.{0,40}in \/[\w/.-]+\.php/i, label: "PHP Fatal Error mit Dateipfad" },
  { re: /(Warning|Notice|Deprecated): .{0,80} in \/[\w/.-]+ on line \d+/i, label: "PHP Warning mit Dateipfad" },
  { re: /SQLSTATE\[|You have an error in your SQL syntax|mysqli?_[a-z_]+\(\)/i, label: "SQL-Fehlermeldung" },
  { re: /at [\w.$]+\([\w.]+\.java:\d+\)/i, label: "Java Stack Trace" },
  { re: /Whoops, looks like something went wrong|APP_DEBUG|DEBUG = True/i, label: "Debug-Modus aktiv" },
];

export async function runSecurityAudit(input: string): Promise<SecurityAuditResult> {
  const normalized = normalizeUrl(input);
  const url = normalized ?? (input.startsWith("http") ? input : `https://${input}`);
  const issues: AuditIssueDraft[] = [];
  const add = (issue: AuditIssueDraft) => {
    if (!issues.some((existing) => existing.code === issue.code)) issues.push(issue);
  };

  const startedAt = performance.now();
  let tlsFailureMessage: string | null = null;

  let response: Response | null = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, "Accept-Language": "de-DE,de;q=0.9,en;q=0.8" },
    redirect: "follow",
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  }).catch((err: unknown) => {
    tlsFailureMessage = err instanceof Error ? `${err.message}${(err as { cause?: { code?: string } }).cause?.code ? ` (${(err as { cause?: { code?: string } }).cause?.code})` : ""}` : String(err);
    return null;
  });

  if (!response && url.startsWith("https://")) {
    response = await fetch(url.replace(/^https:\/\//, "http://"), {
      headers: { "User-Agent": USER_AGENT },
      redirect: "follow",
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    }).catch(() => null);

    if (response) {
      add({
        category: "TLS",
        severity: "HIGH",
        code: "tls-broken",
        title: "HTTPS fehlerhaft: Seite nur ueber HTTP erreichbar",
        description:
          "Das Zertifikat ist ungueltig, abgelaufen oder die HTTPS-Konfiguration ist kaputt. Browser zeigen Besuchern eine Warnseite.",
        snippet: tlsFailureMessage ? clip(tlsFailureMessage) : undefined,
      });
    }
  }

  const responseTimeMs = Math.round(performance.now() - startedAt);

  if (!response) {
    add({
      category: "BROKEN",
      severity: "CRITICAL",
      code: "unreachable",
      title: "Website nicht erreichbar",
      description: "Timeout oder Verbindungsfehler beim Laden der Seite.",
      snippet: tlsFailureMessage ? clip(tlsFailureMessage) : undefined,
    });
    return { url, issues, reachable: false, shouldScreenshot: true };
  }

  const finalUrl = response.url || url;
  const isHttps = finalUrl.startsWith("https://");
  const headers = response.headers;
  const html = (await response.text().catch(() => "")).slice(0, 2_000_000);

  if (response.status >= 400) {
    add({
      category: "BROKEN",
      severity: response.status >= 500 ? "CRITICAL" : "HIGH",
      code: `http-${response.status}`,
      title: `Server antwortet mit HTTP ${response.status}`,
      snippet: `HTTP/${response.status} ${response.statusText} - ${finalUrl}`,
    });
  }

  // --- Transport -------------------------------------------------------------
  if (!isHttps) {
    add({
      category: "TLS",
      severity: "HIGH",
      code: "no-https",
      title: "Keine HTTPS-Verschluesselung",
      description: "Daten (z. B. Kontaktformulare) werden unverschluesselt uebertragen, Browser markieren die Seite als nicht sicher.",
      snippet: finalUrl,
    });
  }

  // --- Security-Header ---------------------------------------------------------
  const csp = headers.get("content-security-policy");
  if (!csp) {
    add({
      category: "SECURITY",
      severity: "MEDIUM",
      code: "missing-csp",
      title: "Content-Security-Policy fehlt",
      description: "Ohne CSP ist die Seite anfaelliger fuer Cross-Site-Scripting (XSS).",
      snippet: "Header `Content-Security-Policy` nicht gesetzt",
    });
  }
  if (isHttps && !headers.get("strict-transport-security")) {
    add({
      category: "SECURITY",
      severity: "MEDIUM",
      code: "missing-hsts",
      title: "Strict-Transport-Security (HSTS) fehlt",
      description: "Erleichtert SSL-Stripping bzw. Man-in-the-Middle-Angriffe.",
      snippet: "Header `Strict-Transport-Security` nicht gesetzt",
    });
  }
  if (!headers.get("x-frame-options") && !(csp && /frame-ancestors/i.test(csp))) {
    add({
      category: "SECURITY",
      severity: "LOW",
      code: "missing-xfo",
      title: "Clickjacking-Schutz fehlt",
      description: "Weder `X-Frame-Options` noch CSP `frame-ancestors` gesetzt - die Seite kann in fremde iFrames eingebettet werden.",
    });
  }
  if (!headers.get("x-content-type-options")) {
    add({
      category: "SECURITY",
      severity: "LOW",
      code: "missing-xcto",
      title: "X-Content-Type-Options fehlt",
      snippet: "Header `X-Content-Type-Options: nosniff` nicht gesetzt",
    });
  }

  // --- Versions-Leaks / veralteter Server -------------------------------------
  const server = headers.get("server") ?? "";
  const poweredBy = headers.get("x-powered-by") ?? "";
  const leak = [server && `Server: ${server}`, poweredBy && `X-Powered-By: ${poweredBy}`]
    .filter((line): line is string => Boolean(line) && /\d+\.\d+/.test(line as string));
  if (leak.length > 0) {
    add({
      category: "SECURITY",
      severity: "LOW",
      code: "version-leak",
      title: "Server verraet Versionsnummern",
      description: "Exakte Versionen erlauben gezielte Suche nach bekannten Schwachstellen (CVEs).",
      snippet: leak.join("\n"),
    });
  }
  const php = poweredBy.match(/PHP\/(\d+)\.(\d+)/i);
  if (php && Number(php[1]) < 8) {
    add({
      category: "OUTDATED",
      severity: "HIGH",
      code: "old-php",
      title: `Veraltetes PHP ${php[1]}.${php[2]} (End of Life)`,
      description: "Diese PHP-Version bekommt keine Sicherheitsupdates mehr.",
      snippet: `X-Powered-By: ${poweredBy}`,
    });
  }

  // --- Fehlermeldungen im HTML (Debug / Stack Traces) --------------------------
  for (const { re, label } of ERROR_LEAK_PATTERNS) {
    const match = html.match(re);
    if (match) {
      const idx = match.index ?? 0;
      add({
        category: "SECURITY",
        severity: "HIGH",
        code: "error-disclosure",
        title: `Interne Fehlerdetails sichtbar: ${label}`,
        description: "Die Seite gibt Dateipfade, Datenbank- oder Debug-Informationen preis.",
        snippet: clip(html.slice(Math.max(0, idx - 60), idx + 260)),
      });
      break;
    }
  }

  // --- HTML-Analyse --------------------------------------------------------------
  const rawHtmlForSnippets = html;
  const $ = cheerio.load(html);

  if (isHttps) {
    const mixed = $("[src^='http://'], link[href^='http://'][rel='stylesheet']").first();
    if (mixed.length > 0) {
      add({
        category: "SECURITY",
        severity: "MEDIUM",
        code: "mixed-content",
        title: "Mixed Content: HTTP-Ressourcen auf HTTPS-Seite",
        description: "Unverschluesselt nachgeladene Inhalte werden vom Browser blockiert oder gelten als unsicher.",
        snippet: clip($.html(mixed) ?? ""),
      });
    }
  }

  if ($("meta[name='viewport']").length === 0) {
    add({
      category: "OUTDATED",
      severity: "MEDIUM",
      code: "no-viewport",
      title: "Nicht mobil-optimiert (Viewport-Meta fehlt)",
      description: "Auf Smartphones wird die Desktop-Ansicht verkleinert dargestellt - typisches Zeichen einer alten Website.",
      snippet: "<meta name=\"viewport\" ...> nicht gefunden",
    });
  }

  const oldTags = $("marquee, blink, center, font, frameset, frame").length;
  if (oldTags >= 3 || $("object[type*='flash'], embed[src*='.swf']").length > 0) {
    add({
      category: "OUTDATED",
      severity: "MEDIUM",
      code: "legacy-markup",
      title: "Veraltetes HTML (font/center/marquee/Flash)",
      description: "Deprecated Tags oder Flash weisen auf eine Website aus den 2000er-Jahren hin.",
      snippet: clip($("marquee, blink, center, font, frameset, frame, object, embed").first().toString()),
    });
  }

  const jq = rawHtmlForSnippets.match(/jquery[-.]?v?(\d+)\.(\d+)(?:\.(\d+))?(?:\.min)?\.js/i);
  if (jq && Number(jq[1]) < 3) {
    add({
      category: "OUTDATED",
      severity: "MEDIUM",
      code: "old-jquery",
      title: `Veraltetes jQuery ${jq[1]}.${jq[2]} mit bekannten Schwachstellen`,
      snippet: jq[0],
    });
  }

  const generator = $("meta[name='generator']").attr("content");
  if (generator) {
    const wp = generator.match(/WordPress (\d+)\.(\d+)/i);
    if (wp && Number(wp[1]) < 6) {
      add({
        category: "OUTDATED",
        severity: "MEDIUM",
        code: "old-wordpress",
        title: `Veraltetes WordPress ${wp[1]}.${wp[2]}`,
        snippet: `<meta name="generator" content="${generator}">`,
      });
    }
  }

  const currentYear = new Date().getFullYear();
  const footerText = $("footer").text() || $("body").text().slice(-1500);
  const years = [...footerText.matchAll(/(?:©|&copy;|copyright)[^0-9]{0,20}((?:19|20)\d{2})/gi)].map((m) => Number(m[1]));
  const latestYear = years.length > 0 ? Math.max(...years) : null;
  if (latestYear && latestYear <= currentYear - 3) {
    add({
      category: "OUTDATED",
      severity: "MEDIUM",
      code: "old-copyright",
      title: `Copyright-Jahr ${latestYear}: Seite wirkt ungepflegt`,
      snippet: clip(footerText.match(new RegExp(`.{0,40}${latestYear}.{0,40}`))?.[0] ?? String(latestYear), 120),
    });
  }

  // --- Performance / SEO / Rechtliches --------------------------------------------
  if (responseTimeMs > 4000) {
    add({
      category: "PERFORMANCE",
      severity: "MEDIUM",
      code: "slow-response",
      title: `Sehr langsame Antwortzeit (${(responseTimeMs / 1000).toFixed(1)} s)`,
    });
  } else if (responseTimeMs > 2000) {
    add({
      category: "PERFORMANCE",
      severity: "LOW",
      code: "slow-response",
      title: `Langsame Antwortzeit (${(responseTimeMs / 1000).toFixed(1)} s)`,
    });
  }

  if (!$("title").text().trim()) {
    add({ category: "SEO", severity: "LOW", code: "no-title", title: "Seitentitel (<title>) fehlt" });
  }
  if (!$("meta[name='description']").attr("content")?.trim()) {
    add({ category: "SEO", severity: "LOW", code: "no-meta-description", title: "Meta-Description fehlt" });
  }

  const linkHaystack = $("a")
    .map((_, el) => `${$(el).text()} ${$(el).attr("href") ?? ""}`)
    .get()
    .join(" ")
    .toLowerCase();
  if (!/impressum|imprint/.test(linkHaystack)) {
    add({
      category: "LEGAL",
      severity: "MEDIUM",
      code: "no-imprint",
      title: "Impressum nicht auffindbar",
      description: "In Oesterreich/DE Pflicht fuer geschaeftliche Websites - gutes Verkaufsargument.",
    });
  }
  if (!/datenschutz|privacy/.test(linkHaystack)) {
    add({
      category: "LEGAL",
      severity: "LOW",
      code: "no-privacy",
      title: "Datenschutzerklaerung nicht auffindbar",
    });
  }

  const shouldScreenshot = issues.some(
    (issue) =>
      (issue.category === "SECURITY" || issue.category === "OUTDATED" || issue.category === "BROKEN" || issue.category === "TLS") &&
      (issue.severity === "MEDIUM" || issue.severity === "HIGH" || issue.severity === "CRITICAL"),
  );

  return { url: finalUrl, issues, reachable: true, shouldScreenshot };
}

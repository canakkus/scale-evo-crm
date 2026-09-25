/**
 * ============================================================
 * LEAD-KOORDINATEN NACHRUESTEN  —  npm run leads:geocode
 * ============================================================
 * DIE EINZIGE STELLE IM PROJEKT, DIE GEOCODIERT.
 *
 * Es gibt bewusst keine Route, keinen Cron und kein Lazy-Geocoding beim
 * Rendern der Karte. Jeder dieser Wege wuerde bei jedem Kartenaufruf erneut
 * abrechnen — genau das Kostenleck-Muster, das bei den Instagram-Profildaten
 * schon einmal aufgefallen ist (siehe .claude/memory/learnings.md).
 *
 * Quellenkette pro Lead:
 *   1. Google Geocoding API   (eigenes Freikontingent 10k/Monat)
 *   2. Google Places Text Search (nur als Fallback fuer Nicht-Treffer; loest
 *      Faelle wie "SCS" oder "Hauptstr. 1" ohne Stadt)
 *
 * EIN-VERSUCH-GARANTIE
 * `geoAttemptedAt` wird bei JEDEM Versuch gesetzt, auch bei Fehlschlag.
 * `latitude: null` ist NIE der Merker dafuer, ob ein Lead schon gefragt wurde —
 * sonst fragt jeder weitere Lauf dieselben erfolglosen Adressen erneut an.
 * Nur `geoStatus = "error"` (Netz/429/Timeout) ist retry-faehig, und auch das
 * nur mit explizitem --retry-errors.
 *
 * Aufruf:
 *   npm run leads:geocode -- --dry-run              (kostet nichts, Empfehlung)
 *   npm run leads:geocode -- --max=50
 *   npm run leads:geocode -- --retry-errors --max=20
 * ============================================================
 */

import { PrismaClient, type Lead } from "@prisma/client";
import { isApproximate, isGeoPrecision, parseCoordinates, type GeoPrecision } from "../src/lib/geo";

const prisma = new PrismaClient();

/** Harte Obergrenze. Auch --max=9999 kommt hier nicht vorbei. */
const HARD_MAX = 200;
/** Pause zwischen zwei Abfragen — sequenziell, nie parallel. */
const PAUSE_MS = 50;
const REQUEST_TIMEOUT_MS = 10_000;

const GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json";
const PLACES_URL = "https://places.googleapis.com/v1/places:searchText";
const PLACES_FIELD_MASK = "places.location,places.formattedAddress";

type Options = {
  dryRun: boolean;
  max: number;
  retryErrors: boolean;
};

type GeoOutcome =
  | {
      kind: "ok";
      latitude: number;
      longitude: number;
      precision: GeoPrecision;
      via: "geocode" | "places";
      /** Nur zur Protokollierung: was Google tatsaechlich getroffen hat. */
      matchedAddress?: string | null;
    }
  | { kind: "no_result" }
  | { kind: "error"; reason: string };

/** Gesonderter Abbruchgrund: die API-Aktivierung fehlt, jeder weitere Call ist sinnlos. */
class FatalGeocodingError extends Error {}

/**
 * Die Geocoding API ist im Google-Projekt nicht aktiviert, der Key selbst aber
 * gueltig (Places laeuft, siehe Lead Scout). Kein Abbruch: der Lauf wechselt
 * fuer den Rest auf Places Text Search.
 */
class GeocodingUnavailableError extends Error {}

/** Nur die Felder, die dieses Skript wirklich liest. */
type GeocodeResponse = {
  status?: string;
  error_message?: string;
  results?: Array<{
    partial_match?: boolean;
    geometry?: {
      location_type?: string;
      location?: { lat?: number; lng?: number };
    };
  }>;
};

type PlacesResponse = {
  places?: Array<{
    location?: { latitude?: number; longitude?: number };
    /** Wird nicht bewertet, nur protokolliert — siehe placesLookup(). */
    formattedAddress?: string;
  }>;
};

// ---------------------------------------------------------------------------
// Argumente
// ---------------------------------------------------------------------------

function parseArgs(argv: string[]): Options {
  const dryRun = argv.includes("--dry-run");
  const retryErrors = argv.includes("--retry-errors");

  const maxArg = argv.find((a) => a.startsWith("--max="));
  const requested = maxArg ? Number.parseInt(maxArg.slice("--max=".length), 10) : HARD_MAX;
  const max = Number.isFinite(requested) && requested > 0 ? Math.min(requested, HARD_MAX) : HARD_MAX;

  return { dryRun, max, retryErrors };
}

// ---------------------------------------------------------------------------
// Adresse
// ---------------------------------------------------------------------------

/**
 * Baut die Suchzeile. Firmenname bleibt bewusst draussen, wenn eine Strasse
 * vorhanden ist: "Salon Maria, Mariahilfer Str. 1, Wien" laesst Google oft auf
 * den Betrieb statt auf die Adresse zielen und liefert dann gar nichts.
 */
function buildQuery(lead: Pick<Lead, "companyName" | "address" | "city">): string | null {
  const address = lead.address?.trim() || "";
  const city = lead.city?.trim() || "";

  if (address) {
    return joinQuery([address, city, "Österreich"]);
  }
  if (city) {
    return joinQuery([lead.companyName.trim(), city, "Österreich"]);
  }
  return null;
}

/** Fallback-Zeile fuer Places: dort hilft der Firmenname sehr wohl. */
function buildPlacesQuery(lead: Pick<Lead, "companyName" | "address" | "city">): string {
  return (
    joinQuery([lead.companyName.trim(), lead.address?.trim(), lead.city?.trim()]) ?? lead.companyName.trim()
  );
}

/**
 * Viele Adressen im Bestand enden auf ein Komma ("Viktor-Adler-Platz 9,").
 * Zusammengesetzt ergaebe das "…9,, 1100 Wien" — doppelte Trenner senken die
 * Trefferquote bei Google messbar.
 */
function joinQuery(parts: Array<string | null | undefined>): string | null {
  const cleaned = parts
    .filter((part): part is string => Boolean(part && part.trim()))
    .join(", ")
    .replace(/\s*,\s*/g, ", ")
    .replace(/(,\s*)+/g, ", ")
    .replace(/\s+/g, " ")
    .replace(/^[\s,]+|[\s,]+$/g, "");
  return cleaned || null;
}

// ---------------------------------------------------------------------------
// Google Geocoding (Stufe 1)
// ---------------------------------------------------------------------------

async function geocode(query: string, apiKey: string): Promise<GeoOutcome> {
  const url = new URL(GEOCODE_URL);
  url.searchParams.set("address", query);
  url.searchParams.set("key", apiKey);
  url.searchParams.set("language", "de");
  url.searchParams.set("region", process.env.GOOGLE_PLACES_REGION?.trim() || "AT");

  let payload: GeocodeResponse;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    // 5xx/Netzfehler sind vorruebergehend -> "error" (retry-faehig).
    if (!response.ok) return { kind: "error", reason: `HTTP ${response.status}` };
    payload = await response.json();
  } catch (err) {
    return { kind: "error", reason: err instanceof Error ? err.message : "Netzwerkfehler" };
  }

  const status = String(payload?.status ?? "");

  // Fehlende API-Aktivierung/Abrechnung: 132x wiederholen hilft nicht.
  if (status === "REQUEST_DENIED") {
    if (/not activated/i.test(payload?.error_message ?? "")) {
      throw new GeocodingUnavailableError(payload?.error_message ?? "Geocoding API nicht aktiviert");
    }
    throw new FatalGeocodingError(
      `Google lehnt die Anfrage ab (REQUEST_DENIED): ${payload?.error_message ?? "kein Grund genannt"}\n` +
        `   -> Die "Geocoding API" ist im Google-Cloud-Projekt des GOOGLE_PLACES_API_KEY vermutlich nicht aktiviert,\n` +
        `      oder der Key ist per Referrer/IP-Restriktion fuer Serveraufrufe gesperrt.\n` +
        `      Aktivieren unter: APIs & Services -> Library -> "Geocoding API".`,
    );
  }
  if (status === "OVER_QUERY_LIMIT") {
    return { kind: "error", reason: "OVER_QUERY_LIMIT (Kontingent/Rate erschoepft)" };
  }
  if (status === "UNKNOWN_ERROR") {
    return { kind: "error", reason: "UNKNOWN_ERROR (Google-seitig, spaeter erneut)" };
  }
  if (status === "ZERO_RESULTS") {
    return { kind: "no_result" };
  }
  if (status !== "OK") {
    return { kind: "error", reason: `Unerwarteter Status ${status || "(leer)"}` };
  }

  const best = payload.results?.[0] ?? null;
  const coords = parseCoordinates(best?.geometry?.location?.lat, best?.geometry?.location?.lng);
  if (!best || !coords) return { kind: "no_result" };

  const rawType = best.geometry?.location_type;
  // `partial_match` heisst: Google hat geraten. Das darf nie als exakte Lage
  // durchgehen, egal was location_type behauptet.
  const precision: GeoPrecision =
    best.partial_match === true ? "APPROXIMATE" : isGeoPrecision(rawType) ? rawType : "APPROXIMATE";

  return { kind: "ok", latitude: coords.latitude, longitude: coords.longitude, precision, via: "geocode" };
}

// ---------------------------------------------------------------------------
// Places Text Search (Stufe 2, nur bei ZERO_RESULTS)
// ---------------------------------------------------------------------------

async function placesLookup(query: string, apiKey: string): Promise<GeoOutcome> {
  let payload: PlacesResponse;
  try {
    const response = await fetch(PLACES_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": PLACES_FIELD_MASK,
      },
      body: JSON.stringify({
        textQuery: query,
        languageCode: "de",
        regionCode: process.env.GOOGLE_PLACES_REGION?.trim() || "AT",
        maxResultCount: 1,
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (response.status === 403) {
      throw new FatalGeocodingError(
        "Google lehnt die Places-Anfrage ab (HTTP 403). Der GOOGLE_PLACES_API_KEY ist fuer Places Text Search gesperrt.",
      );
    }
    if (!response.ok) return { kind: "error", reason: `Places HTTP ${response.status}` };
    payload = await response.json();
  } catch (err) {
    if (err instanceof FatalGeocodingError) throw err;
    return { kind: "error", reason: err instanceof Error ? err.message : "Netzwerkfehler" };
  }

  const place = payload.places?.[0] ?? null;
  const coords = parseCoordinates(place?.location?.latitude, place?.location?.longitude);
  if (!coords) return { kind: "no_result" };

  /*
   * Bewusst IMMER `GEOMETRIC_CENTER`, nie `ROOFTOP`.
   *
   * Diese Stufe laeuft nach einem ZERO_RESULTS des Geocoders — also bei den
   * Adressen, die Google NICHT aufloesen konnte — oder, wenn die Geocoding API
   * im Projekt nicht aktiviert ist, als einzige Quelle. Was hier
   * zurueckkommt, ist der Top-Treffer einer Volltextsuche ueber Firmenname plus
   * eine bereits als unbrauchbar erwiesene Adresse. Das als exakteste
   * Genauigkeitsklasse zu speichern hiesse: voll gefuellter Pin, keine
   * gestrichelte Kontur, keine "Ungefaehre Lage"-Zeile, und die Route-Taste
   * navigiert auf fuenf Nachkommastellen an einen geratenen Ort.
   *
   * Die Alternative — `formattedAddress` gegen `lead.address` matchen und bei
   * "belastbarer Uebereinstimmung" ROOFTOP vergeben — waere wieder eine
   * Fuzzy-Matching-Heuristik auf kurzen, schmutzigen Strings. Genau diese
   * Fehlerklasse ist in learnings.md zweimal hintereinander schiefgegangen.
   * `GEOMETRIC_CENTER` faellt ueber isApproximate() auf den gestrichelten Pin
   * zurueck: die Position ist brauchbar zum Finden, gibt sich aber nicht als
   * Hausnummer aus.
   *
   * `formattedAddress` wird trotzdem abgefragt — aber nur, um im Protokoll
   * sichtbar zu machen, WAS Places getroffen hat. So faellt Unsinn beim Lesen
   * des Laufs auf, statt still in der Datenbank zu landen.
   */
  return {
    kind: "ok",
    latitude: coords.latitude,
    longitude: coords.longitude,
    precision: "GEOMETRIC_CENTER",
    via: "places",
    matchedAddress: place?.formattedAddress?.trim() || null,
  };
}

// ---------------------------------------------------------------------------
// Hauptlauf
// ---------------------------------------------------------------------------

async function main() {
  const options = parseArgs(process.argv.slice(2));

  // Ohne diese Zeile weiss niemand, gegen welche Datenbank gerade geschrieben
  // wird — lokaler Docker-Container und Supabase-Produktion sehen im Terminal
  // identisch aus.
  const dbUrl = process.env.DATABASE_URL ?? "(nicht gesetzt)";
  console.log("────────────────────────────────────────────────────────");
  console.log("Lead-Koordinaten nachruesten");
  console.log(`  DATABASE_URL : ${dbUrl.replace(/:\/\/[^@]*@/, "://***@")}`);
  console.log(`  Modus        : ${options.dryRun ? "DRY-RUN (kein API-Call, keine Schreibvorgaenge)" : "ECHTLAUF"}`);
  console.log(`  Obergrenze   : ${options.max} (hart gedeckelt auf ${HARD_MAX})`);
  console.log(`  Fehler-Retry : ${options.retryErrors ? "ja (geoStatus=error wird erneut versucht)" : "nein"}`);
  console.log("────────────────────────────────────────────────────────");

  const apiKey = process.env.GOOGLE_PLACES_API_KEY?.trim();
  if (!apiKey && !options.dryRun) {
    console.error("✖ GOOGLE_PLACES_API_KEY fehlt. Ohne Key kann nicht geocodiert werden.");
    process.exitCode = 1;
    return;
  }

  // Ein-Versuch-Garantie: Auswahl ueber geoAttemptedAt, NICHT ueber latitude.
  const retryable = options.retryErrors ? [{ geoStatus: "error" as const }] : [];
  const candidates = await prisma.lead.findMany({
    where: {
      latitude: null,
      OR: [{ geoAttemptedAt: null }, ...retryable],
    },
    select: { id: true, companyName: true, address: true, city: true, geoStatus: true },
    orderBy: { createdAt: "asc" },
    take: options.max,
  });

  const [totalLeads, alreadyLocated, attemptedWithoutResult] = await Promise.all([
    prisma.lead.count(),
    prisma.lead.count({ where: { latitude: { not: null } } }),
    prisma.lead.count({ where: { latitude: null, geoAttemptedAt: { not: null } } }),
  ]);

  console.log(`Leads gesamt            : ${totalLeads}`);
  console.log(`davon bereits verortet  : ${alreadyLocated}`);
  console.log(`bereits erfolglos gefragt: ${attemptedWithoutResult} (werden uebersprungen)`);
  console.log(`jetzt zu bearbeiten     : ${candidates.length}`);
  console.log("");

  if (candidates.length === 0) {
    console.log("Nichts zu tun.");
    return;
  }

  const tally = { ok: 0, approximate: 0, no_result: 0, no_address: 0, error: 0, viaPlaces: 0 };
  // Faellt beim ersten "not activated" auf false und bleibt dort — sonst kostet
  // jeder weitere Lead einen sinnlosen Geocoding-Call.
  let geocodeAvailable = true;

  for (const [index, lead] of candidates.entries()) {
    const position = `[${String(index + 1).padStart(3, " ")}/${candidates.length}]`;
    const label = lead.companyName.slice(0, 44);
    const query = buildQuery(lead);

    // Kein Adressmaterial -> gar nicht erst fragen, aber trotzdem als versucht
    // markieren, damit der naechste Lauf ihn nicht wieder aufgreift.
    if (!query) {
      tally.no_address++;
      console.log(`${position} ⊘ ${label} — keine Adresse`);
      if (!options.dryRun) {
        await prisma.lead.update({
          where: { id: lead.id },
          data: { geoAttemptedAt: new Date(), geoStatus: "no_address" },
        });
      }
      continue;
    }

    if (options.dryRun) {
      console.log(`${position} · ${label} — wuerde abfragen: "${query}"`);
      continue;
    }

    let outcome: GeoOutcome;
    try {
      outcome = { kind: "no_result" };
      if (geocodeAvailable) {
        try {
          outcome = await geocode(query, apiKey!);
        } catch (err) {
          if (!(err instanceof GeocodingUnavailableError)) throw err;
          geocodeAvailable = false;
          console.warn("");
          console.warn("⚠ Geocoding API im Google-Projekt nicht aktiviert — weiter nur ueber Places Text Search.");
          console.warn("  Alle Pins aus diesem Lauf gelten als ungefaehr (gestrichelt).");
          console.warn("");
        }
      }
      if (outcome.kind === "no_result") {
        // Nur hier lohnt Places: Geocoding kennt die Adresse nicht, der Betrieb
        // existiert aber vielleicht als Ort ("SCS", "Naschmarkt Stand 12").
        outcome = await placesLookup(buildPlacesQuery(lead), apiKey!);
      }
    } catch (err) {
      if (err instanceof FatalGeocodingError) {
        console.error("");
        console.error("✖ ABBRUCH — Google verweigert die Abfrage dauerhaft:");
        console.error(`   ${err.message}`);
        console.error("");
        console.error(`   Bis hierhin verarbeitet: ${index} von ${candidates.length}.`);
        console.error("   Die restlichen Leads bleiben unangetastet und koennen nach der");
        console.error("   Freischaltung erneut gestartet werden.");
        process.exitCode = 1;
        return;
      }
      throw err;
    }

    // Ein-Versuch-Garantie: geoAttemptedAt wird in JEDEM der drei Zweige gesetzt.
    const attemptedAt = new Date();

    if (outcome.kind === "ok") {
      // Dieselbe Regel wie die Karte — keine zweite Definition von "ungenau".
      const approximate = isApproximate(outcome.precision);
      tally.ok++;
      if (approximate) tally.approximate++;
      if (outcome.via === "places") tally.viaPlaces++;
      await prisma.lead.update({
        where: { id: lead.id },
        data: {
          latitude: outcome.latitude,
          longitude: outcome.longitude,
          geoSource: "geocode",
          geoPrecision: outcome.precision,
          geoAttemptedAt: attemptedAt,
          geoStatus: "ok",
        },
      });
      console.log(
        `${position} ✔ ${label} — ${outcome.latitude.toFixed(5)}, ${outcome.longitude.toFixed(5)} ` +
          `(${outcome.precision}${outcome.via === "places" ? ", via Places" : ""})` +
          // Beim Places-Fallback ist die Adresse geraten: sichtbar machen, was
          // getroffen wurde, damit Unsinn beim Lesen des Laufs auffaellt.
          (outcome.via === "places" ? `\n           Places traf: ${outcome.matchedAddress ?? "(keine Adresse geliefert)"}` : ""),
      );
    } else if (outcome.kind === "no_result") {
      tally.no_result++;
      await prisma.lead.update({
        where: { id: lead.id },
        data: { geoAttemptedAt: attemptedAt, geoStatus: "no_result" },
      });
      console.log(`${position} ✖ ${label} — nicht gefunden ("${query}")`);
    } else {
      tally.error++;
      await prisma.lead.update({
        where: { id: lead.id },
        data: { geoAttemptedAt: attemptedAt, geoStatus: "error" },
      });
      console.log(`${position} ! ${label} — Fehler: ${outcome.reason} (mit --retry-errors erneut versuchbar)`);
    }

    await sleep(PAUSE_MS);
  }

  console.log("");
  console.log("────────────────────────────────────────────────────────");
  if (options.dryRun) {
    console.log(`DRY-RUN beendet. ${candidates.length} Leads waeren abgefragt worden, davon`);
    console.log(`${tally.no_address} ohne jede Adresse (kein API-Call noetig). Es wurde nichts geschrieben.`);
  } else {
    console.log(`verortet        : ${tally.ok} (davon ${tally.approximate} nur ungefaehr, ${tally.viaPlaces} via Places-Fallback)`);
    console.log(`nicht gefunden  : ${tally.no_result}`);
    console.log(`ohne Adresse    : ${tally.no_address}`);
    console.log(`Fehler          : ${tally.error}`);
  }
  console.log("────────────────────────────────────────────────────────");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main()
  .catch((err) => {
    console.error("✖ Unerwarteter Fehler:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { LeadStatus } from "@prisma/client";
import { AlertTriangle, AtSign, History, Loader2, MapPin, Navigation, Radar, Settings } from "lucide-react";
import { cn, timeAgo } from "@/lib/utils";
import { useUserLocation } from "@/lib/location-context";
import {
  SCOUT_LIMITS,
  instagramStateOf,
  type LeadScoutResponse,
  type ScoutBudget,
  type ScoutFunnel as ScoutFunnelData,
  type ScoutRadiusKm,
  type ScoutResult,
} from "@/lib/lead-scout-types";
import { radiusAvailability } from "@/lib/scout-radius";
import { InstagramResults } from "./instagram-results";
import { ScoutFunnel } from "./scout-funnel";
import { ScoutResultCard } from "./scout-result-card";
import { Segment, ToggleChip } from "./scout-ui";

const TREATWELL_CATEGORIES = ["Barber", "Friseur", "Spa & Wellness", "Nagelstudio", "Kosmetik", "Massage", "Wimpern"];

const CITIES = [
  "Wien", "Graz", "Linz", "Salzburg", "Innsbruck", "Klagenfurt", "Villach", "Wels", "St. Pölten", "Dornbirn",
  "Berlin", "München", "Hamburg", "Köln", "Frankfurt", "Stuttgart", "Düsseldorf", "Leipzig",
  "Zürich", "Genf", "Basel", "Bern",
];

const CATEGORIES = [
  { label: "Alle Kategorien (Beauty & Gastro)", slug: "Alle" },
  { label: "Barber", slug: "Barber" },
  { label: "Friseur", slug: "Friseur" },
  { label: "Spa & Wellness", slug: "Spa & Wellness" },
  { label: "Nagelstudio", slug: "Nagelstudio" },
  { label: "Kosmetik", slug: "Kosmetik" },
  { label: "Massage", slug: "Massage" },
  { label: "Wimpern", slug: "Wimpern" },
  { label: "Restaurant", slug: "Restaurant" },
  { label: "Pizzeria", slug: "Pizzeria" },
  { label: "Café & Bar", slug: "Café & Bar" },
  { label: "Imbiss", slug: "Imbiss" },
  { label: "Gastronomie", slug: "Gastronomie" },
];

export type ScoutTab = "standard" | "instagram";
type TriFilter = "all" | "yes" | "no";
type RadiusChoice = "city" | "3" | "5";

type SessionSummary = {
  id: string;
  name: string | null;
  searchQuery: string;
  city: string | null;
  resultCount: number;
  createdAt: string;
};

type StoredFilters = {
  funnel?: ScoutFunnelData;
  budget?: ScoutBudget;
  notices?: string[];
  sourceUrl?: string;
} | null;

type IgPresets = { noWebsite: boolean; withInstagram: boolean; hideChains: boolean; onlyNew: boolean };

const INPUT_STYLE = { background: "var(--surface-2)", borderColor: "var(--border)", color: "var(--text)" };

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

/** Zaehler am IG-Reiter: Treffer mit Handle oder Kandidaten. */
function instagramHits(response: LeadScoutResponse | null): number | null {
  if (!response) return null;
  return response.results.filter((result) => {
    const state = instagramStateOf(result.instagramProfile);
    return state === "found" || state === "choose";
  }).length;
}

export function LeadScoutComponent({ initialTab = "standard" }: { initialTab?: ScoutTab }) {
  const {
    mode: locationMode,
    coords: locationCoords,
    label: locationLabel,
    address: locationAddress,
    fixedAddress,
    loadingGps,
    requestLiveLocation,
    useFixedLocation,
  } = useUserLocation();

  const [tab, setTab] = useState<ScoutTab>(initialTab);

  const [category, setCategory] = useState("Barber");
  const [city, setCity] = useState("Wien");
  // Treatwell nur fuer die Beauty-Nischen, die es dort gibt. Freie Eingaben
  // ("Shisha Bar") und Gastro laufen ueber Places.
  const isTreatwell = TREATWELL_CATEGORIES.includes(category);
  const source = isTreatwell ? "treatwell" : "places";

  const [minRating, setMinRating] = useState("4.0");
  const [minReviews, setMinReviews] = useState("10");
  const [maxResults, setMaxResults] = useState("10");
  const [radius, setRadius] = useState<RadiusChoice>("city");

  // Standard-Filter
  const [sortBy, setSortBy] = useState<"rating" | "distance">("rating");
  const [hasWebsiteFilter, setHasWebsiteFilter] = useState<TriFilter>("all");
  const [hasTreatwellFilter, setHasTreatwellFilter] = useState<TriFilter>("all");
  const [hasPhoneFilter, setHasPhoneFilter] = useState<TriFilter>("all");
  const [hasInstagramFilter, setHasInstagramFilter] = useState<TriFilter>("all");
  const [hideChainsStandard, setHideChainsStandard] = useState(false);

  // Instagram-Presets
  const [presets, setPresets] = useState<IgPresets>({ noWebsite: true, withInstagram: true, hideChains: true, onlyNew: true });
  const togglePreset = (key: keyof IgPresets) => setPresets((previous) => ({ ...previous, [key]: !previous[key] }));

  // Jeder Reiter hat seine eigene Antwort — ein Reiterwechsel sucht nie.
  const [responses, setResponses] = useState<Record<ScoutTab, LeadScoutResponse | null>>({ standard: null, instagram: null });
  const [versions, setVersions] = useState<Record<ScoutTab, number>>({ standard: 0, instagram: 0 });
  const [errors, setErrors] = useState<Record<ScoutTab, string | null>>({ standard: null, instagram: null });
  const [loading, setLoading] = useState(false);
  // Laeuft im IG-Reiter eine Aktion (Anlegen, Vorschau, bezahlte Pruefung),
  // sind Reiterwechsel, neue Suche und Session-Laden gesperrt.
  const [igLocked, setIgLocked] = useState(false);
  const locked = loading || igLocked;
  const LOCK_TITLE = "Bitte warten, bis die laufende Aktion im Instagram-Reiter fertig ist.";

  const [addingId, setAddingId] = useState<string | null>(null);
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());

  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);

  const response = responses[tab];
  const error = errors[tab];

  const availability = radiusAvailability({ mode: locationMode, address: locationAddress, coords: locationCoords, city });
  const radiusKm: ScoutRadiusKm | null = radius === "city" ? null : (Number(radius) as ScoutRadiusKm);
  const effectiveRadius = radiusKm && availability.hasLocation && availability.appliesToCity ? radiusKm : null;

  const setResponseFor = (target: ScoutTab, next: LeadScoutResponse) => {
    setResponses((previous) => ({ ...previous, [target]: next }));
    setVersions((previous) => ({ ...previous, [target]: previous[target] + 1 }));
  };
  const setErrorFor = (target: ScoutTab, message: string | null) => setErrors((previous) => ({ ...previous, [target]: message }));

  const switchTab = (next: ScoutTab) => {
    if (igLocked && next !== tab) return;
    setTab(next);
    const url = new URL(window.location.href);
    if (next === "instagram") url.searchParams.set("tab", "instagram");
    else url.searchParams.delete("tab");
    window.history.replaceState(window.history.state, "", url);
  };

  const refreshSessions = useCallback(async () => {
    try {
      const res = await fetch("/api/scout/sessions");
      if (!res.ok) return;
      const data = (await res.json()) as { sessions?: SessionSummary[] };
      setSessions(data.sessions ?? []);
    } catch (err) {
      console.error(err);
    }
  }, []);

  useEffect(() => {
    let active = true;
    fetch("/api/scout/sessions")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { sessions?: SessionSummary[] } | null) => {
        if (active && data) setSessions(data.sessions ?? []);
      })
      .catch((err) => console.error(err));
    return () => {
      active = false;
    };
  }, []);

  const loadSession = async (sessionId: string) => {
    if (locked) return;
    const target = tab;
    setLoading(true);
    setErrorFor(target, null);
    setSelectedSessionId(sessionId);

    try {
      const res = await fetch(`/api/scout/sessions?id=${encodeURIComponent(sessionId)}`);
      const data = (await res.json()) as {
        session?: { id: string; filters: StoredFilters };
        results?: ScoutResult[];
        notice?: string | null;
        error?: string;
      };
      if (!res.ok || !data.session) throw new Error(data.error ?? "Session konnte nicht geladen werden.");

      const filters = data.session.filters;
      const results = data.results ?? [];
      setAddedIds(new Set());
      setResponseFor(target, {
        sessionId: data.session.id,
        sourceUrl: filters?.sourceUrl ?? "",
        totalFound: filters?.funnel?.found ?? results.length,
        results,
        funnel: filters?.funnel,
        budget: filters?.budget,
        notices: [...(filters?.notices ?? []), ...(data.notice ? [data.notice] : [])],
        placesConfigured: true,
      });
    } catch (err) {
      setErrorFor(target, errorMessage(err, "Fehler beim Laden der Session."));
    } finally {
      setLoading(false);
    }
  };

  const runScout = async () => {
    if (locked) return;
    const target = tab;
    setLoading(true);
    setErrorFor(target, null);
    setSelectedSessionId(null);
    if (target === "standard") setAddedIds(new Set());

    const common = {
      category,
      city,
      minRating: Number(minRating),
      minReviews: Number(minReviews),
      maxResults: Number(maxResults),
      source,
      baseLat: locationCoords?.lat ?? null,
      baseLng: locationCoords?.lng ?? null,
      radiusKm: effectiveRadius,
    };
    const filters =
      target === "instagram"
        ? {
            sortBy: "rating",
            hasWebsiteFilter: presets.noWebsite ? "no" : "all",
            hasInstagramFilter: presets.withInstagram ? "yes" : "all",
            hasTreatwellFilter: "all",
            hasPhoneFilter: "all",
            hideChains: presets.hideChains,
            onlyNew: presets.onlyNew,
          }
        : {
            sortBy,
            hasWebsiteFilter,
            hasTreatwellFilter,
            hasPhoneFilter,
            hasInstagramFilter,
            hideChains: hideChainsStandard,
            onlyNew: false,
          };

    try {
      const res = await fetch("/api/lead-scout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...common, ...filters }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Lead-Scout fehlgeschlagen.");
      setResponseFor(target, data as LeadScoutResponse);
      void refreshSessions();
    } catch (err) {
      setErrorFor(target, errorMessage(err, "Lead-Scout fehlgeschlagen."));
    } finally {
      setLoading(false);
    }
  };

  const addLead = async (
    result: ScoutResult,
    customStatus: LeadStatus,
    acquisitionType: "CALL" | "WALK_IN",
    nfcDemoUrl?: string,
  ) => {
    setAddingId(result.venue.key);
    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...result.leadDraft,
          status: customStatus,
          acquisitionType,
          nfcDemoUrl: nfcDemoUrl || result.leadDraft.nfcDemoUrl || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Lead konnte nicht angelegt werden.");
      setAddedIds((ids) => new Set(ids).add(result.venue.key));
    } catch (err) {
      setErrorFor("standard", errorMessage(err, "Lead konnte nicht angelegt werden."));
    } finally {
      setAddingId(null);
    }
  };

  const notices = response ? [response.treatsWellError, ...(response.notices ?? [])].filter((notice): notice is string => Boolean(notice)) : [];
  const standardCount = responses.standard?.results.length ?? null;
  const instagramCount = instagramHits(responses.instagram);

  const tabs: Array<{ key: ScoutTab; label: string; icon: React.ReactNode; count: number | null }> = [
    { key: "standard", label: "Standard", icon: <Radar className="w-4 h-4" />, count: standardCount },
    { key: "instagram", label: "Instagram", icon: <AtSign className="w-4 h-4" />, count: instagramCount },
  ];

  return (
    <div className="space-y-6">
      {/* ---- Reiter-Umschalter (Pipeline-Switcher-Stil) ---- */}
      <div
        role="tablist"
        aria-label="Scout-Modus"
        className="inline-flex max-w-fit rounded-xl border p-1 shadow-inner"
        style={{ background: "var(--surface-2)", borderColor: "var(--border)" }}
      >
        {tabs.map((entry) => {
          const active = tab === entry.key;
          return (
            <button
              key={entry.key}
              type="button"
              role="tab"
              id={`scout-tab-${entry.key}`}
              aria-selected={active}
              aria-controls="scout-tab-panel"
              onClick={() => switchTab(entry.key)}
              disabled={igLocked && !active}
              title={igLocked && !active ? LOCK_TITLE : undefined}
              className={`flex items-center gap-2 rounded-lg px-4 text-xs font-bold transition-all disabled:cursor-not-allowed disabled:opacity-40 ${active ? "shadow-md" : "opacity-75 hover:opacity-100"}`}
              style={{
                minHeight: 44,
                background: active ? "var(--accent)" : "transparent",
                color: active ? "var(--bg)" : "var(--text-2)",
              }}
            >
              {entry.icon}
              <span>{entry.label}</span>
              {entry.count !== null && (
                <span
                  className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                  style={{
                    background: active ? "rgba(0,0,0,0.2)" : "var(--surface-3)",
                    color: active ? "var(--bg)" : "var(--text-3)",
                  }}
                >
                  {entry.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div id="scout-tab-panel" role="tabpanel" aria-labelledby={`scout-tab-${tab}`} className="space-y-6">
        {/* ---- Suchkarte ---- */}
        <div className="rounded-xl border p-6 space-y-6" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
          <div className="flex items-center justify-between">
            <h2 className="font-heading text-lg font-bold flex items-center gap-2" style={{ color: "var(--text)" }}>
              {tab === "instagram" ? (
                <AtSign className="w-5 h-5" style={{ color: "var(--accent)" }} />
              ) : (
                <Radar className="w-5 h-5" style={{ color: "var(--accent)" }} />
              )}
              {tab === "instagram" ? "Instagram-Kandidaten suchen" : "Neuen Scout-Durchlauf starten"}
            </h2>
            {sessions.length > 0 && (
              <span className="text-xs" style={{ color: "var(--text-3)" }}>
                {sessions.length} gespeicherte Sessions
              </span>
            )}
          </div>

          {/* ---- Standort + Umkreis ---- */}
          <div className="space-y-1.5">
            <div
              className="rounded-lg p-3 border flex flex-col lg:flex-row lg:items-center justify-between gap-3 text-xs"
              style={{ background: "var(--surface-2)", borderColor: "var(--border)" }}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className={`w-2 h-2 rounded-full shrink-0 ${
                    locationMode === "live" ? "bg-sky-400 animate-ping" : locationMode === "fixed" ? "bg-emerald-400" : "bg-amber-400"
                  }`}
                />
                <span className="font-medium text-[var(--text-3)] shrink-0">
                  {effectiveRadius ? "Suchmittelpunkt:" : "Distanz-Ausgangspunkt:"}
                </span>
                <span className="font-bold truncate text-[var(--text)]" title={locationLabel}>
                  {locationLabel}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={requestLiveLocation}
                  disabled={loadingGps}
                  title="Live-GPS-Standort abfragen"
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold border transition-all cursor-pointer ${
                    locationMode === "live"
                      ? "bg-sky-500/20 text-sky-400 border-sky-500/30 font-bold"
                      : "bg-[var(--surface)] text-[var(--text-2)] border-[var(--border)] hover:text-[var(--text)]"
                  }`}
                >
                  {loadingGps ? <Loader2 className="w-3 h-3 animate-spin" /> : <Navigation className="w-3 h-3" />}
                  <span>Live-GPS</span>
                </button>

                {fixedAddress && (
                  <button
                    type="button"
                    onClick={useFixedLocation}
                    title={`Fixen Standort (${fixedAddress}) nutzen`}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold border transition-all cursor-pointer ${
                      locationMode === "fixed"
                        ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30 font-bold"
                        : "bg-[var(--surface)] text-[var(--text-2)] border-[var(--border)] hover:text-[var(--text)]"
                    }`}
                  >
                    <MapPin className="w-3 h-3" />
                    <span>Fixe Adresse</span>
                  </button>
                )}

                <span aria-hidden className="mx-1 h-6 w-px" style={{ background: "var(--border)" }} />

                <Segment<RadiusChoice>
                  ariaLabel="Suchgebiet"
                  value={radius}
                  onChange={setRadius}
                  options={[
                    { value: "city", label: "Stadtweit" },
                    ...(["3", "5"] as const).map((km) => ({
                      value: km,
                      label: `${km} km`,
                      disabled: !availability.hasLocation,
                      title: availability.hasLocation ? `Umkreis ${km} km um den Standort` : "Kein Standort — Live-GPS oder fixe Adresse wählen",
                    })),
                  ]}
                />

                <Link
                  href="/settings"
                  title="Standort in den Einstellungen ändern"
                  className="flex items-center justify-center rounded-md text-[var(--text-3)] hover:text-[var(--text)] transition-colors hover:bg-[var(--surface)]"
                  style={{ minWidth: 44, minHeight: 44 }}
                >
                  <Settings className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
            {radiusKm && availability.hasLocation && !availability.appliesToCity && (
              <p className="text-[11px]" style={{ color: "var(--status-planned-tx)" }}>
                Umkreis gilt nur rund um deinen Standort — für „{city}“ wird stadtweit gesucht.
              </p>
            )}
            {radiusKm && !availability.hasLocation && (
              <p className="text-[11px]" style={{ color: "var(--status-planned-tx)" }}>
                Kein Standort — Live-GPS oder fixe Adresse wählen. Bis dahin wird stadtweit gesucht.
              </p>
            )}
          </div>

          {/* ---- Obere Felder (beide Reiter identisch) ---- */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <div>
              <label htmlFor="scout-category" className="block text-xs font-medium mb-1" style={{ color: "var(--text-2)" }}>Nische / Kategorie</label>
              {/* Freitext mit Vorschlaegen: eigene Nischen ("Shisha Bar") laufen
                  als ungetypte Places-Suche (categorySearchesFor). */}
              <input
                id="scout-category"
                type="text"
                list="scout-category-list"
                className="w-full rounded-md px-3 py-2 text-sm border outline-none"
                style={INPUT_STYLE}
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="z. B. Barber, Shisha Bar"
              />
              <datalist id="scout-category-list">
                {CATEGORIES.map((item) => (
                  <option key={item.slug} value={item.slug}>{item.label}</option>
                ))}
              </datalist>
            </div>

            <div>
              <label htmlFor="scout-city" className="block text-xs font-medium mb-1" style={{ color: "var(--text-2)" }}>Stadt</label>
              <input
                id="scout-city"
                type="text"
                className="w-full rounded-md px-3 py-2 text-sm border outline-none"
                style={INPUT_STYLE}
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="z. B. Wien"
                list="scout-city-list"
              />
              <datalist id="scout-city-list">
                {CITIES.map((item) => (
                  <option key={item} value={item} />
                ))}
              </datalist>
            </div>

            <div>
              <label htmlFor="scout-min-rating" className="block text-xs font-medium mb-1" style={{ color: "var(--text-2)" }}>Mindest-Bewertung</label>
              <input
                id="scout-min-rating"
                type="number"
                min={0}
                max={5}
                step={0.1}
                className="w-full rounded-md px-3 py-2 text-sm border outline-none"
                style={INPUT_STYLE}
                value={minRating}
                onChange={(e) => setMinRating(e.target.value)}
              />
            </div>

            <div>
              <label htmlFor="scout-min-reviews" className="block text-xs font-medium mb-1" style={{ color: "var(--text-2)" }}>Min. Bewertungen</label>
              <input
                id="scout-min-reviews"
                type="number"
                min={0}
                className="w-full rounded-md px-3 py-2 text-sm border outline-none"
                style={INPUT_STYLE}
                value={minReviews}
                onChange={(e) => setMinReviews(e.target.value)}
              />
            </div>

            <div>
              <label htmlFor="scout-max-results" className="block text-xs font-medium mb-1" style={{ color: "var(--text-2)" }}>Max. Ergebnisse</label>
              <input
                id="scout-max-results"
                type="number"
                min={1}
                max={SCOUT_LIMITS.maxResults}
                className="w-full rounded-md px-3 py-2 text-sm border outline-none"
                style={INPUT_STYLE}
                value={maxResults}
                onChange={(e) => setMaxResults(e.target.value)}
              />
            </div>
          </div>

          {/* ---- Filterzeile je Reiter ---- */}
          {tab === "instagram" ? (
            <div className="pt-4 border-t flex flex-wrap gap-2" style={{ borderColor: "var(--border)" }} aria-label="Voreinstellungen">
              <ToggleChip active={presets.noWebsite} onClick={() => togglePreset("noWebsite")}>Ohne eigene Website</ToggleChip>
              <ToggleChip active={presets.withInstagram} onClick={() => togglePreset("withInstagram")}>Mit Instagram</ToggleChip>
              <ToggleChip active={presets.hideChains} onClick={() => togglePreset("hideChains")}>Ketten ausblenden</ToggleChip>
              <ToggleChip active={presets.onlyNew} onClick={() => togglePreset("onlyNew")}>Nur neue</ToggleChip>
            </div>
          ) : (
            <div className="pt-4 border-t grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-6 gap-4" style={{ borderColor: "var(--border)" }}>
              <FilterSelect
                label="Sortierung"
                value={sortBy}
                onChange={(value) => setSortBy(value as "rating" | "distance")}
                options={[
                  ["rating", "Beste Bewertung (Standard)"],
                  ["distance", "Kürzeste Distanz (Walk-In)"],
                ]}
              />
              <FilterSelect
                label="Website-Filter"
                value={hasWebsiteFilter}
                onChange={(value) => setHasWebsiteFilter(value as TriFilter)}
                options={[
                  ["all", "Alle anzeigen"],
                  ["no", "Nur OHNE eigene Website (Top Akquise!)"],
                  ["yes", "Nur MIT eigener Website"],
                ]}
              />
              <FilterSelect
                label="Treatwell-Profil"
                value={hasTreatwellFilter}
                onChange={(value) => setHasTreatwellFilter(value as TriFilter)}
                options={[
                  ["all", "Alle"],
                  ["yes", "Nur auf Treatwell"],
                  ["no", "Nicht auf Treatwell"],
                ]}
              />
              <FilterSelect
                label="Telefon-Kontakt"
                value={hasPhoneFilter}
                onChange={(value) => setHasPhoneFilter(value as TriFilter)}
                options={[
                  ["all", "Alle"],
                  ["yes", "Nur mit Telefonnummer"],
                  ["no", "Ohne Telefonnummer"],
                ]}
              />
              <FilterSelect
                label="Instagram-Kontakt"
                value={hasInstagramFilter}
                onChange={(value) => setHasInstagramFilter(value as TriFilter)}
                options={[
                  ["all", "Alle"],
                  ["yes", "Nur mit Instagram"],
                  ["no", "Ohne Instagram"],
                ]}
              />
              <FilterSelect
                label="Ketten"
                value={hideChainsStandard ? "hide" : "all"}
                onChange={(value) => setHideChainsStandard(value === "hide")}
                options={[
                  ["all", "Alle anzeigen"],
                  ["hide", "Kettenverdacht ausblenden"],
                ]}
              />
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <p className="text-xs" style={{ color: "var(--text-3)" }}>
              Suchläufe werden automatisch gespeichert · höchstens {SCOUT_LIMITS.maxScoutedVenues} Betriebe pro Lauf.
            </p>

            <button
              onClick={() => void runScout()}
              disabled={locked}
              title={igLocked ? LOCK_TITLE : undefined}
              className="flex items-center gap-2 rounded-md px-5 text-xs font-semibold shadow-md transition-all cursor-pointer"
              style={{ minHeight: 44, background: "var(--accent)", color: "var(--bg)", opacity: loading ? 0.7 : 1 }}
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : tab === "instagram" ? <AtSign className="w-4 h-4" /> : <Radar className="w-4 h-4" />}
              {loading ? "Scout läuft…" : "Scout Starten"}
            </button>
          </div>

          {error && (
            <div
              className="p-3 rounded-md text-xs font-medium border flex items-center gap-2"
              style={{ background: "var(--status-lost-bg)", color: "var(--status-lost-tx)", borderColor: "var(--status-lost-tx)" }}
              role="alert"
            >
              <AlertTriangle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}
        </div>

        {/* ---- Gespeicherte Sessions ---- */}
        {sessions.length > 0 && (
          <div className="rounded-xl border p-4 space-y-3" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
            <h3 className="text-xs font-semibold flex items-center gap-2" style={{ color: "var(--text)" }}>
              <History className="w-4 h-4" style={{ color: "var(--accent)" }} />
              Gespeicherte Scout-Sessions (Persistent)
            </h3>
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              {sessions.map((s) => (
                <button
                  key={s.id}
                  onClick={() => void loadSession(s.id)}
                  disabled={locked}
                  title={igLocked ? LOCK_TITLE : undefined}
                  className={cn(
                    "flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium shrink-0 transition-all disabled:cursor-not-allowed disabled:opacity-40",
                    selectedSessionId === s.id
                      ? "border-[var(--accent)] bg-[var(--surface-3)] text-[var(--text)]"
                      : "border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-2)] hover:text-[var(--text)]",
                  )}
                >
                  <span>{s.name || `${s.searchQuery} in ${s.city}`}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: "var(--surface-3)", color: "var(--text-3)" }}>
                    {s.resultCount} Leads
                  </span>
                  <span className="text-[10px]" style={{ color: "var(--text-3)" }}>
                    {timeAgo(s.createdAt)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ---- Ergebnisse ---- */}
        {/* Bleibt beim Reiterwechsel gemountet (nur versteckt): angelegte Leads,
            Auswahl und laufende Pruefung duerfen nicht verloren gehen. */}
        {responses.instagram && (
          <div hidden={tab !== "instagram"}>
            <InstagramResults
              key={`ig-${versions.instagram}`}
              response={responses.instagram}
              onLockChange={setIgLocked}
              externalLock={loading}
            />
          </div>
        )}

        {response && tab === "standard" && (
          <div className="space-y-4">
            <ScoutFunnel response={response} finalLabel="Treffer" />
            {notices.length > 0 && (
              <ul className="space-y-1 px-2" role="status">
                {notices.map((notice) => (
                  <li key={notice} className="text-[11px]" style={{ color: "var(--status-planned-tx)" }}>{notice}</li>
                ))}
              </ul>
            )}
            {response.results.length > 0 ? (
              response.results.map((result) => (
                <ScoutResultCard
                  key={result.venue.key}
                  result={result}
                  onAdd={(selectedStatus, acquisitionType, nfcDemoUrl) => void addLead(result, selectedStatus, acquisitionType, nfcDemoUrl)}
                  added={addedIds.has(result.venue.key)}
                  adding={addingId === result.venue.key}
                />
              ))
            ) : (
              <div className="rounded-xl border p-12 text-center text-xs" style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text-3)" }}>
                Keine passenden Kandidaten — der Trichter oben zeigt, wo sie hängen bleiben.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<[string, string]>;
}) {
  return (
    <label className="block">
      <span className="block text-[11px] font-semibold mb-1" style={{ color: "var(--text-3)" }}>{label}</span>
      <select
        className="w-full rounded-md px-2.5 py-1.5 text-xs border outline-none cursor-pointer"
        style={INPUT_STYLE}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>{optionLabel}</option>
        ))}
      </select>
    </label>
  );
}

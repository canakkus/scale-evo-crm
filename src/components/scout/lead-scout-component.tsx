"use client";

import { useCallback, useState, useEffect } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CalendarClock,
  Check,
  ExternalLink,
  Globe,
  Loader2,
  Mail,
  MapPin,
  Phone,
  Plus,
  Radar,
  Sparkles,
  Star,
  X,
  History,
  Filter,
  Navigation,
} from "lucide-react";
import { cn, timeAgo } from "@/lib/utils";
import { formatDistance } from "@/lib/distance";
import { RESTAURANT_CATEGORIES, type LeadScoutResponse, type ScoutResult, type ScoutStepStatus } from "@/lib/lead-scout-types";

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

type AuditCheck = { key: keyof NonNullable<ScoutResult["audit"]>; label: string };

const AUDIT_CHECKS: AuditCheck[] = [
  { key: "hasImprint", label: "Impressum" },
  { key: "hasPrivacy", label: "Datenschutz" },
  { key: "hasConsent", label: "Cookie-Banner" },
  { key: "hasBooking", label: "Online-Buchung" },
  { key: "hasCta", label: "CTA" },
  { key: "https", label: "HTTPS" },
];

function StepBadge({ status, labels }: { status: ScoutStepStatus; labels?: Partial<Record<ScoutStepStatus, string>> }) {
  if (status === "ok") return <span className="inline-flex items-center gap-1 rounded-full bg-emerald-950/60 px-2 py-0.5 text-[11px] font-bold text-emerald-300"><Check className="w-3 h-3" /> OK</span>;
  if (status === "warn") return <span className="inline-flex items-center gap-1 rounded-full bg-amber-950/60 px-2 py-0.5 text-[11px] font-bold text-amber-300"><AlertTriangle className="w-3 h-3" /> Prüfen</span>;
  if (status === "fail") return <span className="inline-flex items-center gap-1 rounded-full bg-red-950/60 px-2 py-0.5 text-[11px] font-bold text-red-300"><X className="w-3 h-3" /> Fehlt</span>;
  return <span className="inline-flex items-center gap-1 rounded-full bg-neutral-800 px-2 py-0.5 text-[11px] font-bold text-neutral-300">Übersprungen</span>;
}

function Stars({ rating }: { rating: number | null }) {
  if (rating === null) return <span className="text-xs" style={{ color: "var(--text-3)" }}>–</span>;
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold">
      <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
      {rating.toFixed(1)}
    </span>
  );
}

import { STATUS_LABELS } from "@/lib/constants";
import type { LeadStatus } from "@prisma/client";

function ResultCard({
  result,
  onAdd,
  added,
  adding,
}: {
  result: ScoutResult;
  onAdd: (status: LeadStatus, acquisitionType: "CALL" | "WALK_IN", nfcDemoUrl?: string) => void;
  added: boolean;
  adding: boolean;
}) {
  const { venue, duplicate, maps, website, menu, audit, contacts } = result;
  const isDuplicate = duplicate.matches.some((match) => match.confidence === "high");
  const possibleDuplicate = duplicate.matches.length > 0 && !isDuplicate;

  const [status, setStatus] = useState<LeadStatus>("NEW");
  const [isWalkIn, setIsWalkIn] = useState(false);
  const [nfcDemoUrl, setNfcDemoUrl] = useState("");
  const [showNfcInput, setShowNfcInput] = useState(false);

  const handleWalkInToggle = (checked: boolean) => {
    setIsWalkIn(checked);
    if (checked && status === "NEW") {
      setStatus("WALK_IN_PLANNED");
    } else if (!checked && status === "WALK_IN_PLANNED") {
      setStatus("NEW");
    }
  };

  const handleAdd = () => {
    if (possibleDuplicate && !window.confirm("Als mögliches Duplikat trotzdem als neuen Lead anlegen?")) return;
    onAdd(status, isWalkIn ? "WALK_IN" : "CALL", nfcDemoUrl.trim() || undefined);
  };

  return (
    <div className="rounded-xl border p-5 transition hover:shadow-lg space-y-4" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h3 className="text-base font-bold" style={{ color: "var(--text)" }}>{venue.name}</h3>
            <Stars rating={venue.rating} />
            <span className="text-xs" style={{ color: "var(--text-3)" }}>{venue.reviewCount} Bewertungen</span>
            {result.distanceKm != null && (
              <span
                className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold tracking-wide"
                style={{
                  background: "rgba(56, 189, 248, 0.12)",
                  color: "#38bdf8",
                  border: "1px solid rgba(56, 189, 248, 0.25)",
                }}
              >
                <Navigation className="w-3 h-3" />
                {formatDistance(result.distanceKm)} entfernt
              </span>
            )}
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-xs" style={{ color: "var(--text-2)" }}>
            <MapPin className="w-3.5 h-3.5 shrink-0" style={{ color: "var(--text-3)" }} />
            {venue.addressLine || "Adresse unbekannt"}
          </div>
          <div className="mt-1.5 flex items-center gap-3 text-xs font-semibold">
            {venue.treatwellUrl && (
              <a
                href={venue.treatwellUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 underline-offset-2 hover:underline"
                style={{ color: "var(--status-new-tx)" }}
              >
                Treatwell-Profil <ExternalLink className="w-3 h-3" />
              </a>
            )}
            {maps.place?.googleMapsUri && (
              <a
                href={maps.place.googleMapsUri}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 underline-offset-2 hover:underline"
                style={{ color: "var(--status-new-tx)" }}
              >
                Google Maps <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isDuplicate ? (
            <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold" style={{ background: "var(--status-lost-bg)", color: "var(--status-lost-tx)" }}>
              <X className="w-3 h-3" /> Duplikat im CRM
            </span>
          ) : possibleDuplicate ? (
            <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold" style={{ background: "var(--status-planned-bg)", color: "var(--status-planned-tx)" }}>
              <AlertTriangle className="w-3 h-3" /> Mögliches Duplikat
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold" style={{ background: "var(--status-warm-bg)", color: "var(--status-warm-tx)" }}>
              <Sparkles className="w-3 h-3" /> Neuer Kandidat
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border p-3" style={{ background: "var(--surface-2)", borderColor: "var(--border)" }}>
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: "var(--text-3)" }}>Duplikat-Check</span>
            <StepBadge status={duplicate.status} />
          </div>
          {duplicate.matches.length > 0 ? (
            <div className="mt-1.5 space-y-1 text-xs">
              {duplicate.matches.map((m) => (
                <div key={m.id} style={{ color: "var(--status-planned-tx)" }}>
                  {m.companyName} ({m.confidence})
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-1 text-xs" style={{ color: "var(--text-3)" }}>Kein Duplikat</p>
          )}
        </div>

        <div className="rounded-lg border p-3" style={{ background: "var(--surface-2)", borderColor: "var(--border)" }}>
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: "var(--text-3)" }}>Google Maps</span>
            <StepBadge status={maps.status} />
          </div>
          <p className="mt-1 text-xs truncate" style={{ color: "var(--text-2)" }}>{maps.matchReason}</p>
        </div>

        <div className="rounded-lg border p-3" style={{ background: "var(--surface-2)", borderColor: "var(--border)" }}>
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: "var(--text-3)" }}>Website</span>
            <StepBadge status={website.status} />
          </div>
          {website.url ? (
            <a
              href={website.url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 flex items-center gap-1 text-xs font-semibold underline truncate"
              style={{ color: "var(--status-new-tx)" }}
            >
              <Globe className="w-3 h-3 shrink-0" />
              {website.url.replace(/^https?:\/\/(www\.)?/, "").slice(0, 25)}
            </a>
          ) : (
            <p className="mt-1 text-xs" style={{ color: "var(--status-lost-tx)" }}>Keine Website</p>
          )}
        </div>

        <div className="rounded-lg border p-3" style={{ background: "var(--surface-2)", borderColor: "var(--border)" }}>
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: "var(--text-3)" }}>Kontakt</span>
            <span className="text-xs font-semibold" style={{ color: contacts.phone ? "var(--status-warm-tx)" : "var(--text-3)" }}>
              {contacts.phone ? "Vorhanden" : "Keine"}
            </span>
          </div>
          <div className="mt-1 space-y-0.5 text-xs truncate" style={{ color: "var(--text-2)" }}>
            {contacts.phone && <div className="font-mono">{contacts.phone}</div>}
            {contacts.email && <div className="truncate">{contacts.email}</div>}
          </div>
        </div>
      </div>

      {/* Walk-In & NFC Demo URL expanded row */}
      {isWalkIn && (
        <div className="rounded-lg border p-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-fade-in" style={{ background: "var(--surface-2)", borderColor: "rgba(56, 189, 248, 0.3)" }}>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold px-2 py-0.5 rounded bg-sky-500/10 text-sky-400 border border-sky-500/20">
              🚶 Walk-In Lead
            </span>
            <span className="text-xs" style={{ color: "var(--text-2)" }}>
              Lead wird als Vor-Ort-Akquise markiert.
            </span>
          </div>

          <div className="w-full sm:w-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowNfcInput(!showNfcInput)}
              className="text-xs font-semibold underline hover:no-underline"
              style={{ color: "var(--accent)" }}
            >
              {showNfcInput ? "NFC URL verbergen" : "+ NFC Demo URL hinzufügen"}
            </button>
            {showNfcInput && (
              <input
                type="url"
                placeholder="https://scaleevo.at/demo/..."
                value={nfcDemoUrl}
                onChange={(e) => setNfcDemoUrl(e.target.value)}
                className="rounded-md px-2.5 py-1 text-xs border outline-none w-full sm:w-64"
                style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text)" }}
              />
            )}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t" style={{ borderColor: "var(--border)" }}>
        {/* Walk-In Checkbox Selector */}
        <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer select-none">
          <input
            type="checkbox"
            checked={isWalkIn}
            disabled={isDuplicate || added || adding}
            onChange={(e) => handleWalkInToggle(e.target.checked)}
            className="rounded accent-[var(--accent)] cursor-pointer w-4 h-4"
          />
          <span style={{ color: isWalkIn ? "var(--accent)" : "var(--text-2)" }}>
            Als Walk-In Vormerken
          </span>
        </label>

        <div className="flex flex-wrap items-center justify-end gap-3">
          {added && (
            <span className="inline-flex items-center gap-1 text-xs font-semibold" style={{ color: "var(--status-warm-tx)" }}>
              <Check className="w-4 h-4" /> Als Lead angelegt
            </span>
          )}

          {/* Status Dropdown with all Categories */}
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold" style={{ color: "var(--text-3)" }}>
              Status:
            </label>
            <select
              value={status}
              disabled={isDuplicate || added || adding}
              onChange={(e) => setStatus(e.target.value as LeadStatus)}
              className="rounded-lg px-2.5 py-1.5 text-xs font-semibold border outline-none cursor-pointer transition-colors disabled:opacity-50"
              style={{
                background: "var(--surface-2)",
                borderColor: "var(--border)",
                color: "var(--text)",
              }}
            >
              {Object.entries(STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <button
            disabled={isDuplicate || added || adding}
            onClick={handleAdd}
            className="flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all disabled:opacity-50 cursor-pointer shadow-sm active:scale-95"
            style={{ background: "var(--accent)", color: "var(--bg)" }}
          >
            {adding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
            {isDuplicate ? "Duplikat im CRM" : added ? "Bereits Angelegt" : `Als Lead anlegen (${STATUS_LABELS[status]})`}
          </button>
        </div>
      </div>
    </div>
  );
}

export function LeadScoutComponent() {
  const [category, setCategory] = useState("Barber");
  const [city, setCity] = useState("Wien");
  const isRestaurant = RESTAURANT_CATEGORIES.includes(category) || category === "Alle";
  const source = isRestaurant ? "places" : "treatwell";

  // Filter options
  const [minRating, setMinRating] = useState("4.0");
  const [minReviews, setMinReviews] = useState("10");
  const [maxResults, setMaxResults] = useState("10");
  const [sortBy, setSortBy] = useState<"rating" | "distance">("rating");
  const [hasWebsiteFilter, setHasWebsiteFilter] = useState<"all" | "yes" | "no">("all");
  const [hasTreatwellFilter, setHasTreatwellFilter] = useState<"all" | "yes" | "no">("all");
  const [hasPhoneFilter, setHasPhoneFilter] = useState<"all" | "yes" | "no">("all");
  const [hasInstagramFilter, setHasInstagramFilter] = useState<"all" | "yes" | "no">("all");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [response, setResponse] = useState<LeadScoutResponse | null>(null);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());

  // Sessions History
  const [sessions, setSessions] = useState<any[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);

  const fetchSessions = useCallback(async () => {
    try {
      const res = await fetch("/api/scout/sessions");
      if (res.ok) {
        const data = await res.json();
        setSessions(data.sessions || []);
      }
    } catch (err) {
      console.error(err);
    }
  }, []);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  const loadSession = async (sessionId: string) => {
    setLoading(true);
    setError(null);
    setSelectedSessionId(sessionId);

    try {
      const res = await fetch(`/api/scout/sessions?id=${sessionId}`);
      if (!res.ok) throw new Error("Session konnte nicht geladen werden.");
      const data = await res.json();

      const session = data.session;
      if (session) {
        // Reconstruct results format from DB ScoutResult records
        const results: ScoutResult[] = session.results.map((r: any) => r.rawData as ScoutResult);
        setResponse({
          sessionId: session.id,
          sourceUrl: `https://www.treatwell.at/orte/bei-${session.searchQuery.toLowerCase()}/in-${session.city?.toLowerCase()}-at/`,
          totalFound: session.resultCount,
          filteredCount: session.resultCount,
          results,
          placesConfigured: true,
        });
      }
    } catch (err: any) {
      setError(err.message || "Fehler beim Laden der Session.");
    } finally {
      setLoading(false);
    }
  };

  const runScout = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSelectedSessionId(null);
    setAddedIds(new Set());

    try {
      const res = await fetch("/api/lead-scout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category,
          city,
          minRating: Number(minRating),
          minReviews: Number(minReviews),
          maxResults: Number(maxResults),
          source,
          sortBy,
          hasWebsiteFilter,
          hasTreatwellFilter,
          hasPhoneFilter,
          hasInstagramFilter,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Lead-Scout fehlgeschlagen.");
      setResponse(data);
      fetchSessions(); // Refresh sessions list
    } catch (err: any) {
      setError(err.message || "Lead-Scout fehlgeschlagen.");
    } finally {
      setLoading(false);
    }
  }, [category, city, minRating, minReviews, maxResults, source, sortBy, hasWebsiteFilter, hasTreatwellFilter, hasPhoneFilter, hasInstagramFilter, fetchSessions]);

  const addLead = async (
    result: ScoutResult,
    customStatus?: LeadStatus,
    acquisitionType: "CALL" | "WALK_IN" = "CALL",
    nfcDemoUrl?: string
  ) => {
    setAddingId(result.venue.key);
    try {
      const payload = {
        ...result.leadDraft,
        status: customStatus || (result.leadDraft as any).status || "NEW",
        acquisitionType,
        nfcDemoUrl: nfcDemoUrl || (result.leadDraft as any).nfcDemoUrl || null,
      };
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Lead konnte nicht angelegt werden.");
      setAddedIds((ids) => new Set(ids).add(result.venue.key));
    } catch (err: any) {
      setError(err.message || "Lead konnte nicht angelegt werden.");
    } finally {
      setAddingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Search Form Card */}
      <div className="rounded-xl border p-6 space-y-6" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
        <div className="flex items-center justify-between">
          <h2 className="font-heading text-lg font-bold flex items-center gap-2" style={{ color: "var(--text)" }}>
            <Radar className="w-5 h-5" style={{ color: "var(--accent)" }} />
            Neuen Scout-Durchlauf starten
          </h2>
          {sessions.length > 0 && (
            <span className="text-xs" style={{ color: "var(--text-3)" }}>
              {sessions.length} gespeicherte Sessions
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-2)" }}>Nische / Kategorie</label>
            <select
              className="w-full rounded-md px-3 py-2 text-sm border outline-none cursor-pointer"
              style={{ background: "var(--surface-2)", borderColor: "var(--border)", color: "var(--text)" }}
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              {CATEGORIES.map((item) => (
                <option key={item.slug} value={item.slug}>{item.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-2)" }}>Stadt</label>
            <input
              type="text"
              className="w-full rounded-md px-3 py-2 text-sm border outline-none"
              style={{ background: "var(--surface-2)", borderColor: "var(--border)", color: "var(--text)" }}
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="z. B. Wien"
            />
          </div>

          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-2)" }}>Mindest-Bewertung</label>
            <input
              type="number"
              min={0}
              max={5}
              step={0.1}
              className="w-full rounded-md px-3 py-2 text-sm border outline-none"
              style={{ background: "var(--surface-2)", borderColor: "var(--border)", color: "var(--text)" }}
              value={minRating}
              onChange={(e) => setMinRating(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-2)" }}>Min. Bewertungen</label>
            <input
              type="number"
              min={0}
              className="w-full rounded-md px-3 py-2 text-sm border outline-none"
              style={{ background: "var(--surface-2)", borderColor: "var(--border)", color: "var(--text)" }}
              value={minReviews}
              onChange={(e) => setMinReviews(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-2)" }}>Max. Ergebnisse</label>
            <input
              type="number"
              min={1}
              max={30}
              className="w-full rounded-md px-3 py-2 text-sm border outline-none"
              style={{ background: "var(--surface-2)", borderColor: "var(--border)", color: "var(--text)" }}
              value={maxResults}
              onChange={(e) => setMaxResults(e.target.value)}
            />
          </div>
        </div>

        {/* Extended Filter Controls */}
        <div className="pt-4 border-t grid grid-cols-1 sm:grid-cols-5 gap-4" style={{ borderColor: "var(--border)" }}>
          <div>
            <label className="block text-[11px] font-semibold mb-1" style={{ color: "var(--text-3)" }}>Sortierung</label>
            <select
              className="w-full rounded-md px-2.5 py-1.5 text-xs border outline-none cursor-pointer"
              style={{ background: "var(--surface-2)", borderColor: "var(--border)", color: "var(--text)" }}
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as "rating" | "distance")}
            >
              <option value="rating">Beste Bewertung (Standard)</option>
              <option value="distance">Kürzeste Distanz (Walk-In)</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold mb-1" style={{ color: "var(--text-3)" }}>Website-Filter</label>
            <select
              className="w-full rounded-md px-2.5 py-1.5 text-xs border outline-none cursor-pointer"
              style={{ background: "var(--surface-2)", borderColor: "var(--border)", color: "var(--text)" }}
              value={hasWebsiteFilter}
              onChange={(e) => setHasWebsiteFilter(e.target.value as any)}
            >
              <option value="all">Alle anzeigen</option>
              <option value="no">Nur OHNE eigene Website (Top Akquise!)</option>
              <option value="yes">Nur MIT eigener Website</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold mb-1" style={{ color: "var(--text-3)" }}>Treatwell-Profil</label>
            <select
              className="w-full rounded-md px-2.5 py-1.5 text-xs border outline-none cursor-pointer"
              style={{ background: "var(--surface-2)", borderColor: "var(--border)", color: "var(--text)" }}
              value={hasTreatwellFilter}
              onChange={(e) => setHasTreatwellFilter(e.target.value as any)}
            >
              <option value="all">Alle</option>
              <option value="yes">Nur auf Treatwell</option>
              <option value="no">Nicht auf Treatwell</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold mb-1" style={{ color: "var(--text-3)" }}>Telefon-Kontakt</label>
            <select
              className="w-full rounded-md px-2.5 py-1.5 text-xs border outline-none cursor-pointer"
              style={{ background: "var(--surface-2)", borderColor: "var(--border)", color: "var(--text)" }}
              value={hasPhoneFilter}
              onChange={(e) => setHasPhoneFilter(e.target.value as any)}
            >
              <option value="all">Alle</option>
              <option value="yes">Nur mit Telefonnummer</option>
              <option value="no">Ohne Telefonnummer</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold mb-1" style={{ color: "var(--text-3)" }}>Instagram-Kontakt</label>
            <select
              className="w-full rounded-md px-2.5 py-1.5 text-xs border outline-none cursor-pointer"
              style={{ background: "var(--surface-2)", borderColor: "var(--border)", color: "var(--text)" }}
              value={hasInstagramFilter}
              onChange={(e) => setHasInstagramFilter(e.target.value as any)}
            >
              <option value="all">Alle</option>
              <option value="yes">Nur mit Instagram</option>
              <option value="no">Ohne Instagram</option>
            </select>
          </div>
        </div>

        <div className="flex items-center justify-between pt-2">
          <p className="text-xs" style={{ color: "var(--text-3)" }}>
            Suchläufe werden automatisch in der Datenbank gespeichert.
          </p>

          <button
            onClick={runScout}
            disabled={loading}
            className="flex items-center gap-2 rounded-md px-5 py-2 text-xs font-semibold shadow-md transition-all cursor-pointer"
            style={{ background: "var(--accent)", color: "var(--bg)", opacity: loading ? 0.7 : 1 }}
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Radar className="w-4 h-4" />}
            {loading ? "Scout läuft…" : "Scout Starten"}
          </button>
        </div>

        {error && (
          <div className="p-3 rounded-md text-xs font-medium border flex items-center gap-2" style={{ background: "var(--status-lost-bg)", color: "var(--status-lost-tx)", borderColor: "rgba(224,104,104,0.3)" }}>
            <AlertTriangle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}
      </div>

      {/* Saved Sessions History Bar */}
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
                onClick={() => loadSession(s.id)}
                className={cn(
                  "flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium shrink-0 transition-all",
                  selectedSessionId === s.id
                    ? "border-[var(--accent)] bg-[var(--surface-3)] text-[var(--text)]"
                    : "border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-2)] hover:text-[var(--text)]"
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

      {/* Results Header */}
      {response && (
        <div className="flex items-center justify-between px-2">
          <div className="flex items-center gap-2 text-xs font-semibold" style={{ color: "var(--text)" }}>
            <Sparkles className="w-4 h-4" style={{ color: "var(--status-warm-tx)" }} />
            {response.results.length} Kandidaten gefunden ({response.filteredCount} nach Filter)
          </div>
          {response.sourceUrl && (
            <a
              href={response.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="text-xs font-semibold flex items-center gap-1 hover:underline"
              style={{ color: "var(--status-new-tx)" }}
            >
              Quelle öffnen <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
      )}

      {/* Results List */}
      {response && response.results.length > 0 && (
        <div className="space-y-4">
          {response.results.map((result) => (
            <ResultCard
              key={result.venue.key}
              result={result}
              onAdd={(selectedStatus, acquisitionType, nfcDemoUrl) =>
                addLead(result, selectedStatus, acquisitionType, nfcDemoUrl)
              }
              added={addedIds.has(result.venue.key)}
              adding={addingId === result.venue.key}
            />
          ))}
        </div>
      )}

      {response && response.results.length === 0 && (
        <div className="rounded-xl border p-12 text-center text-xs" style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text-3)" }}>
          Keine passenden Kandidaten für diese Filtereinstellungen gefunden.
        </div>
      )}
    </div>
  );
}

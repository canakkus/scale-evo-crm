"use client";

import { useState } from "react";
import type { LeadStatus } from "@prisma/client";
import { AlertTriangle, AtSign, Check, ExternalLink, Globe, Loader2, MapPin, Navigation, Plus, Sparkles, X } from "lucide-react";
import { STATUS_LABELS } from "@/lib/constants";
import { formatDistance } from "@/lib/distance";
import { instagramStateOf, type ScoutResult } from "@/lib/lead-scout-types";
import { Chip, IgStatusChip, Stars, StepBadge } from "./scout-ui";

/** Standard-Reiter: eine Karte pro Betrieb mit Einzel-Anlage. */
export function ScoutResultCard({
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
  const { venue, duplicate, maps, website, contacts, instagramProfile } = result;
  const isDuplicate = duplicate.matches.some((match) => match.confidence === "high");
  const possibleDuplicate = duplicate.matches.length > 0 && !isDuplicate;
  const igState = instagramStateOf(instagramProfile);
  const solidWebsite = website.solid ?? Boolean(website.url);

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
            <span className="text-xs" style={{ color: "var(--text-3)" }}>{venue.reviewCount ?? 0} Bewertungen</span>
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

        <div className="flex flex-wrap items-center gap-2">
          {result.chain?.suspected && (
            <Chip tone="decide" title={result.chain.reasons.join(" · ")}>
              Kettenverdacht · {result.chain.reasons[0]}
            </Chip>
          )}
          {isDuplicate ? (
            <Chip tone="danger" icon={<X className="w-3 h-3" />}>Duplikat im CRM</Chip>
          ) : possibleDuplicate ? (
            <Chip tone="decide" icon={<AlertTriangle className="w-3 h-3" />}>Mögliches Duplikat</Chip>
          ) : (
            <Chip tone="chance" icon={<Sparkles className="w-3 h-3" />}>Neuer Kandidat</Chip>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
        <div className="rounded-lg border p-3" style={{ background: "var(--surface-2)", borderColor: "var(--border)" }}>
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: "var(--text-3)" }}>Duplikat-Check</span>
            <StepBadge status={duplicate.status} />
          </div>
          {duplicate.matches.length > 0 ? (
            <div className="mt-1.5 space-y-1 text-xs">
              {duplicate.matches.map((m) => (
                <div key={m.id} style={{ color: "var(--status-planned-tx)" }} title={m.reasons.join(", ")}>
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
            {/* Linktree/Social zaehlt nicht als eigene Website (hasSolidWebsite). */}
            <StepBadge
              status={website.url ? (solidWebsite ? "ok" : "warn") : website.status}
              labels={{ warn: "Nur Social", skip: "Unbekannt" }}
            />
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
          ) : website.searchFailed ? (
            <p className="mt-1 text-xs" style={{ color: "var(--text-3)" }}>Websuche nicht beantwortet</p>
          ) : (
            <p className="mt-1 text-xs" style={{ color: "var(--status-lost-tx)" }}>Keine Website</p>
          )}
        </div>

        <div className="rounded-lg border p-3" style={{ background: "var(--surface-2)", borderColor: "var(--border)" }}>
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: "var(--text-3)" }}>Instagram</span>
            <IgStatusChip state={igState} candidates={instagramProfile?.candidates?.length ?? 0} />
          </div>
          {instagramProfile?.handle ? (
            <a
              href={`https://www.instagram.com/${instagramProfile.handle}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 flex items-center gap-1 truncate font-mono text-xs font-semibold underline"
              style={{ color: "var(--status-contacted-tx)" }}
            >
              <AtSign className="w-3 h-3 shrink-0" />
              {instagramProfile.handle}
            </a>
          ) : igState === "choose" ? (
            <div className="mt-1 space-y-1">
              <p className="text-[11px]" style={{ color: "var(--status-planned-tx)" }}>
                Mehrdeutig — im Reiter Instagram auswählen:
              </p>
              {instagramProfile.candidates.slice(0, 3).map((candidate) => (
                <a
                  key={candidate.handle}
                  href={candidate.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block truncate font-mono text-[11px] underline"
                  style={{ color: "var(--text-2)" }}
                >
                  @{candidate.handle}
                </a>
              ))}
            </div>
          ) : (
            <p className="mt-1 text-xs" style={{ color: "var(--text-3)" }}>
              {igState === "failed" ? "Suche nicht beantwortet — unbekannt" : "Kein Profil gefunden"}
            </p>
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
              className="text-xs font-semibold underline hover:no-underline cursor-pointer"
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

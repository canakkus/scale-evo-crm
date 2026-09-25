"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, AtSign, ChevronDown, ExternalLink, Globe, MapPin, X } from "lucide-react";
import { ScoreMeter } from "@/components/ui/score-meter";
import { ProfileSourceLine, type ProfileMeta } from "@/components/ui/profile-source-line";
import { formatDistance } from "@/lib/distance";
import { TAG_LABELS } from "@/lib/score-visuals";
import { LATEST_POST_STALE_DAYS, bioLinkState, domainOf, formatFollowers, relativeDays, type CardView } from "./instagram-model";
import { Chip, IgStatusChip, Stars, StepBadge } from "./scout-ui";

const ORIGIN_LABELS = {
  website: "von Website · verlässlich",
  search: "per Suche · eindeutig",
  manual: "manuell gewählt",
} as const;

const CONFIDENCE_LABELS = { high: "hoch", medium: "mittel", low: "niedrig" } as const;
const VISIBLE_CANDIDATES = 3;

const PANEL_STYLE = { background: "var(--surface-2)", borderColor: "var(--border)" };

function TileLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: "var(--text-3)" }}>
      {children}
    </span>
  );
}

function DataRow({ label, children, first = false }: { label: string; children: React.ReactNode; first?: boolean }) {
  return (
    <div
      className={`flex items-center justify-between gap-3 py-1.5 text-xs ${first ? "" : "border-t"}`}
      style={{ borderColor: "var(--border)" }}
    >
      <span style={{ color: "var(--text-3)" }}>{label}</span>
      <span className="min-w-0 truncate text-right" style={{ color: "var(--text-2)" }}>{children}</span>
    </div>
  );
}

export type SelectState = { enabled: true } | { enabled: false; reason: string };

export function InstagramCard({
  view,
  selected,
  selectState,
  onToggleSelect,
  onPick,
  onResetPick,
}: {
  view: CardView;
  selected: boolean;
  selectState: SelectState;
  onToggleSelect: () => void;
  onPick: (handle: string | null) => void;
  onResetPick: () => void;
}) {
  const { result, state, handle, origin, insight } = view;
  const { venue, maps, website, contacts, duplicate, instagramProfile } = result;
  const candidates = instagramProfile?.candidates ?? [];

  const [choosing, setChoosing] = useState(false);
  const [showAllCandidates, setShowAllCandidates] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const showCandidates = (state === "choose" || choosing) && candidates.length > 0;
  const canChange =
    !view.lockedByLead && (origin === "manual" || (origin === "search" && candidates.length > 0) || view.manualNone);

  const pick = (value: string | null) => {
    onPick(value);
    setChoosing(false);
    setShowAllCandidates(false);
  };

  const snapshot = insight?.snapshot ?? null;
  const score = insight?.score ?? null;
  const crmLead = insight?.crmLead ?? null;

  // ---- Signal-Zeile: nur Ausnahmen, hoechstens drei ----
  const signals: React.ReactNode[] = [];
  if (duplicate.status === "fail" || (crmLead && crmLead.acquisitionType !== "DM")) {
    signals.push(<Chip key="dup" tone="danger" icon={<X className="w-3 h-3" />}>Duplikat im CRM</Chip>);
  } else if (duplicate.status === "warn") {
    signals.push(<Chip key="dup" tone="decide" icon={<AlertTriangle className="w-3 h-3" />}>Mögliches Duplikat</Chip>);
  }
  if (result.chain?.suspected) {
    signals.push(
      <Chip key="chain" tone="decide" title={result.chain.reasons.join(" · ")}>
        Kettenverdacht · {result.chain.reasons[0]}
      </Chip>,
    );
  }
  if (view.isDmLead) {
    signals.push(<Chip key="dm" tone="dm" icon={<AtSign className="w-3 h-3" />}>DM-Lead angelegt</Chip>);
  }

  const duplicateReason =
    duplicate.matches[0]?.reasons.join(", ") ?? (crmLead ? "gleiches IG-Handle" : null);

  const profileMeta: ProfileMeta | null = snapshot
    ? {
        source: snapshot.source,
        ageDays: snapshot.ageDays,
        stale: snapshot.stale,
        bioKnown: snapshot.bio !== null,
        linkKnown: snapshot.externalUrlKnown,
        lastPostAt: snapshot.lastPostAt,
      }
    : null;

  const bioLink = bioLinkState(insight);

  return (
    <article
      className="rounded-xl border p-5 space-y-4"
      style={{ background: "var(--surface)", borderColor: selected ? "var(--accent)" : "var(--border)" }}
    >
      {/* ---- Kopf ---- */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-1">
          <label
            className="-ml-3 -mt-2.5 flex shrink-0 items-center justify-center"
            style={{ width: 44, height: 44, cursor: selectState.enabled ? "pointer" : "not-allowed" }}
            title={selectState.enabled ? "Für Sammelaktionen auswählen" : selectState.reason}
          >
            <input
              type="checkbox"
              checked={selected}
              disabled={!selectState.enabled}
              onChange={onToggleSelect}
              aria-label={`${venue.name} auswählen`}
              className="accent-[var(--accent)] disabled:opacity-40"
              style={{ width: 18, height: 18 }}
            />
          </label>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <h3 className="text-base font-bold" style={{ color: "var(--text)" }}>{venue.name}</h3>
              <Stars rating={venue.rating} />
              <span className="text-xs" style={{ color: "var(--text-3)" }}>{venue.reviewCount ?? 0} Bewertungen</span>
              {result.distanceKm != null && <Chip tone="fact" mono>{formatDistance(result.distanceKm)}</Chip>}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs" style={{ color: "var(--text-2)" }}>
              <MapPin className="w-3.5 h-3.5 shrink-0" style={{ color: "var(--text-3)" }} />
              <span>{venue.addressLine || "Adresse unbekannt"}</span>
              {maps.place?.googleMapsUri && (
                <a
                  href={maps.place.googleMapsUri}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-semibold underline-offset-2 hover:underline"
                  style={{ color: "var(--status-new-tx)" }}
                >
                  Google Maps <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          </div>
        </div>

        {/* ---- Score-Slot: ohne Snapshot KEIN Meter, keine 0 ---- */}
        <div className="flex items-center gap-2">
          {snapshot && score ? (
            <span key={`${handle}-${snapshot.fetchedAt}`} className="animate-fade-in">
              <ScoreMeter score={score.score} size="lg" approximate={score.approximate} reasons={score.reasons} />
            </span>
          ) : (
            <Chip tone="unknown" title="Score entsteht nach ‚Profile prüfen'">Noch nicht geprüft</Chip>
          )}
        </div>
      </div>

      {signals.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {signals.slice(0, 3)}
          {view.isDmLead && (
            <Link
              href="/outreach"
              className="inline-flex items-center px-2 text-[11px] font-semibold underline-offset-2 hover:underline"
              style={{ color: "var(--text-2)", minHeight: 44 }}
            >
              In Outreach öffnen
            </Link>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-2 lg:grid-cols-5">
        {/* ---- Instagram-Panel ---- */}
        <section className="rounded-lg border p-3 space-y-2.5 lg:col-span-3" style={PANEL_STYLE} aria-label="Instagram">
          <div className="flex items-center justify-between gap-2">
            <TileLabel>Instagram</TileLabel>
            <IgStatusChip state={state} candidates={candidates.length} />
          </div>

          {handle && !showCandidates ? (
            <div key={handle} className="flex flex-wrap items-center gap-x-3 gap-y-1 animate-fade-in">
              <a
                href={`https://www.instagram.com/${handle}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-mono text-sm font-semibold hover:underline"
                style={{ color: "var(--status-contacted-tx)", minHeight: 44 }}
              >
                @{handle} <ExternalLink className="w-3 h-3" />
              </a>
              {origin && <span className="text-[11px]" style={{ color: "var(--text-3)" }}>{ORIGIN_LABELS[origin]}</span>}
              {canChange && (
                <button
                  type="button"
                  onClick={() => setChoosing(true)}
                  className="px-1 text-[11px] font-semibold underline"
                  style={{ color: "var(--text-2)", minHeight: 44 }}
                >
                  ändern
                </button>
              )}
            </div>
          ) : !showCandidates ? (
            <div className="flex flex-wrap items-center gap-x-3 text-xs" style={{ color: "var(--text-3)" }}>
              <span>
                {state === "failed"
                  ? "Suchmaschinen haben nicht geantwortet — Profil unbekannt."
                  : view.manualNone
                    ? "Keins davon gewählt."
                    : "Kein Instagram-Profil gefunden."}
              </span>
              {canChange && (
                <button
                  type="button"
                  onClick={onResetPick}
                  className="px-1 text-[11px] font-semibold underline"
                  style={{ color: "var(--text-2)", minHeight: 44 }}
                >
                  ändern
                </button>
              )}
            </div>
          ) : null}

          {/* ---- Kandidaten-Auswahl: nichts vorausgewaehlt ---- */}
          {showCandidates && (
            <div className="space-y-1 animate-fade-in" role="radiogroup" aria-label="Instagram-Profil auswählen">
              <p className="text-[11px]" style={{ color: "var(--status-planned-tx)" }}>
                Mehrere mögliche Profile — bitte das richtige wählen:
              </p>
              {(showAllCandidates ? candidates : candidates.slice(0, VISIBLE_CANDIDATES)).map((candidate) => (
                <div key={candidate.handle} className="flex items-center gap-1">
                  <button
                    type="button"
                    role="radio"
                    aria-checked={false}
                    onClick={() => pick(candidate.handle)}
                    className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 text-left hover:bg-[var(--surface-3)]"
                    style={{ minHeight: 44 }}
                  >
                    <span
                      aria-hidden
                      className="shrink-0 rounded-full"
                      style={{ width: 14, height: 14, border: "1.5px solid var(--border-2)" }}
                    />
                    <span className="shrink-0 font-mono text-xs font-semibold" style={{ color: "var(--text)" }}>@{candidate.handle}</span>
                    <span className="min-w-0 truncate text-[11px]" style={{ color: "var(--text-3)" }}>{candidate.title}</span>
                    <span className="ml-auto shrink-0">
                      <Chip tone={candidate.confidence === "high" ? "chance" : candidate.confidence === "medium" ? "decide" : "unknown"}>
                        {CONFIDENCE_LABELS[candidate.confidence]}
                      </Chip>
                    </span>
                  </button>
                  <a
                    href={candidate.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex shrink-0 items-center gap-1 rounded-lg border px-2.5 text-[11px] font-semibold"
                    style={{ minHeight: 44, borderColor: "var(--border-2)", color: "var(--text-2)" }}
                    aria-label={`Profil @${candidate.handle} öffnen`}
                  >
                    Profil öffnen <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              ))}
              <div className="flex flex-wrap items-center gap-3">
                {!showAllCandidates && candidates.length > VISIBLE_CANDIDATES && (
                  <button
                    type="button"
                    onClick={() => setShowAllCandidates(true)}
                    className="text-[11px] font-semibold underline"
                    style={{ color: "var(--text-2)", minHeight: 44 }}
                  >
                    +{candidates.length - VISIBLE_CANDIDATES} weitere
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => pick(null)}
                  className="text-[11px] font-semibold underline"
                  style={{ color: "var(--text-2)", minHeight: 44 }}
                >
                  Keins davon
                </button>
                {choosing && (
                  <button
                    type="button"
                    onClick={() => setChoosing(false)}
                    className="text-[11px] font-semibold"
                    style={{ color: "var(--text-3)", minHeight: 44 }}
                  >
                    Abbrechen
                  </button>
                )}
              </div>
            </div>
          )}

          {/* ---- Profildaten aus dem Cache ---- */}
          {handle && !showCandidates && !snapshot && (
            <div
              className="rounded-md px-3 py-2 text-[11px] font-semibold"
              style={{ border: "1px dashed var(--border-2)", color: "var(--text-3)" }}
            >
              Follower, Bio, Link in Bio, letzter Post — noch nicht geprüft
            </div>
          )}

          {handle && !showCandidates && snapshot && (
            <div key={snapshot.fetchedAt} className="space-y-2 animate-fade-in">
              <div className="flex flex-wrap items-center gap-2">
                {snapshot.followerCount !== null ? (
                  <span className="font-mono text-[13px] font-bold" style={{ color: "var(--text)" }}>
                    {formatFollowers(snapshot.followerCount)}
                  </span>
                ) : (
                  <Chip tone="unknown">Follower unbekannt</Chip>
                )}
                {snapshot.isPrivate === true && <Chip tone="fact">Privates Profil</Chip>}
                {snapshot.isBusinessAccount === true && <Chip tone="fact">Business</Chip>}
                {snapshot.isPrivate === null && snapshot.isBusinessAccount === null && <Chip tone="unknown">Kontotyp unbekannt</Chip>}
                {snapshot.lastPostAt ? (
                  <span
                    className="font-mono text-[13px] font-bold"
                    style={{
                      color:
                        snapshot.daysSinceLastPost !== null && snapshot.daysSinceLastPost > LATEST_POST_STALE_DAYS
                          ? "var(--status-planned-tx)"
                          : "var(--text-2)",
                    }}
                  >
                    Post {new Date(snapshot.lastPostAt).toLocaleDateString("de-AT", { day: "2-digit", month: "2-digit", year: "numeric" })}
                    {snapshot.daysSinceLastPost !== null ? ` · ${relativeDays(snapshot.daysSinceLastPost)}` : ""}
                  </span>
                ) : (
                  <Chip tone="unknown">Letzter Post unbekannt</Chip>
                )}
              </div>

              {snapshot.bio ? (
                <p className="line-clamp-2 text-xs" style={{ color: "var(--text-2)" }}>„{snapshot.bio}“</p>
              ) : (
                <Chip tone="unknown">Bio unbekannt</Chip>
              )}

              <div className="flex flex-wrap items-center gap-2">
                {bioLink.kind === "none" && <Chip tone="chance">Kein Link in Bio</Chip>}
                {bioLink.kind === "linktree" && <Chip tone="decide" title={bioLink.url}>{TAG_LABELS.LINKTREE_ONLY}</Chip>}
                {bioLink.kind === "own" && (
                  <a href={bioLink.url} target="_blank" rel="noopener noreferrer" title={bioLink.url}>
                    <Chip tone="fact" icon={<Globe className="w-3 h-3" />} mono>{domainOf(bioLink.url)}</Chip>
                  </a>
                )}
                {bioLink.kind === "unknown" && <Chip tone="unknown">Link in Bio unbekannt</Chip>}
                {snapshot.stale && <Chip tone="decide" title="Snapshot älter als die Cache-Laufzeit">Daten veraltet</Chip>}
              </div>

              <ProfileSourceLine meta={profileMeta} />
            </div>
          )}
        </section>

        {/* ---- Weitere Daten: immer alles, unter sm eingeklappt ---- */}
        <section className="lg:col-span-2" aria-label="Weitere Daten">
          <button
            type="button"
            onClick={() => setDetailsOpen((open) => !open)}
            aria-expanded={detailsOpen}
            className="flex w-full items-center justify-between rounded-lg border px-3 text-xs font-semibold sm:hidden"
            style={{ minHeight: 44, ...PANEL_STYLE, color: "var(--text-2)" }}
          >
            Weitere Daten
            <ChevronDown className="w-3.5 h-3.5 transition-transform" style={{ transform: detailsOpen ? "rotate(180deg)" : "none" }} />
          </button>
          <div className={`${detailsOpen ? "mt-2 block" : "hidden"} rounded-lg border p-3 sm:mt-0 sm:block`} style={PANEL_STYLE}>
            <TileLabel>Weitere Daten</TileLabel>
            <div className="mt-1.5">
              <DataRow label="Branche" first>{result.leadDraft.industry ?? "unbekannt"}</DataRow>
              <DataRow label="Website">
                {website.url && website.solid !== false ? (
                  <a href={website.url} target="_blank" rel="noopener noreferrer" className="font-mono underline" style={{ color: "var(--status-new-tx)" }}>
                    {domainOf(website.url)}
                  </a>
                ) : website.url ? (
                  <span title={website.url}>Keine eigene · <span className="font-mono">{domainOf(website.url)}</span></span>
                ) : view.websiteUnknown ? (
                  <Chip tone="unknown" title="Websuche nicht beantwortet — ob es eine Website gibt, ist unbekannt.">unbekannt</Chip>
                ) : (
                  "Keine eigene"
                )}
              </DataRow>
              <DataRow label="Duplikat-Check">
                <span className="inline-flex items-center gap-2">
                  <StepBadge status={crmLead && duplicate.status === "ok" ? "fail" : duplicate.status} labels={{ fail: "Im CRM", ok: "Neu" }} />
                  {duplicateReason && <span className="truncate" title={duplicateReason}>{duplicateReason}</span>}
                </span>
              </DataRow>
              <DataRow label="Google Maps">
                <span className="inline-flex items-center gap-2">
                  <StepBadge status={maps.status} />
                  <span className="truncate" title={maps.matchReason}>{maps.matchReason}</span>
                </span>
              </DataRow>
              <DataRow label="Kontakt">
                {contacts.phone ? <span className="font-mono">{contacts.phone}</span> : "–"}
                {contacts.email ? <span className="ml-2">{contacts.email}</span> : null}
              </DataRow>
            </div>
          </div>
        </section>
      </div>
    </article>
  );
}

"use client";

import Link from "next/link";
import { Check, Loader2 } from "lucide-react";
import { APIFY_PRICE_TOOLTIP, formatProfileCost } from "@/lib/outreach-shared";

export type EnrichConfirm = {
  leadIds: string[];
  willFetch: number;
  /** false = Kette ohne Apify (kostenlos, aber ohne Bio/Link). */
  paid: boolean;
  skipped: Array<{ reason: string; count: number }>;
};

export type BarNote = { tone: "info" | "decide" | "error"; text: string };

const SKIP_SHORT: Record<string, string> = {
  "fresh-snapshot": "aktuell",
  "own-website": "eigene Website",
  "private-profile": "privat",
  "no-handle": "ohne Handle",
  "low-confidence": "Handle unsicher",
};

type StepState = "next" | "done" | "open" | "disabled";

const NOTE_COLORS: Record<BarNote["tone"], string> = {
  info: "var(--text-3)",
  decide: "var(--status-planned-tx)",
  error: "var(--status-lost-tx)",
};

function StepButton({
  state,
  label,
  shortLabel,
  title,
  onClick,
  href,
}: {
  state: StepState;
  label: string;
  shortLabel: string;
  title?: string;
  onClick?: () => void;
  href?: string;
}) {
  const style: React.CSSProperties = {
    minHeight: 44,
    background: state === "next" ? "var(--accent)" : "transparent",
    color: state === "next" ? "var(--bg)" : state === "done" ? "var(--status-warm-tx)" : "var(--text-2)",
    border: state === "next" ? "1px solid var(--accent)" : "1px solid var(--border-2)",
    opacity: state === "disabled" ? 0.4 : 1,
  };
  const className = "inline-flex items-center justify-center gap-1.5 rounded-lg px-3 text-xs font-bold whitespace-nowrap";
  const content = (
    <>
      {state === "done" && <Check className="h-3.5 w-3.5" />}
      <span className="hidden sm:inline">{label}</span>
      <span className="sm:hidden">{shortLabel}</span>
    </>
  );

  if (href && state !== "disabled") {
    return <Link href={href} className={className} style={style} title={title}>{content}</Link>;
  }
  return (
    <button type="button" onClick={onClick} disabled={state === "disabled"} className={`${className} disabled:cursor-not-allowed`} style={style} title={title}>
      {content}
    </button>
  );
}

function Chevron() {
  return <span aria-hidden className="hidden text-xs sm:inline" style={{ color: "var(--text-3)" }}>›</span>;
}

export function InstagramActionBar({
  selectedCount,
  createCount,
  createSkipped,
  createBlocked,
  enrichCount,
  step1Done,
  step2Done,
  busy,
  running,
  confirm,
  note,
  onSelectDmReady,
  onClear,
  onCreate,
  onPreview,
  onConfirm,
  onCancelConfirm,
}: {
  selectedCount: number;
  createCount: number;
  /** Fertige Texte, z. B. "2 übersprungen (bereits im CRM)". */
  createSkipped: string[];
  /** Grund, warum Anlegen gerade gesperrt ist (CRM-Abgleich) — null = frei. */
  createBlocked: string | null;
  enrichCount: number;
  step1Done: boolean;
  step2Done: boolean;
  /** Anlegen oder Vorschau laeuft. */
  busy: boolean;
  /** Bezahlter Lauf laeuft — Leiste nicht schliessbar. */
  running: boolean;
  confirm: EnrichConfirm | null;
  note: BarNote | null;
  onSelectDmReady: () => void;
  onClear: () => void;
  onCreate: () => void;
  onPreview: () => void;
  onConfirm: () => void;
  onCancelConfirm: () => void;
}) {
  const locked = busy || running || confirm !== null;

  const step1: StepState = createCount > 0 ? (step1Done ? "done" : "next") : step1Done ? "done" : "disabled";
  const step2: StepState =
    enrichCount === 0 ? "disabled" : step2Done ? "done" : step1 === "next" ? "open" : "next";
  const step3: StepState = enrichCount === 0 ? "disabled" : step2Done || step2 === "disabled" ? "next" : "open";

  const skippedSummary = confirm?.skipped.filter((entry) => entry.count > 0) ?? [];
  const skippedTotal = skippedSummary.reduce((sum, entry) => sum + entry.count, 0);

  return (
    <div
      className="sticky z-30 animate-fade-in rounded-xl border bottom-[calc(76px+env(safe-area-inset-bottom))] md:bottom-[var(--sp-4)]"
      style={{ background: "var(--surface)", borderColor: "var(--border-2)", boxShadow: "var(--shadow-lg)" }}
      role="region"
      aria-label="Sammelaktionen"
    >
      <div className="flex flex-col gap-2 px-4 py-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap items-center gap-x-3">
          <span className="text-xs font-bold" style={{ color: "var(--text)" }}>{selectedCount} ausgewählt</span>
          <button
            type="button"
            onClick={onSelectDmReady}
            disabled={locked}
            className="hidden text-xs font-semibold disabled:opacity-40 sm:inline"
            style={{ color: "var(--text-3)", minHeight: 44 }}
          >
            Alle DM-bereiten wählen
          </button>
          <button
            type="button"
            onClick={onClear}
            disabled={running}
            className="ml-auto text-xs font-semibold disabled:opacity-40 sm:ml-0"
            style={{ color: "var(--text-3)", minHeight: 44 }}
            title={running ? "Während der Prüfung nicht möglich" : undefined}
          >
            Aufheben
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2 sm:flex sm:flex-wrap sm:items-center">
          <StepButton
            state={locked && step1 !== "done" ? "disabled" : step1}
            label={`Als DM-Leads anlegen (${createCount})`}
            shortLabel="Anlegen"
            title={createBlocked ?? (createCount === 0 ? "Nichts anzulegen — alle ausgewählten sind im CRM oder übersprungen" : undefined)}
            onClick={onCreate}
          />
          <Chevron />
          <StepButton
            state={locked && step2 !== "done" ? "disabled" : step2}
            label={`Profile prüfen (${enrichCount})`}
            shortLabel="Prüfen"
            title={
              enrichCount === 0
                ? "Erst als DM-Leads anlegen"
                : "Kostenlose Vorschau zuerst — bezahlt wird erst nach Bestätigung."
            }
            onClick={onPreview}
          />
          <Chevron />
          <StepButton
            state={running ? "disabled" : step3}
            label="In Outreach öffnen"
            shortLabel="Outreach"
            title={enrichCount === 0 ? "Erst als DM-Leads anlegen" : undefined}
            href="/outreach"
          />
        </div>
      </div>

      {(createSkipped.length > 0 || createBlocked) && !confirm && (
        <p className="px-4 pb-2 text-[11px]" style={{ color: "var(--text-3)" }}>
          {[createBlocked, ...createSkipped].filter(Boolean).map((text) => `· ${text}`).join(" ")}
        </p>
      )}

      {(busy || running) && (
        <p className="flex items-center gap-2 px-4 pb-3 text-[11px] font-semibold" style={{ color: "var(--text-2)" }} role="status">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          {running ? "Wird geprüft …" : "Einen Moment …"}
        </p>
      )}

      {confirm && !running && (
        <div
          className="flex flex-col gap-3 rounded-b-xl px-4 py-3 animate-fade-in sm:flex-row sm:items-center sm:justify-between"
          style={{ background: "var(--confirm-bar-bg)", minHeight: 64 }}
        >
          <div>
            <p className="text-xs font-semibold" style={{ color: "var(--confirm-bar-tx)" }}>
              <span className="font-mono font-bold">{confirm.willFetch}</span>{" "}
              {confirm.willFetch === 1 ? "Profil wird" : "Profile werden"} geprüft ·{" "}
              {confirm.paid ? (
                <span className="font-mono font-bold" title={APIFY_PRICE_TOOLTIP}>{formatProfileCost(confirm.willFetch)}</span>
              ) : (
                <span>kostenlos — ohne Apify bleiben Bio und Link unbekannt</span>
              )}
            </p>
            {skippedTotal > 0 && (
              <p className="mt-0.5 text-[11px]" style={{ color: "var(--text-2)" }}>
                {skippedTotal} übersprungen — {skippedSummary.map((entry) => `${entry.count} ${SKIP_SHORT[entry.reason] ?? entry.reason}`).join(", ")}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={onConfirm}
              className="rounded-lg px-4 text-xs font-bold"
              style={{ minHeight: 44, background: "var(--accent)", color: "var(--bg)" }}
            >
              Jetzt prüfen
            </button>
            <button
              type="button"
              onClick={onCancelConfirm}
              className="rounded-lg border px-4 text-xs font-semibold"
              style={{ minHeight: 44, borderColor: "var(--border-2)", color: "var(--text-2)" }}
            >
              Abbrechen
            </button>
          </div>
        </div>
      )}

      {note && !confirm && !running && (
        <p className="px-4 pb-3 text-[11px] font-semibold animate-fade-in" style={{ color: NOTE_COLORS[note.tone] }} role="status">
          {note.text}
        </p>
      )}
    </div>
  );
}

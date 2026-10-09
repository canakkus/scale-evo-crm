"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { ChevronDown, Info, Search } from "lucide-react";
import type { AcquisitionType, LeadStatus } from "@prisma/client";
import { ACQUISITION_TYPE_LABELS, STATUS_LABELS } from "@/lib/constants";
import { STATUS_STYLES } from "@/components/ui/status-badge";
import { useDismissable } from "./use-popover";
import type { MapLead } from "./map-types";
import { missingLocationReason } from "./map-types";

export type ChannelFilter = "ALL" | AcquisitionType;

export type MapFilters = {
  search: string;
  channel: ChannelFilter;
  statuses: LeadStatus[];
  industries: string[];
  onlyRecent: boolean;
};

export const EMPTY_FILTERS: MapFilters = {
  search: "",
  channel: "ALL",
  statuses: [],
  industries: [],
  onlyRecent: false,
};

/** Platzhalter fuer "industry === null" in der Mehrfachauswahl. */
export const NO_INDUSTRY = "\u0000none";

const CHANNEL_OPTIONS: ChannelFilter[] = ["ALL", "CALL", "WALK_IN", "DM"];

/* ------------------------------------------------------------------ Bausteine */

function CountPill({ value }: { value: number }) {
  return (
    <span
      className="inline-flex items-center justify-center rounded-full px-1.5 text-[10px] font-bold"
      style={{ background: "var(--surface-3)", color: "var(--text-3)", minWidth: 18 }}
    >
      {value}
    </span>
  );
}

function ChipButton({
  active,
  onClick,
  children,
  title,
  ariaLabel,
}: {
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  title?: string;
  /** Pflicht, sobald der sichtbare Inhalt nur ein Icon sein kann. */
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={ariaLabel}
      className="map-chip inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-3 text-[11px] font-semibold transition-colors"
      style={{
        background: active ? "var(--surface-3)" : "var(--surface-2)",
        borderColor: active ? "var(--border-2)" : "var(--border)",
        color: active ? "var(--text)" : "var(--text-2)",
      }}
    >
      {children}
    </button>
  );
}

/**
 * Popover in `position: fixed` statt `absolute`.
 *
 * Die Steuerleiste ist auf Touch horizontal scrollbar (`overflow-x-auto`) —
 * ein absolut positioniertes Kind wuerde davon abgeschnitten. Die Position
 * kommt deshalb aus der Bounding-Box des Ausloesers und wird bei Scroll und
 * Resize nachgezogen.
 */
function Popover({
  open,
  onClose,
  align = "left",
  width,
  children,
  trigger,
}: {
  open: boolean;
  onClose: () => void;
  align?: "left" | "right";
  width: number;
  children: React.ReactNode;
  trigger: React.ReactNode;
}) {
  const ref = useDismissable(open, onClose);
  const panelRef = useRef<HTMLDivElement | null>(null);

  // Position wird direkt ins DOM geschrieben statt in State gehalten: kein
  // zweiter Render, und `useLayoutEffect` setzt sie vor dem ersten Paint, also
  // ohne sichtbaren Sprung.
  useLayoutEffect(() => {
    if (!open) return;
    const position = () => {
      const anchor = ref.current;
      const panel = panelRef.current;
      if (!anchor || !panel) return;
      const rect = anchor.getBoundingClientRect();
      const left =
        align === "right"
          ? Math.max(8, rect.right - width)
          : Math.min(rect.left, window.innerWidth - width - 8);
      panel.style.top = `${rect.bottom + 6}px`;
      panel.style.left = `${Math.max(8, left)}px`;
    };
    position();
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    return () => {
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
    };
  }, [open, align, width, ref]);

  return (
    <div ref={ref} className="relative shrink-0">
      {trigger}
      {open && (
        <div
          ref={panelRef}
          className="touch-scroll animate-fade-in overflow-y-auto rounded-xl border p-2"
          style={{
            position: "fixed",
            /*
              Projektskala, nicht Fantasiewert: 30 liegt ueber der Karte (z-0),
              aber unter Sidebar-FAB/Overlay (z-40), Sidebar-Schublade (z-50)
              und LeadDetailModal (z-50).
              ACHTUNG: `position: fixed` allein reicht nicht. Status/Branche
              haengen im Root-Stacking-Context. "Ohne Standort" und Legende
              sitzen dagegen im `.map-controls-sticky`-Block — `sticky` erzeugt
              einen eigenen Stacking Context, dort wirkt dieser z-index nur
              intern. Deshalb traegt der Sticky-Block selbst z-index 30
              (globals.css); ohne ihn schnitt die Karte diese Popover ab.
            */
            zIndex: 30,
            top: -9999,
            left: -9999,
            width,
            maxHeight: "60dvh",
            background: "var(--surface-2)",
            borderColor: "var(--border-2)",
            boxShadow: "var(--shadow-md)",
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}

function CheckRow({
  checked,
  onToggle,
  label,
  count,
  dotColor,
}: {
  checked: boolean;
  onToggle: () => void;
  label: string;
  count: number;
  dotColor?: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex w-full items-center gap-2 rounded-lg px-2 text-left transition-colors hover:bg-[var(--surface-3)]"
      style={{ minHeight: 36 }}
    >
      <span
        className="inline-flex shrink-0 items-center justify-center rounded"
        style={{
          width: 14,
          height: 14,
          border: `1px solid ${checked ? "var(--accent)" : "var(--border-2)"}`,
          background: checked ? "var(--accent)" : "transparent",
        }}
      >
        {checked && (
          <span style={{ width: 6, height: 6, borderRadius: 1, background: "var(--bg)" }} />
        )}
      </span>
      {dotColor && (
        <span
          className="shrink-0 rounded-full"
          style={{ width: 10, height: 10, background: dotColor }}
        />
      )}
      <span className="min-w-0 flex-1 truncate text-[11px]" style={{ color: "var(--text)" }}>
        {label}
      </span>
      <span className="shrink-0 font-mono text-[10px]" style={{ color: "var(--text-3)" }}>
        {count}
      </span>
    </button>
  );
}

/* -------------------------------------------------------------- Steuerleiste */

export function MapControls({
  filters,
  onChange,
  searchInput,
  onSearchInput,
  channelCounts,
  statusCounts,
  industryCounts,
  locatedCount,
  totalCount,
  missingLeads,
  onOpenLead,
}: {
  filters: MapFilters;
  onChange: (next: MapFilters) => void;
  searchInput: string;
  onSearchInput: (value: string) => void;
  channelCounts: Record<ChannelFilter, number>;
  statusCounts: Array<{ status: LeadStatus; count: number }>;
  industryCounts: Array<{ key: string; label: string; count: number }>;
  locatedCount: number;
  totalCount: number;
  missingLeads: MapLead[];
  onOpenLead: (leadId: string) => void;
}) {
  const [openPopover, setOpenPopover] = useState<"status" | "industry" | "missing" | "legend" | null>(null);
  const close = useCallback(() => setOpenPopover(null), []);

  const toggleStatus = (status: LeadStatus) => {
    const next = filters.statuses.includes(status)
      ? filters.statuses.filter((s) => s !== status)
      : [...filters.statuses, status];
    onChange({ ...filters, statuses: next });
  };

  const toggleIndustry = (key: string) => {
    const next = filters.industries.includes(key)
      ? filters.industries.filter((i) => i !== key)
      : [...filters.industries, key];
    onChange({ ...filters, industries: next });
  };

  const missingCount = missingLeads.length;

  return (
    <div
      // Kein rechtes Padding an der Leiste: der Sticky-Block am Ende bekaeme sonst
      // 20px Luft zum Rand, durch die die darunter scrollenden Chips durchschauen.
      // Das Padding traegt stattdessen der Sticky-Block selbst (pr-5).
      className="touch-scroll flex shrink-0 items-center gap-3 overflow-x-auto border-b pl-5"
      style={{ height: 52, background: "var(--surface)", borderColor: "var(--border)", flexWrap: "nowrap" }}
    >
      <h1 className="shrink-0 text-sm font-bold" style={{ color: "var(--text)" }}>
        Karte
      </h1>

      {/* Suche — rein clientseitig, kein Netz-Call */}
      <div className="relative shrink-0" style={{ width: 200 }}>
        <Search
          className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2"
          style={{ color: "var(--text-3)" }}
        />
        <input
          type="search"
          value={searchInput}
          onChange={(event) => onSearchInput(event.target.value)}
          placeholder="Firma oder Adresse"
          aria-label="Leads durchsuchen"
          className="map-chip w-full rounded-lg border pl-8 pr-2 text-[11px] outline-none"
          style={{
            background: "var(--surface-2)",
            borderColor: "var(--border)",
            color: "var(--text)",
          }}
        />
      </div>

      {/* Kanal-Segmented */}
      <div
        className="inline-flex shrink-0 rounded-lg border p-0.5"
        style={{ background: "var(--surface-2)", borderColor: "var(--border)" }}
      >
        {CHANNEL_OPTIONS.map((option) => {
          const active = filters.channel === option;
          return (
            <button
              key={option}
              type="button"
              onClick={() => onChange({ ...filters, channel: option })}
              className="map-segment inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[11px] font-bold transition-colors"
              style={{
                background: active ? "var(--accent)" : "transparent",
                color: active ? "var(--bg)" : "var(--text-2)",
              }}
            >
              {option === "ALL" ? "Alle" : ACQUISITION_TYPE_LABELS[option]}
              <span
                className="rounded-full px-1.5 text-[10px] font-bold"
                style={{
                  background: active ? "rgba(0,0,0,0.18)" : "var(--surface-3)",
                  color: active ? "var(--bg)" : "var(--text-3)",
                }}
              >
                {channelCounts[option] ?? 0}
              </span>
            </button>
          );
        })}
      </div>

      {/* Status */}
      <Popover
        open={openPopover === "status"}
        onClose={close}
        width={240}
        trigger={
          <ChipButton
            active={filters.statuses.length > 0 || openPopover === "status"}
            onClick={() => setOpenPopover(openPopover === "status" ? null : "status")}
          >
            Status
            {filters.statuses.length > 0 && <CountPill value={filters.statuses.length} />}
            <ChevronDown className="h-3 w-3" />
          </ChipButton>
        }
      >
        {statusCounts.length === 0 ? (
          <p className="px-2 py-2 text-[11px]" style={{ color: "var(--text-3)" }}>
            Keine Leads geladen.
          </p>
        ) : (
          statusCounts.map(({ status, count }) => (
            <CheckRow
              key={status}
              checked={filters.statuses.includes(status)}
              onToggle={() => toggleStatus(status)}
              label={STATUS_LABELS[status] ?? status}
              count={count}
              dotColor={(STATUS_STYLES[status] ?? STATUS_STYLES.NEW).tx}
            />
          ))
        )}
      </Popover>

      {/* Branche */}
      <Popover
        open={openPopover === "industry"}
        onClose={close}
        width={240}
        trigger={
          <ChipButton
            active={filters.industries.length > 0 || openPopover === "industry"}
            onClick={() => setOpenPopover(openPopover === "industry" ? null : "industry")}
          >
            Branche
            {filters.industries.length > 0 && <CountPill value={filters.industries.length} />}
            <ChevronDown className="h-3 w-3" />
          </ChipButton>
        }
      >
        {industryCounts.length === 0 ? (
          <p className="px-2 py-2 text-[11px]" style={{ color: "var(--text-3)" }}>
            Keine Leads geladen.
          </p>
        ) : (
          industryCounts.map(({ key, label, count }) => (
            <CheckRow
              key={key}
              checked={filters.industries.includes(key)}
              onToggle={() => toggleIndustry(key)}
              label={label}
              count={count}
            />
          ))
        )}
      </Popover>

      <ChipButton
        active={filters.onlyRecent}
        onClick={() => onChange({ ...filters, onlyRecent: !filters.onlyRecent })}
        title="Blendet Leads aus, die seit über 30 Tagen keinen Kontakt hatten"
      >
        Nur aktuell (30 T.)
      </ChipButton>

      <div className="flex-1" style={{ minWidth: 8 }} />

      {/*
        Zaehler und Legende kleben am rechten Rand. Auf Touch scrollt die
        Steuerleiste horizontal — ohne `sticky` waere ausgerechnet der blinde
        Fleck ("11 ohne Standort") das Erste, was aus dem Bild rutscht.
      */}
      <div className="map-controls-sticky flex shrink-0 items-center gap-3 pr-5">
      {/* Zaehler — zugleich Einstieg in "Ohne Standort" */}
      <Popover
        open={openPopover === "missing"}
        onClose={close}
        align="right"
        width={360}
        trigger={
          <button
            type="button"
            disabled={missingCount === 0}
            onClick={() => setOpenPopover(openPopover === "missing" ? null : "missing")}
            className="map-chip inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-3 text-[11px] transition-colors disabled:cursor-default"
            style={{
              background: "var(--surface-2)",
              borderColor: "var(--border)",
              color: missingCount === 0 ? "var(--text-3)" : "var(--text-2)",
            }}
          >
            <span className="font-mono font-bold" style={{ color: missingCount === 0 ? "var(--text-3)" : "var(--text)" }}>
              {locatedCount}
            </span>
            {/* Kompakt ("0/38") unter 1536px: der Block klebt am rechten Rand. In
                Langform frass er am Handy ~70 % der Leiste (89px fuer die Filter),
                und bei 1440px mit offener Sidebar verschwand "Nur aktuell" darunter. */}
            <span className="hidden 2xl:inline">von {totalCount} verortet</span>
            <span className="-ml-1.5 font-mono 2xl:hidden">/{totalCount}</span>
            {missingCount > 0 && (
              <>
                <span style={{ color: "var(--status-planned-tx)" }}>{missingCount} ohne</span>
                <ChevronDown className="h-3 w-3" />
              </>
            )}
          </button>
        }
      >
        <MissingList
          leads={missingLeads}
          onOpenLead={(leadId) => {
            // Sonst stuende das Popover (z-index 1200) ueber dem Lead-Modal.
            close();
            onOpenLead(leadId);
          }}
        />
      </Popover>

      {/* Legende */}
      <Popover
        open={openPopover === "legend"}
        onClose={close}
        align="right"
        width={260}
        trigger={
          <ChipButton
            active={openPopover === "legend"}
            onClick={() => setOpenPopover(openPopover === "legend" ? null : "legend")}
            ariaLabel="Legende"
          >
            <Info className="h-3.5 w-3.5 2xl:hidden" aria-hidden />
            <span className="hidden 2xl:inline">Legende</span>
          </ChipButton>
        }
      >
        <Legend />
      </Popover>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ Ohne Standort */

/**
 * Kopfzeile nach GRUND getrennt. Frueher stand hier pauschal "X Leads ohne
 * Adresse — ergänzen", auch fuer Leads, die eine Adresse haben und nur noch
 * nicht verortet wurden. Die Aufforderung zum Ergaenzen schickte den Nutzer
 * dann an die falsche Stelle. "Ergänzen" steht nur noch dort, wo es hilft.
 */
function missingSummary(leads: MapLead[]): string {
  const count = (reasons: string[]) =>
    leads.filter((lead) => reasons.includes(missingLocationReason(lead))).length;

  const fixable = count(["keine Adresse", "nicht gefunden"]);
  const pending = count(["noch nicht geprüft"]);
  const failed = count(["Abfrage fehlgeschlagen"]);

  const parts: string[] = [];
  if (fixable > 0) {
    parts.push(
      `${fixable} ohne auffindbare Adresse — ergänzen oder korrigieren, dann erscheinen sie auf der Karte.`,
    );
  }
  if (pending > 0) {
    parts.push(`${pending} noch nicht verortet — die Adresse ist da, sie wurde nur noch nicht abgefragt.`);
  }
  if (failed > 0) {
    parts.push(`${failed} konnten wegen eines Abfragefehlers nicht verortet werden.`);
  }
  return parts.join(" ");
}

export function MissingList({
  leads,
  onOpenLead,
}: {
  leads: MapLead[];
  onOpenLead: (leadId: string) => void;
}) {
  if (leads.length === 0) {
    return (
      <p className="px-2 py-3 text-[11px]" style={{ color: "var(--text-3)" }}>
        Alle Leads sind verortet.
      </p>
    );
  }

  return (
    <div>
      <p className="px-2 pb-2 pt-1 text-[11px]" style={{ color: "var(--text-2)" }}>
        {missingSummary(leads)}
      </p>
      <ul>
        {leads.map((lead) => (
          <li
            key={lead.id}
            className="flex items-center justify-between gap-2 rounded-lg px-2"
            style={{ height: 56 }}
          >
            <span className="min-w-0">
              <span className="block truncate text-[12px] font-semibold" style={{ color: "var(--text)" }}>
                {lead.companyName}
              </span>
              <span
                className="mt-1 inline-flex rounded px-1.5 py-0.5 text-[10px]"
                style={{ background: "var(--surface-3)", color: "var(--text-3)" }}
              >
                {missingLocationReason(lead)}
              </span>
            </span>
            <button
              type="button"
              onClick={() => onOpenLead(lead.id)}
              className="shrink-0 rounded-lg px-3 text-[11px] font-semibold transition-colors hover:bg-[var(--surface-3)]"
              style={{ height: 44, color: "var(--accent)" }}
            >
              Öffnen
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------------ Legende */

const LEGEND_STATUSES: Array<{ status: LeadStatus; label: string }> = [
  { status: "NEW", label: "Neu / Recherchiert" },
  { status: "TO_CONTACT", label: "Geplant / Follow-up" },
  { status: "CONTACTED", label: "Kontaktiert / Antwort" },
  { status: "INTERESTED", label: "Interessiert / Gewonnen" },
  { status: "LOST", label: "Verloren" },
  { status: "NOT_RELEVANT", label: "Nicht relevant" },
];

function Legend() {
  return (
    <div className="flex flex-col gap-3 px-2 py-1">
      <div>
        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-3)" }}>
          Status
        </p>
        <ul className="flex flex-col gap-1">
          {LEGEND_STATUSES.map(({ status, label }) => (
            <li key={status} className="flex items-center gap-2 text-[11px]" style={{ color: "var(--text-2)" }}>
              <span
                className="shrink-0 rounded-full"
                style={{ width: 10, height: 10, background: (STATUS_STYLES[status] ?? STATUS_STYLES.NEW).tx }}
              />
              {label}
            </li>
          ))}
        </ul>
      </div>

      <div>
        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-3)" }}>
          Kanal
        </p>
        <ul className="flex flex-col gap-1">
          <li className="flex items-center gap-2 text-[11px]" style={{ color: "var(--text-2)" }}>
            <span
              className="shrink-0 rounded-full"
              style={{ width: 10, height: 10, background: "var(--text-2)", boxShadow: "0 0 0 1px var(--bg), 0 0 0 3px var(--bg)" }}
            />
            Cold Call — Kreis
          </li>
          <li className="flex items-center gap-2 text-[11px]" style={{ color: "var(--text-2)" }}>
            <span
              className="shrink-0"
              style={{
                width: 10,
                height: 10,
                borderRadius: "var(--r-sm)",
                background: "var(--text-2)",
                boxShadow: "0 0 0 1px var(--bg), 0 0 0 3px var(--text)",
              }}
            />
            Walk-In — Quadrat
          </li>
          <li className="flex items-center gap-2 text-[11px]" style={{ color: "var(--text-2)" }}>
            <span
              className="shrink-0 rounded-full"
              style={{
                width: 10,
                height: 10,
                background: "var(--text-2)",
                boxShadow: "0 0 0 1px var(--bg), 0 0 0 3px var(--channel-dm-tx)",
              }}
            />
            Instagram DM — Kreis mit Ring
          </li>
          <li className="flex items-center gap-2 text-[11px]" style={{ color: "var(--text-2)" }}>
            <span
              className="shrink-0 rounded-full"
              style={{
                width: 10,
                height: 10,
                background: "var(--text-2)",
                boxShadow: "0 0 0 1px var(--bg), 0 0 0 3px #F59E0B",
              }}
            />
            E-Mail — Kreis mit Goldring
          </li>
        </ul>
      </div>

      <div>
        <ul className="flex flex-col gap-1.5">
          <li className="flex items-center gap-2 text-[11px]" style={{ color: "var(--text-2)" }}>
            <span
              className="shrink-0 rounded-full"
              style={{ width: 12, height: 12, border: "1.5px dashed var(--text-2)", opacity: 0.6 }}
            />
            gestrichelt = ungefähre Lage
          </li>
          <li className="flex items-center gap-2 text-[11px]" style={{ color: "var(--text-2)" }}>
            <span
              className="shrink-0 rounded-full"
              style={{ width: 10, height: 10, background: "var(--text-2)", opacity: 0.45 }}
            />
            blass = &gt;30 Tage kein Kontakt
          </li>
          <li className="flex items-center gap-2 text-[11px]" style={{ color: "var(--text-2)" }}>
            <span
              className="inline-flex shrink-0 items-center justify-center rounded-full font-mono text-[9px] font-bold"
              style={{
                width: 16,
                height: 16,
                background: "var(--surface-3)",
                border: "1.5px solid var(--border-2)",
                color: "var(--text)",
              }}
            >
              5
            </span>
            mehrere Leads an einer Adresse
          </li>
        </ul>
      </div>
    </div>
  );
}

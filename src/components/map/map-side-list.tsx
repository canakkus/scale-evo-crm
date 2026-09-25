"use client";

import { useEffect, useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatDistance } from "@/lib/distance";
import { MissingList } from "./map-controls";
import { ChannelBadge } from "./map-lead-summary";
import type { LocatedLead, MapLead } from "./map-types";

export type SheetStage = "peek" | "half" | "full";

const SHEET_HEIGHT: Record<SheetStage, string> = {
  peek: "64px",
  half: "45dvh",
  full: "85dvh",
};

const NEXT_STAGE: Record<SheetStage, SheetStage> = {
  peek: "half",
  half: "full",
  full: "peek",
};

/* --------------------------------------------------------------- Listenzeile */

function LeadRow({
  lead,
  active,
  onHover,
  onSelect,
  rowRef,
}: {
  lead: LocatedLead;
  active: boolean;
  onHover: (hovering: boolean) => void;
  onSelect: () => void;
  rowRef: (node: HTMLLIElement | null) => void;
}) {
  const distance = formatDistance(lead.distanceKm);
  return (
    <li ref={rowRef}>
      <button
        type="button"
        onMouseEnter={() => onHover(true)}
        onMouseLeave={() => onHover(false)}
        onFocus={() => onHover(true)}
        onBlur={() => onHover(false)}
        onClick={onSelect}
        className="flex w-full items-center gap-2 px-4 text-left transition-colors"
        style={{
          height: 56,
          background: active ? "var(--surface-2)" : "transparent",
          opacity: lead.stale ? 0.7 : 1,
        }}
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-semibold" style={{ color: "var(--text)" }}>
            {lead.companyName}
          </span>
          <span className="block truncate text-[11px]" style={{ color: "var(--text-2)" }}>
            {[lead.industry, distance].filter(Boolean).join(" · ") || "—"}
            {lead.approximate && (
              <span style={{ color: "var(--status-planned-tx)" }}> · ungefähr</span>
            )}
          </span>
        </span>
        <span className="flex shrink-0 flex-col items-end" style={{ gap: 2 }}>
          <StatusBadge status={lead.status} />
          <ChannelBadge type={lead.acquisitionType} />
        </span>
      </button>
    </li>
  );
}

/* ------------------------------------------------------------------- Liste */

export function MapLeadList({
  leads,
  hoveredKey,
  hoverSource,
  keyOf,
  onHover,
  onSelect,
}: {
  leads: LocatedLead[];
  hoveredKey: string | null;
  hoverSource: "map" | "list" | null;
  keyOf: (lead: LocatedLead) => string;
  onHover: (key: string | null, source: "list") => void;
  onSelect: (key: string) => void;
}) {
  const rowsRef = useRef(new Map<string, HTMLLIElement>());

  // Pin -> Zeile: nur scrollen, wenn der Hover von der Karte kommt. Sonst
  // wuerde die Liste unter dem Mauszeiger wegrutschen, waehrend man sie liest.
  useEffect(() => {
    if (hoverSource !== "map" || !hoveredKey) return;
    const row = rowsRef.current.get(hoveredKey);
    row?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [hoveredKey, hoverSource]);

  if (leads.length === 0) {
    return (
      <p className="px-4 py-6 text-center text-[11px]" style={{ color: "var(--text-3)" }}>
        Keine Leads für diese Filter.
      </p>
    );
  }

  return (
    <ul>
      {leads.map((lead) => {
        const key = keyOf(lead);
        return (
          <LeadRow
            key={lead.id}
            lead={lead}
            active={key === hoveredKey}
            onHover={(hovering) => onHover(hovering ? key : null, "list")}
            onSelect={() => onSelect(key)}
            rowRef={(node) => {
              if (node) rowsRef.current.set(key, node);
              else rowsRef.current.delete(key);
            }}
          />
        );
      })}
    </ul>
  );
}

/* ---------------------------------------------------------- Desktop-Panel */

export function MapSidePanel({
  collapsed,
  onToggle,
  count,
  children,
}: {
  collapsed: boolean;
  onToggle: () => void;
  count: number;
  children: React.ReactNode;
}) {
  if (collapsed) {
    return (
      <div
        className="flex shrink-0 flex-col items-center border-l"
        style={{ width: 32, background: "var(--surface)", borderColor: "var(--border)" }}
      >
        <button
          type="button"
          onClick={onToggle}
          aria-label="Liste einblenden"
          className="flex w-full items-center justify-center transition-colors hover:bg-[var(--surface-2)]"
          style={{ height: 44, color: "var(--text-2)" }}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span
          className="mt-2 whitespace-nowrap text-[11px] font-semibold"
          style={{ color: "var(--text-3)", writingMode: "vertical-rl" }}
        >
          Liste ({count})
        </span>
      </div>
    );
  }

  return (
    <aside
      className="flex shrink-0 flex-col border-l"
      style={{ width: "var(--map-panel-w)", background: "var(--surface)", borderColor: "var(--border)" }}
    >
      <div
        className="flex shrink-0 items-center justify-between border-b px-4"
        style={{ height: 44, borderColor: "var(--border)" }}
      >
        <span className="text-[11px] font-semibold" style={{ color: "var(--text-2)" }}>
          Liste ({count}) · nach Entfernung
        </span>
        <button
          type="button"
          onClick={onToggle}
          aria-label="Liste ausblenden"
          className="inline-flex items-center justify-center rounded-lg transition-colors hover:bg-[var(--surface-2)]"
          style={{ width: 28, height: 28, color: "var(--text-3)" }}
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      <div className="touch-scroll min-h-0 flex-1 overflow-y-auto">{children}</div>
    </aside>
  );
}

/* ------------------------------------------------------------ Bottom-Sheet */

export function MapBottomSheet({
  stage,
  onStageChange,
  tab,
  onTabChange,
  leadCount,
  missingLeads,
  onOpenLead,
  children,
}: {
  stage: SheetStage;
  onStageChange: (stage: SheetStage) => void;
  tab: "leads" | "missing";
  onTabChange: (tab: "leads" | "missing") => void;
  leadCount: number;
  missingLeads: MapLead[];
  onOpenLead: (leadId: string) => void;
  children: React.ReactNode;
}) {
  return (
    <div
      /*
        z-[1100] gilt NUR innerhalb des isolierten Kartencontainers
        (map-shell.tsx: `isolate z-0`). Der Wert muss Leaflets Popup-Pane (700)
        schlagen, nicht die App-Chrome: gegenueber Sidebar-FAB (z-40), Sidebar
        (z-50) und LeadDetailModal (z-50) liegt das Sheet als Teil des
        Containers auf z-0 und damit darunter. Genau so muss es sein — sonst
        verdeckt der 64px-Peek am Handy den FAB, und die Navigation weg von
        /map waere nicht mehr erreichbar.
      */
      className="absolute inset-x-0 bottom-0 z-[1100] flex flex-col"
      style={{
        height: SHEET_HEIGHT[stage],
        background: "var(--surface)",
        borderTop: "1px solid var(--border)",
        borderTopLeftRadius: "var(--r-2xl)",
        borderTopRightRadius: "var(--r-2xl)",
        boxShadow: "var(--shadow-lg)",
        transition: "height var(--dur) var(--ease)",
        // In der Peek-Stufe (64px) wird die Tab-Zeile angeschnitten — sie soll
        // sauber abgeschnitten werden statt aus dem Sheet herauszuragen.
        overflow: "hidden",
      }}
    >
      {/* Drei feste Stufen per Tap — bewusst keine Drag-Physik. */}
      <button
        type="button"
        onClick={() => onStageChange(NEXT_STAGE[stage])}
        aria-label={`Liste ${stage === "full" ? "einklappen" : "vergrößern"}`}
        className="flex w-full shrink-0 items-center justify-center"
        style={{ height: 44 }}
      >
        <span
          style={{ width: 36, height: 4, borderRadius: "var(--r-full)", background: "var(--border-2)" }}
        />
      </button>

      <div className="flex shrink-0 gap-1 px-4 pb-2">
        <SheetTab active={tab === "leads"} onClick={() => onTabChange("leads")}>
          Leads ({leadCount})
        </SheetTab>
        <SheetTab active={tab === "missing"} onClick={() => onTabChange("missing")}>
          Ohne Standort ({missingLeads.length})
        </SheetTab>
      </div>

      <div className="touch-scroll min-h-0 flex-1 overflow-y-auto">
        {tab === "leads" ? children : <MissingList leads={missingLeads} onOpenLead={onOpenLead} />}
      </div>
    </div>
  );
}

function SheetTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-lg px-3 text-[11px] font-semibold transition-colors"
      style={{
        minHeight: 44,
        background: active ? "var(--surface-3)" : "transparent",
        color: active ? "var(--text)" : "var(--text-2)",
      }}
    >
      {children}
    </button>
  );
}

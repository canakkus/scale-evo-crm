"use client";

import { Phone, Navigation, X } from "lucide-react";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatDistance } from "@/lib/distance";
import { getMapsUrl } from "@/lib/maps-url";
import { ChannelBadge, MapLeadSummary } from "./map-lead-summary";
import type { LocatedLead, PinGroup } from "./map-types";

/* -------------------------------------------------------------------------
   Tooltip (Desktop, pointer-events: none)
   ------------------------------------------------------------------------- */

export function MapTooltipBody({ group }: { group: PinGroup }) {
  if (group.leads.length === 1) {
    return <MapLeadSummary lead={group.leads[0]} variant="tooltip" />;
  }

  const shown = group.leads.slice(0, 5);
  const rest = group.leads.length - shown.length;

  return (
    <div>
      <p className="text-[13px] font-semibold" style={{ color: "var(--text)" }}>
        {group.leads.length} Leads an dieser Adresse
      </p>
      <ul style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 4 }}>
        {shown.map((lead) => (
          <li key={lead.id} className="flex items-center justify-between" style={{ gap: 8 }}>
            <span className="text-[11px] truncate" style={{ color: "var(--text-2)" }}>
              {lead.companyName}
            </span>
            <StatusBadge status={lead.status} className="shrink-0" />
          </li>
        ))}
      </ul>
      {rest > 0 && (
        <p className="text-[10px]" style={{ color: "var(--text-3)", marginTop: 4 }}>
          und {rest} weitere
        </p>
      )}
      {group.approximate && (
        <p
          className="text-[10px]"
          style={{ color: "var(--status-planned-tx)", borderTop: "1px solid var(--border)", paddingTop: 6, marginTop: 6 }}
        >
          Ungefähre Lage — nur Stadt bekannt
        </p>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------
   Popup (Touch + Klick)
   ------------------------------------------------------------------------- */

const ACTION_BASE =
  "inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg text-[11px] font-semibold transition-colors";

function SecondaryAction({
  href,
  icon,
  label,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <a
      href={href}
      target={href.startsWith("tel:") ? undefined : "_blank"}
      rel="noreferrer"
      className={ACTION_BASE}
      style={{ background: "var(--surface-3)", color: "var(--text)", height: 44, minWidth: 44 }}
    >
      {icon}
      {label}
    </a>
  );
}

export function MapPopupBody({
  group,
  onOpenLead,
  onClose,
}: {
  group: PinGroup;
  onOpenLead: (leadId: string) => void;
  onClose: () => void;
}) {
  return (
    <div style={{ padding: "var(--sp-3)" }}>
      <div className="flex items-start justify-between" style={{ gap: 8 }}>
        <div className="min-w-0 flex-1">
          {group.leads.length === 1 ? (
            <MapLeadSummary lead={group.leads[0]} variant="popup" />
          ) : (
            <StackList group={group} onOpenLead={onOpenLead} />
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Schließen"
          className="shrink-0 inline-flex items-center justify-center rounded-lg transition-colors hover:bg-[var(--surface-3)]"
          style={{ width: 44, height: 44, marginTop: -8, marginRight: -8, color: "var(--text-3)" }}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {group.leads.length === 1 && (
        <SingleActions lead={group.leads[0]} onOpenLead={onOpenLead} />
      )}
    </div>
  );
}

function SingleActions({
  lead,
  onOpenLead,
}: {
  lead: LocatedLead;
  onOpenLead: (leadId: string) => void;
}) {
  /*
   * Bei exakter Lage ist die Koordinate das bessere Ziel: eine Textsuche kann
   * bei gleichnamigen Betrieben woanders landen als der Pin, den der Nutzer
   * gerade angetippt hat.
   *
   * Bei `approximate` ist es genau umgekehrt. Dort IST die Koordinate nur die
   * Stadtmitte — das Popup sagt zwei Zeilen darueber "Ungefaehre Lage". Sie als
   * Navigationsziel auf fuenf Nachkommastellen weiterzureichen, wuerde Oliver an
   * eine Adresse fahren lassen, die es nie gab. Dann lieber die Adress-Textsuche:
   * Google loest sie mit dem vollen Index auf, und bleibt sie mehrdeutig, sieht
   * der Nutzer eine Trefferliste statt einer erfundenen Gewissheit.
   */
  const routeUrl = getMapsUrl(lead, { preferCoordinates: !lead.approximate });

  return (
    <div
      className="flex"
      style={{
        gap: "var(--sp-2)",
        borderTop: "1px solid var(--border)",
        paddingTop: "var(--sp-3)",
        marginTop: "var(--sp-3)",
      }}
    >
      {/* Ohne Telefonnummer ersatzlos weg — ein toter Button ist eine Luege. */}
      {lead.phone && (
        <SecondaryAction href={`tel:${lead.phone}`} icon={<Phone className="h-3.5 w-3.5" />} label="Anrufen" />
      )}
      {routeUrl && (
        <SecondaryAction href={routeUrl} icon={<Navigation className="h-3.5 w-3.5" />} label="Route" />
      )}
      <button
        type="button"
        onClick={() => onOpenLead(lead.id)}
        className={ACTION_BASE}
        style={{ background: "var(--accent)", color: "var(--bg)", height: 44, minWidth: 44 }}
      >
        Lead öffnen
      </button>
    </div>
  );
}

function StackList({
  group,
  onOpenLead,
}: {
  group: PinGroup;
  onOpenLead: (leadId: string) => void;
}) {
  return (
    <div>
      <p className="text-[13px] font-semibold" style={{ color: "var(--text)" }}>
        {group.leads.length} Leads an dieser Adresse
      </p>
      {group.approximate && (
        <p className="text-[10px]" style={{ color: "var(--status-planned-tx)", marginTop: 2 }}>
          Ungefähre Lage — nur Stadt bekannt
        </p>
      )}
      <ul
        className="touch-scroll"
        style={{ marginTop: 8, maxHeight: 260, overflowY: "auto", display: "flex", flexDirection: "column", gap: 2 }}
      >
        {group.leads.map((lead) => (
          <li key={lead.id}>
            <button
              type="button"
              onClick={() => onOpenLead(lead.id)}
              className="flex w-full items-center justify-between rounded-lg px-2 text-left transition-colors hover:bg-[var(--surface-3)]"
              style={{ gap: 8, minHeight: 44 }}
            >
              <span className="min-w-0">
                <span className="block truncate text-[12px] font-semibold" style={{ color: "var(--text)" }}>
                  {lead.companyName}
                </span>
                <span className="block text-[10px]" style={{ color: "var(--text-3)" }}>
                  {[lead.industry, formatDistance(lead.distanceKm)].filter(Boolean).join(" · ") || "—"}
                </span>
              </span>
              <span className="flex shrink-0 flex-col items-end" style={{ gap: 2 }}>
                <StatusBadge status={lead.status} />
                <ChannelBadge type={lead.acquisitionType} />
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

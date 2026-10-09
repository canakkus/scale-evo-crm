"use client";

import type { AcquisitionType } from "@prisma/client";
import { ACQUISITION_TYPE_LABELS } from "@/lib/constants";
import { StatusBadge } from "@/components/ui/status-badge";
import { ScoreMeter } from "@/components/ui/score-meter";
import { formatDistance } from "@/lib/distance";
import { daysSinceContact, type LocatedLead } from "./map-types";

/**
 * Kanal-Badge auf Token-Basis. Bewusst ohne Emoji (Design-No-Go der Karte) und
 * ohne das in leads-table.tsx hartkodierte rgba(168,85,247,…) — dafuer gibt es
 * jetzt --channel-walkin-*. Das Nachziehen der Tabelle ist ein Folge-Ticket.
 */
const CHANNEL_TOKENS: Record<AcquisitionType, { bg: string; tx: string }> = {
  CALL: { bg: "var(--channel-call-bg)", tx: "var(--channel-call-tx)" },
  WALK_IN: { bg: "var(--channel-walkin-bg)", tx: "var(--channel-walkin-tx)" },
  DM: { bg: "var(--channel-dm-bg)", tx: "var(--channel-dm-tx)" },
  EMAIL: { bg: "rgba(245, 158, 11, 0.15)", tx: "#f59e0b" },
};

export function ChannelBadge({ type }: { type: AcquisitionType }) {
  const token = CHANNEL_TOKENS[type] ?? CHANNEL_TOKENS.CALL;
  return (
    <span
      className="inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-semibold tracking-wide"
      style={{ background: token.bg, color: token.tx }}
    >
      {ACQUISITION_TYPE_LABELS[type] ?? type}
    </span>
  );
}

function contactLine(lead: LocatedLead): { text: string; color: string } {
  const days = daysSinceContact(lead.lastContactAt);
  if (days === null) {
    return { text: "noch nie kontaktiert", color: "var(--status-planned-tx)" };
  }
  if (days <= 0) {
    return { text: "heute kontaktiert", color: "var(--text-3)" };
  }
  return {
    text: `zuletzt kontaktiert vor ${days} ${days === 1 ? "Tag" : "Tagen"}`,
    color: days > 30 ? "var(--status-planned-tx)" : "var(--text-3)",
  };
}

/**
 * Der eine Inhaltsblock fuer Tooltip (Desktop) und Popup (Touch). Zwei Huellen,
 * eine Reihenfolge — sonst laufen die beiden Ansichten auseinander.
 *
 * `variant`ist nicht kosmetisch: Leaflet-Tooltips sind `pointer-events: none`,
 * eine Telefonnummer darin waere ein Link, den niemand treffen kann.
 */
export function MapLeadSummary({
  lead,
  variant,
}: {
  lead: LocatedLead;
  variant: "tooltip" | "popup";
}) {
  const contact = contactLine(lead);
  const distance = formatDistance(lead.distanceKm);
  const metaParts = [lead.industry, distance].filter(Boolean) as string[];

  return (
    <div>
      <p
        className="text-[13px] font-semibold leading-snug"
        style={{ color: "var(--text)", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}
      >
        {lead.companyName}
      </p>

      <div className="flex flex-wrap items-center" style={{ gap: 4, marginTop: 6 }}>
        <StatusBadge status={lead.status} />
        <ChannelBadge type={lead.acquisitionType} />
      </div>

      {metaParts.length > 0 && (
        <p className="text-[11px]" style={{ color: "var(--text-2)", marginTop: 6 }}>
          {metaParts.join(" · ")}
        </p>
      )}

      {lead.phone &&
        (variant === "popup" ? (
          <a
            href={`tel:${lead.phone}`}
            className="block text-[11px] font-mono hover:underline"
            style={{ color: "var(--accent)", marginTop: 4 }}
          >
            {lead.phone}
          </a>
        ) : (
          <p className="text-[11px] font-mono" style={{ color: "var(--text-2)", marginTop: 4 }}>
            {lead.phone}
          </p>
        ))}

      <div className="flex items-center justify-between" style={{ gap: 8, marginTop: 6 }}>
        <span className="text-[11px]" style={{ color: contact.color }}>
          {contact.text}
        </span>
        <ScoreMeter score={lead.score} size="compact" />
      </div>

      {lead.approximate && (
        <p
          className="text-[10px]"
          style={{
            color: "var(--status-planned-tx)",
            borderTop: "1px solid var(--border)",
            paddingTop: 6,
            marginTop: 6,
          }}
        >
          Ungefähre Lage — nur Stadt bekannt
        </p>
      )}
    </div>
  );
}

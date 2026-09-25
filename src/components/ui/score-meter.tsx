"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { scoreTemp } from "@/lib/score-visuals";

export type ScoreReason = { key: string; label: string; points: number };

/**
 * 5-Segment-Meter statt Donut oder Fortschrittsbalken: klein genug fuer
 * eine Tabellenzeile, aber sofort als Rangfolge lesbar.
 */
export function ScoreMeter({
  score,
  size = "compact",
  approximate = false,
  reasons,
}: {
  score: number;
  size?: "compact" | "lg";
  approximate?: boolean;
  reasons?: ScoreReason[];
}) {
  const [open, setOpen] = useState(false);
  const temp = scoreTemp(score);
  const filled = score / 20;
  const canExpand = Boolean(reasons && reasons.length > 0);

  const segments = (
    <span className="inline-flex items-center" style={{ gap: 2 }}>
      {[0, 1, 2, 3, 4].map((index) => {
        const fill = Math.max(0, Math.min(1, filled - index));
        return (
          <span
            key={index}
            style={{
              width: 10,
              height: 6,
              borderRadius: 2,
              background: fill > 0 ? temp.tx : "var(--score-track)",
              opacity: fill > 0 && fill < 1 ? 0.35 : 1,
            }}
          />
        );
      })}
    </span>
  );

  const body = (
    <span className="inline-flex items-center gap-2">
      {segments}
      <span className="font-mono text-[13px] font-bold" style={{ color: temp.tx }}>
        {approximate ? "~" : ""}
        {score}
      </span>
      {size === "lg" && (
        <span className="text-[11px] font-semibold" style={{ color: temp.tx }}>
          {temp.label}
        </span>
      )}
      {canExpand && (
        <ChevronDown
          className="w-3 h-3 transition-transform"
          style={{ color: "var(--text-3)", transform: open ? "rotate(180deg)" : "none" }}
        />
      )}
    </span>
  );

  if (!canExpand) return body;

  return (
    <span className="inline-block">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="inline-flex items-center py-2 pr-1"
        title={approximate ? "Score auf unvollständiger Datenbasis" : "Begründung anzeigen"}
      >
        {body}
      </button>
      {open && (
        <span
          className="animate-fade-in mt-1 block rounded-lg p-3"
          style={{ background: "var(--surface-2)" }}
        >
          <span className="mb-2 block text-[10px] font-bold uppercase tracking-wide" style={{ color: "var(--text-3)" }}>
            Warum {score}?
          </span>
          {reasons!.map((reason) => (
            <span key={reason.key} className="flex justify-between text-xs py-0.5">
              <span style={{ color: "var(--text-2)" }}>{reason.label}</span>
              <span
                className="font-mono font-semibold"
                style={{ color: reason.points >= 0 ? "var(--status-warm-tx)" : "var(--status-lost-tx)" }}
              >
                {reason.points >= 0 ? "+" : "−"}
                {Math.abs(reason.points)}
              </span>
            </span>
          ))}
          <span
            className="mt-2 flex justify-between border-t pt-2 text-xs"
            style={{ borderColor: "var(--border)" }}
          >
            <span style={{ color: "var(--text-2)" }}>Summe</span>
            <span className="font-mono font-bold" style={{ color: "var(--text)" }}>
              {score}
            </span>
          </span>
        </span>
      )}
    </span>
  );
}

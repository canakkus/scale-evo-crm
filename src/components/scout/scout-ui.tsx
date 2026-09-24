"use client";

import type { ReactNode } from "react";
import { AlertTriangle, Check, Star, X } from "lucide-react";
import type { InstagramState, ScoutStepStatus } from "@/lib/lead-scout-types";

/**
 * Gemeinsame Bausteine fuer den Lead Scout.
 * Gewissheits-Grammatik: gefuellt = wissen wir · gestrichelt = wissen wir
 * nicht · Rot nur fuer echte Fehler/Duplikate. Nur bestehende Tokens.
 */

export type ChipTone = "chance" | "decide" | "fact" | "unknown" | "error" | "dm" | "danger";

const CHIP_STYLES: Record<ChipTone, React.CSSProperties> = {
  chance: { background: "var(--status-warm-bg)", color: "var(--status-warm-tx)" },
  decide: { background: "var(--status-planned-bg)", color: "var(--status-planned-tx)" },
  fact: { background: "var(--surface-3)", color: "var(--text-2)", border: "1px solid var(--border-2)" },
  unknown: { background: "transparent", color: "var(--text-3)", border: "1px dashed var(--border-2)", fontWeight: 600 },
  error: { background: "transparent", color: "var(--status-lost-tx)", border: "1px dashed var(--status-lost-tx)" },
  dm: { background: "var(--channel-dm-bg)", color: "var(--channel-dm-tx)" },
  danger: { background: "var(--status-lost-bg)", color: "var(--status-lost-tx)" },
};

export function Chip({
  tone,
  icon,
  title,
  children,
  mono = false,
}: {
  tone: ChipTone;
  icon?: ReactNode;
  title?: string;
  children: ReactNode;
  mono?: boolean;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold ${mono ? "font-mono" : ""}`}
      style={CHIP_STYLES[tone]}
      title={title}
    >
      {icon}
      {children}
    </span>
  );
}

const IG_FAILED_TOOLTIP =
  "DuckDuckGo/Bing hat blockiert oder nicht geantwortet — das heißt NICHT, dass es kein Profil gibt.";

export function IgStatusChip({ state, candidates = 0 }: { state: InstagramState; candidates?: number }) {
  if (state === "found") return <Chip tone="chance" icon={<Check className="w-3 h-3" />}>Eindeutig</Chip>;
  if (state === "choose") return <Chip tone="decide">Zur Auswahl ({candidates})</Chip>;
  if (state === "none") return <Chip tone="fact">Keins gefunden</Chip>;
  return <Chip tone="error" title={IG_FAILED_TOOLTIP}>IG-Suche fehlgeschlagen</Chip>;
}

/** Status-Pille der Standard-Kacheln. `labels` ueberschreibt den Text je Status. */
export function StepBadge({ status, labels }: { status: ScoutStepStatus; labels?: Partial<Record<ScoutStepStatus, string>> }) {
  const text = labels?.[status];
  if (status === "ok") return <span className="inline-flex items-center gap-1 rounded-full bg-emerald-950/60 px-2 py-0.5 text-[11px] font-bold text-emerald-300"><Check className="w-3 h-3" /> {text ?? "OK"}</span>;
  if (status === "warn") return <span className="inline-flex items-center gap-1 rounded-full bg-amber-950/60 px-2 py-0.5 text-[11px] font-bold text-amber-300"><AlertTriangle className="w-3 h-3" /> {text ?? "Prüfen"}</span>;
  if (status === "fail") return <span className="inline-flex items-center gap-1 rounded-full bg-red-950/60 px-2 py-0.5 text-[11px] font-bold text-red-300"><X className="w-3 h-3" /> {text ?? "Fehlt"}</span>;
  return <span className="inline-flex items-center gap-1 rounded-full bg-neutral-800 px-2 py-0.5 text-[11px] font-bold text-neutral-300">{text ?? "Übersprungen"}</span>;
}

export function Stars({ rating }: { rating: number | null }) {
  if (rating === null) return <span className="text-xs" style={{ color: "var(--text-3)" }}>–</span>;
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold">
      <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
      {rating.toFixed(1)}
    </span>
  );
}

/** Segment-Umschalter (Stil Leads-Filter / Kanal-Umschalter), 44px Tap-Target. */
export function Segment<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: T;
  options: Array<{ value: T; label: ReactNode; disabled?: boolean; title?: string }>;
  onChange: (value: T) => void;
  ariaLabel: string;
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="inline-flex flex-wrap rounded-xl border p-1"
      style={{ background: "var(--surface-2)", borderColor: "var(--border)" }}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            disabled={option.disabled}
            title={option.title}
            onClick={() => onChange(option.value)}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 text-xs font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-40"
            style={{
              minHeight: 44,
              background: active ? "var(--accent)" : "transparent",
              color: active ? "var(--bg)" : "var(--text-2)",
            }}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/** Preset-Chip im Tonalitaets-Stil (outreach), aktiv mit Haken. */
export function ToggleChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-lg border px-3 text-[11px] font-semibold"
      style={{
        minHeight: 44,
        background: active ? "var(--surface-3)" : "var(--surface-2)",
        color: active ? "var(--text)" : "var(--text-2)",
        borderColor: active ? "var(--border-2)" : "var(--border)",
      }}
    >
      {active && <Check className="h-3.5 w-3.5" />}
      {children}
    </button>
  );
}

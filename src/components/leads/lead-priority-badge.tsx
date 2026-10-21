"use client";

import { useState } from "react";
import { UserCheck, Sparkles, ChevronDown, RotateCcw, Loader2 } from "lucide-react";
import type { Priority, PrioritySource } from "@prisma/client";
import { PRIORITY_LABELS } from "@/lib/constants";
import { formatDate } from "@/lib/utils";

export type LeadPriorityBadgeProps = {
  leadId: string;
  priority: Priority;
  prioritySource?: PrioritySource | string;
  priorityRatedByName?: string | null;
  priorityRatedAt?: string | Date | null;
  variant?: "table" | "detail";
  onUpdate?: (newPriority: Priority, newSource: PrioritySource) => void;
};

const PRIORITY_THEMES: Record<Priority, { bg: string; tx: string; border: string }> = {
  HIGH: {
    bg: "rgba(239, 68, 68, 0.15)",
    tx: "#f87171",
    border: "rgba(239, 68, 68, 0.35)",
  },
  MEDIUM: {
    bg: "rgba(245, 158, 11, 0.15)",
    tx: "#fbbf24",
    border: "rgba(245, 158, 11, 0.35)",
  },
  LOW: {
    bg: "rgba(59, 130, 246, 0.15)",
    tx: "#60a5fa",
    border: "rgba(59, 130, 246, 0.35)",
  },
};

export function LeadPriorityBadge({
  leadId,
  priority: initialPriority,
  prioritySource: initialSource = "SYSTEM",
  priorityRatedByName,
  priorityRatedAt,
  variant = "table",
  onUpdate,
}: LeadPriorityBadgeProps) {
  const [currentPriority, setCurrentPriority] = useState<Priority>(initialPriority || "MEDIUM");
  const [currentSource, setCurrentSource] = useState<string>(initialSource);
  const [isOpen, setIsOpen] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  // Sync state if props change
  if (initialPriority !== currentPriority && !isUpdating) {
    setCurrentPriority(initialPriority);
    setCurrentSource(initialSource);
  }

  const isUserRated = currentSource === "USER";
  const theme = PRIORITY_THEMES[currentPriority] || PRIORITY_THEMES.MEDIUM;
  const label = PRIORITY_LABELS[currentPriority] || currentPriority;
  const raterName = priorityRatedByName || "User";

  async function handleSelect(newPriority: Priority) {
    if (newPriority === currentPriority && isUserRated) {
      setIsOpen(false);
      return;
    }

    setIsOpen(false);
    const prevPriority = currentPriority;
    const prevSource = currentSource;

    // Optimistic Update
    setCurrentPriority(newPriority);
    setCurrentSource("USER");
    setIsUpdating(true);

    try {
      const res = await fetch(`/api/leads/${leadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priority: newPriority }),
      });

      if (!res.ok) throw new Error("Fehler beim Aktualisieren der Priorität");
      onUpdate?.(newPriority, "USER" as PrioritySource);
    } catch (err) {
      console.error(err);
      setCurrentPriority(prevPriority);
      setCurrentSource(prevSource);
    } finally {
      setIsUpdating(false);
    }
  }

  async function handleReset() {
    setIsOpen(false);
    setIsUpdating(true);

    try {
      const res = await fetch(`/api/leads/${leadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resetPriorityToAuto: true }),
      });

      if (res.ok) {
        const payload = await res.json().catch(() => null);
        const updatedPrio = payload?.lead?.priority || "MEDIUM";
        const updatedSource = payload?.lead?.prioritySource || "SYSTEM";
        setCurrentPriority(updatedPrio);
        setCurrentSource(updatedSource);
        onUpdate?.(updatedPrio, updatedSource);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsUpdating(false);
    }
  }

  const tooltipText = isUserRated
    ? `Von ${raterName} gerated: ${label}${priorityRatedAt ? ` (${formatDate(priorityRatedAt)})` : ""}`
    : `Automatische System-Priorität (${label})`;

  if (variant === "detail") {
    return (
      <div className="space-y-2">
        <label className="block text-xs font-semibold" style={{ color: "var(--text-2)" }}>
          Priorität & Rating
        </label>
        <div className="relative">
          <div className="flex items-center gap-2">
            <select
              value={currentPriority}
              disabled={isUpdating}
              onChange={(e) => handleSelect(e.target.value as Priority)}
              className="rounded-md px-3 py-2 text-xs font-semibold border outline-none cursor-pointer transition-all"
              style={{
                background: theme.bg,
                color: theme.tx,
                borderColor: theme.border,
              }}
            >
              <option value="HIGH" className="bg-[var(--surface)] text-[var(--text)]">
                Hoch (High)
              </option>
              <option value="MEDIUM" className="bg-[var(--surface)] text-[var(--text)]">
                Mittel (Medium)
              </option>
              <option value="LOW" className="bg-[var(--surface)] text-[var(--text)]">
                Niedrig (Low)
              </option>
            </select>

            {isUpdating && <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--text-3)]" />}
          </div>

          {/* User Rated Info */}
          {isUserRated ? (
            <div className="mt-1.5 flex flex-col gap-0.5 text-[11px]">
              <span className="flex items-center gap-1.5 font-medium text-emerald-400">
                <UserCheck className="w-3.5 h-3.5 shrink-0" />
                <span>Von {raterName} gerated: <strong>{label}</strong></span>
              </span>
              {priorityRatedAt && (
                <span className="text-[10px] pl-5" style={{ color: "var(--text-3)" }}>
                  am {formatDate(priorityRatedAt)}
                </span>
              )}
              <button
                type="button"
                onClick={handleReset}
                disabled={isUpdating}
                className="mt-1 inline-flex items-center gap-1 text-[10px] text-left underline cursor-pointer hover:opacity-80 transition-opacity"
                style={{ color: "var(--text-3)" }}
              >
                <RotateCcw className="w-3 h-3" />
                <span>Auf Auto-Prio zurücksetzen</span>
              </button>
            </div>
          ) : (
            <div className="mt-1 flex items-center gap-1 text-[11px]" style={{ color: "var(--text-3)" }}>
              <Sparkles className="w-3 h-3 shrink-0 opacity-60" />
              <span>System- / Standard-Priorität</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Variant: table (interactive badge with dropdown)
  return (
    <div
      className="relative inline-flex flex-col items-start gap-0.5"
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        disabled={isUpdating}
        onClick={() => setIsOpen((prev) => !prev)}
        title={tooltipText}
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold border transition-all hover:scale-105 active:scale-95 cursor-pointer"
        style={{
          background: theme.bg,
          color: theme.tx,
          borderColor: theme.border,
        }}
      >
        {isUpdating ? (
          <Loader2 className="w-3 h-3 animate-spin shrink-0" />
        ) : isUserRated ? (
          <UserCheck className="w-3 h-3 shrink-0 text-emerald-400" />
        ) : (
          <Sparkles className="w-2.5 h-2.5 shrink-0 opacity-60" />
        )}
        <span>{label}</span>
        <ChevronDown className="w-2.5 h-2.5 opacity-60 ml-0.5" />
      </button>

      {/* Explicit User Rating text below badge */}
      {isUserRated && (
        <span
          className="text-[10px] font-medium leading-tight text-emerald-400 flex items-center gap-0.5 pl-0.5 whitespace-nowrap"
          title={tooltipText}
        >
          <span>von {raterName} gerated {label}</span>
        </span>
      )}

      {/* Dropdown Menu */}
      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />
          <div
            className="absolute left-0 top-full mt-1 z-50 w-44 rounded-lg border shadow-xl p-1.5 text-xs animate-fade-in"
            style={{
              background: "var(--surface)",
              borderColor: "var(--border)",
              color: "var(--text)",
            }}
          >
            <div
              className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider"
              style={{ color: "var(--text-3)" }}
            >
              Priorität setzen
            </div>

            {(["HIGH", "MEDIUM", "LOW"] as Priority[]).map((p) => {
              const pTheme = PRIORITY_THEMES[p];
              const pLabel = PRIORITY_LABELS[p];
              const isSelected = currentPriority === p;

              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => handleSelect(p)}
                  className="w-full flex items-center justify-between px-2 py-1.5 rounded-md text-left transition-colors hover:bg-[var(--surface-2)] cursor-pointer"
                >
                  <span className="flex items-center gap-1.5 font-medium">
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ background: pTheme.tx }}
                    />
                    <span>{pLabel}</span>
                  </span>
                  {isSelected && isUserRated && (
                    <UserCheck className="w-3 h-3 text-emerald-400 shrink-0" />
                  )}
                </button>
              );
            })}

            {isUserRated && (
              <>
                <div className="my-1 border-t" style={{ borderColor: "var(--border)" }} />
                <button
                  type="button"
                  onClick={handleReset}
                  className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded-md text-left transition-colors hover:bg-[var(--surface-2)] cursor-pointer"
                  style={{ color: "var(--text-3)" }}
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Auf Auto-Prio zurücksetzen</span>
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

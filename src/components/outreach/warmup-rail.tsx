"use client";

import type { WarmupState } from "@/lib/outreach-shared";

/**
 * Drei-Schritte-Leiste: folgen & liken -> reifen lassen -> DM.
 * Bewusst als Statusanzeige, nicht als Belehrung: Der Senden-Button wird
 * nie gesperrt, er verliert nur die Betonung, solange Schritt 1 offen ist.
 */
export function WarmupRail({
  state,
  dueAt,
  onFollowed,
  busy,
}: {
  state: WarmupState;
  dueAt: string | null;
  onFollowed: () => void;
  busy?: boolean;
}) {
  const steps = [
    { label: "Folgen & liken", done: state !== "todo", waiting: false },
    { label: "Reifen lassen", done: state === "ready", waiting: state === "waiting" },
    { label: "DM senden", done: false, waiting: false },
  ];

  function colorFor(step: { done: boolean; waiting: boolean }) {
    if (step.done) return "var(--warmup-done-tx)";
    if (step.waiting) return "var(--warmup-wait-tx)";
    return "var(--warmup-todo-tx)";
  }

  // Bewusst ein konkretes Datum statt eines Countdowns: Date.now() waehrend
  // des Renderings waere unrein und wuerde bei der Hydration abweichen.
  const readyAt = dueAt
    ? new Date(dueAt).toLocaleString("de-AT", {
        weekday: "short",
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  return (
    <div className="mb-3 rounded-lg px-3 py-2" style={{ background: "var(--surface-2)" }}>
      <div className="flex items-center">
        {steps.map((step, index) => (
          <div key={step.label} className="flex flex-1 items-center">
            <span
              style={{
                width: 10, height: 10, borderRadius: 999, flexShrink: 0,
                background: step.done || step.waiting ? colorFor(step) : "transparent",
                border: step.done || step.waiting ? "none" : `1.5px solid ${colorFor(step)}`,
              }}
            />
            <span className="ml-2 text-[11px] font-semibold" style={{ color: "var(--text-2)" }}>
              {step.label}
            </span>
            {index < steps.length - 1 && (
              <span
                className="mx-2 h-[1.5px] flex-1"
                style={{ background: steps[index + 1].done || steps[index + 1].waiting ? colorFor(steps[index + 1]) : "var(--border)" }}
              />
            )}
          </div>
        ))}
      </div>

      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        {state === "todo" && (
          <>
            <button
              onClick={onFollowed}
              disabled={busy}
              className="rounded-lg px-3 text-[11px] font-bold"
              style={{ minHeight: 36, background: "var(--accent)", color: "var(--bg)", opacity: busy ? 0.6 : 1 }}
            >
              Gefolgt &amp; geliked
            </button>
            <span className="text-[11px]" style={{ color: "var(--text-3)" }}>
              Ohne Warm-up landet die DM meist im Anfragen-Ordner.
            </span>
          </>
        )}
        {state === "waiting" && (
          <span className="text-[11px]" style={{ color: "var(--warmup-wait-tx)" }}>
            DM ab {readyAt} — dann wirkt sie nicht mehr aus dem Nichts.
          </span>
        )}
        {state === "ready" && (
          <span className="text-[11px]" style={{ color: "var(--warmup-done-tx)" }}>
            Warm-up abgeschlossen — jetzt ist der gute Zeitpunkt.
          </span>
        )}
      </div>
    </div>
  );
}

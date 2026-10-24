"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { addMonths, addWeeks, format } from "date-fns";
import { de } from "date-fns/locale";
import { ChevronLeft, ChevronRight, MoreHorizontal, Plus } from "lucide-react";
import { LeadDetailModal } from "@/components/leads/lead-detail-modal";
import { AppleSubscribe } from "@/components/calendar/apple-subscribe";
import { CallBoard } from "@/components/calendar/call-board";
import { PlanCallForm } from "@/components/calendar/plan-call-form";
import { cn } from "@/lib/utils";
import {
  PLANNED_CALL_TYPE_LABELS,
  defaultTimeOnDay,
  isSameLocalDay,
  loadWindow,
  monthCells,
  phoneToTelUri,
  weekCells,
  type PlannedCallDto,
  type PlannedCallStatus,
} from "@/lib/planned-call";

type ViewMode = "month" | "week" | "board";

const TYPE_STYLE: Record<PlannedCallDto["type"], { background: string; color: string }> = {
  COLD_CALL: { background: "var(--status-new-bg)", color: "var(--status-new-tx)" },
  MEETING: { background: "var(--status-contacted-bg)", color: "var(--status-contacted-tx)" },
  FOLLOW_UP: { background: "var(--status-planned-bg)", color: "var(--status-planned-tx)" },
};

async function updateStatus(id: string, status: PlannedCallStatus) {
  const res = await fetch(`/api/planned-calls/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Anruf konnte nicht geändert werden.");
  }
}

export function CalendarView() {
  const [mode, setMode] = useState<ViewMode>("month");
  const [today] = useState(() => new Date());
  const [cursor, setCursor] = useState(() => new Date());
  const [calls, setCalls] = useState<PlannedCallDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [form, setForm] = useState<{ startsAt?: Date; editing?: PlannedCallDto | null } | null>(null);
  const [selected, setSelected] = useState<PlannedCallDto | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [openLeadId, setOpenLeadId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { from, to } = loadWindow(cursor, mode);
      const params = new URLSearchParams({ from: from.toISOString(), to: to.toISOString() });
      const res = await fetch(`/api/planned-calls?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Anrufe konnten nicht geladen werden.");
      setCalls(data.calls || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Anrufe konnten nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }, [cursor, mode]);

  useEffect(() => {
    const timer = setTimeout(() => {
      load().catch(() => setError("Anrufe konnten nicht geladen werden."));
    }, 0);
    return () => clearTimeout(timer);
  }, [load]);

  const days = mode === "week" ? weekCells(cursor) : monthCells(cursor);
  const title = mode === "week"
    ? `${format(days[0]!, "d. MMM", { locale: de })} – ${format(days[6]!, "d. MMM yyyy", { locale: de })}`
    : format(cursor, "LLLL yyyy", { locale: de });

  const upcoming = useMemo(
    () => calls.filter((call) => call.status === "PLANNED").sort((a, b) => +new Date(a.startsAt) - +new Date(b.startsAt)).slice(0, 8),
    [calls],
  );

  function shift(direction: -1 | 1) {
    setCursor((current) => (mode === "week" ? addWeeks(current, direction) : addMonths(current, direction)));
  }

  async function changeStatus(id: string, status: PlannedCallStatus) {
    setError("");
    try {
      await updateStatus(id, status);
      setSelected(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Anruf konnte nicht geändert werden.");
    }
  }

  async function removeCall(id: string) {
    setError("");
    try {
      const res = await fetch(`/api/planned-calls/${id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Anruf konnte nicht gelöscht werden.");
      setSelected(null);
      setConfirmDelete(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Anruf konnte nicht gelöscht werden.");
    }
  }

  function callsOn(day: Date) {
    return calls.filter((call) => isSameLocalDay(new Date(call.startsAt), day));
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-2">
          {mode !== "board" && (
            <>
              <button type="button" aria-label="Zurück" onClick={() => shift(-1)} className="rounded-md border p-2" style={{ borderColor: "var(--border)", color: "var(--text)" }}>
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button type="button" onClick={() => setCursor(new Date())} className="rounded-md border px-3 py-2 text-xs font-semibold" style={{ borderColor: "var(--border)", color: "var(--text)" }}>
                Heute
              </button>
              <button type="button" aria-label="Weiter" onClick={() => shift(1)} className="rounded-md border p-2" style={{ borderColor: "var(--border)", color: "var(--text)" }}>
                <ChevronRight className="w-4 h-4" />
              </button>
              <h2 className="ml-1 text-sm font-semibold capitalize" style={{ color: "var(--text)" }}>{title}</h2>
            </>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border p-0.5" style={{ background: "var(--surface-2)", borderColor: "var(--border)" }} role="group" aria-label="Ansicht">
            {([
              ["month", "Monat"],
              ["week", "Woche"],
              ["board", "Board"],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={mode === value}
                onClick={() => setMode(value)}
                className={cn("rounded-md px-3 py-1.5 text-xs font-semibold", mode === value ? "shadow-sm" : "")}
                style={{ background: mode === value ? "var(--surface)" : "transparent", color: mode === value ? "var(--text)" : "var(--text-2)" }}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => {
              setSelected(null);
              setForm({ startsAt: defaultTimeOnDay(new Date()) });
            }}
            className="inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-xs font-semibold"
            style={{ background: "var(--accent)", color: "white" }}
          >
            <Plus className="w-4 h-4" />
            Anruf planen
          </button>
        </div>
      </div>

      <AppleSubscribe />

      {form && (
        <PlanCallForm
          editing={form.editing}
          defaultStartsAt={form.startsAt}
          onCancel={() => setForm(null)}
          onSaved={() => {
            setForm(null);
            load().catch(() => setError("Anrufe konnten nicht geladen werden."));
          }}
        />
      )}

      {error && <p className="text-xs" style={{ color: "var(--status-lost-tx)" }}>{error}</p>}

      {selected && (
        <section className="rounded-xl border p-4 space-y-3" aria-label="Anruf" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold" style={{ color: "var(--text)" }}>
                {selected.lead?.companyName || "Lead nicht verfügbar"}
              </h3>
              <p className="text-xs" style={{ color: "var(--text-2)" }}>
                {new Intl.DateTimeFormat("de-AT", { dateStyle: "full", timeStyle: "short" }).format(new Date(selected.startsAt))}
                {" · "}
                {PLANNED_CALL_TYPE_LABELS[selected.type]}
                {selected.reminderMinutes > 0 ? ` · Erinnerung ${selected.reminderMinutes} Min. vorher` : " · ohne Erinnerung"}
              </p>
              {selected.note && <p className="mt-1 text-xs" style={{ color: "var(--text-2)" }}>{selected.note}</p>}
              {selected.lead?.phone && phoneToTelUri(selected.lead.phone) && (
                <a href={phoneToTelUri(selected.lead.phone)!} className="mt-1 inline-block text-xs font-semibold" style={{ color: "var(--accent)" }}>
                  {selected.lead.phone}
                </a>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {selected.lead && (
                <button type="button" onClick={() => setOpenLeadId(selected.lead!.id)} className="rounded-md px-3 py-1.5 text-xs font-semibold" style={{ background: "var(--accent)", color: "white" }}>
                  Lead öffnen
                </button>
              )}
              {selected.status === "PLANNED" && (
                <button type="button" onClick={() => changeStatus(selected.id, "DONE")} className="rounded-md border px-3 py-1.5 text-xs font-semibold" style={{ borderColor: "var(--border)", color: "var(--status-warm-tx)" }}>
                  Erledigt
                </button>
              )}
              {selected.status === "PLANNED" && (
                <button type="button" onClick={() => changeStatus(selected.id, "CANCELLED")} className="rounded-md border px-3 py-1.5 text-xs font-semibold" style={{ borderColor: "var(--border)", color: "var(--status-lost-tx)" }}>
                  Absagen
                </button>
              )}
              {selected.status !== "PLANNED" && (
                <button type="button" onClick={() => changeStatus(selected.id, "PLANNED")} className="rounded-md border px-3 py-1.5 text-xs font-semibold" style={{ borderColor: "var(--border)", color: "var(--text)" }}>
                  Wieder planen
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setForm({ editing: selected });
                  setSelected(null);
                }}
                className="rounded-md border px-3 py-1.5 text-xs font-semibold"
                style={{ borderColor: "var(--border)", color: "var(--text)" }}
              >
                Bearbeiten
              </button>
              {confirmDelete ? (
                <button type="button" onClick={() => removeCall(selected.id)} className="rounded-md px-3 py-1.5 text-xs font-semibold" style={{ background: "var(--status-lost-tx)", color: "white" }}>
                  Wirklich löschen
                </button>
              ) : (
                <button type="button" onClick={() => setConfirmDelete(true)} className="rounded-md border px-3 py-1.5 text-xs font-semibold" style={{ borderColor: "var(--border)", color: "var(--text-2)" }}>
                  Löschen
                </button>
              )}
              <button type="button" onClick={() => { setSelected(null); setConfirmDelete(false); }} className="text-xs font-semibold" style={{ color: "var(--text-2)" }}>
                Schließen
              </button>
            </div>
          </div>
        </section>
      )}

      {loading ? (
        <p className="text-xs" style={{ color: "var(--text-3)" }}>Anrufe werden geladen…</p>
      ) : mode === "board" ? (
        <CallBoard
          calls={calls}
          onOpenLead={setOpenLeadId}
          onEdit={(call) => {
            setSelected(null);
            setForm({ editing: call });
          }}
          onStatus={changeStatus}
        />
      ) : (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
          <div className="overflow-hidden rounded-xl border" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
            <div className="grid grid-cols-7 border-b text-[11px] font-semibold" style={{ borderColor: "var(--border)", color: "var(--text-3)" }}>
              {["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"].map((label) => (
                <div key={label} className="px-2 py-2">{label}</div>
              ))}
            </div>
            <div className={cn("grid grid-cols-7", mode === "week" ? "min-h-[28rem]" : "")}>
              {days.map((day) => {
                const inMonth = day.getMonth() === cursor.getMonth();
                const dayCalls = callsOn(day);
                const visible = mode === "week" ? dayCalls : dayCalls.slice(0, 3);
                const hidden = dayCalls.length - visible.length;
                return (
                  <div
                    key={day.toISOString()}
                    className={cn("border-b border-r p-1.5", mode === "week" ? "min-h-80" : "min-h-28")}
                    style={{
                      borderColor: "var(--border)",
                      background: isSameLocalDay(day, today) ? "var(--surface-2)" : "var(--surface)",
                      opacity: mode === "month" && !inMonth ? 0.45 : 1,
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => setForm({ startsAt: defaultTimeOnDay(day) })}
                      className="mb-1 rounded px-1 text-xs font-semibold"
                      style={{ color: "var(--text)" }}
                      aria-label={`Anruf am ${format(day, "d. MMMM", { locale: de })} planen`}
                    >
                      {format(day, "d")}
                    </button>
                    <div className="space-y-1">
                      {visible.map((call) => (
                        <div key={call.id} className="flex overflow-hidden rounded" style={TYPE_STYLE[call.type]}>
                          <button
                            type="button"
                            onClick={() => call.lead && setOpenLeadId(call.lead.id)}
                            className={cn("min-w-0 flex-1 truncate px-1 py-0.5 text-left text-[11px] font-medium", call.status === "CANCELLED" && "line-through", call.status === "DONE" && "opacity-70")}
                            title={`${format(new Date(call.startsAt), "HH:mm")} ${call.lead?.companyName || "Lead"}`}
                          >
                            {format(new Date(call.startsAt), "HH:mm")} {call.lead?.companyName || "Lead"}
                          </button>
                          <button
                            type="button"
                            aria-label={`${call.lead?.companyName || "Anruf"} bearbeiten`}
                            onClick={() => {
                              setConfirmDelete(false);
                              setSelected(call);
                            }}
                            className="px-1"
                          >
                            <MoreHorizontal className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                      {hidden > 0 && (
                        <button type="button" onClick={() => { setCursor(day); setMode("week"); }} className="px-1 text-[11px] font-semibold" style={{ color: "var(--text-2)" }}>
                          +{hidden}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <aside className="rounded-xl border p-4" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
            <h2 className="text-sm font-semibold" style={{ color: "var(--text)" }}>Als Nächstes</h2>
            {upcoming.length === 0 ? (
              <p className="mt-3 text-xs" style={{ color: "var(--text-3)" }}>Keine geplanten Anrufe.</p>
            ) : (
              <ul className="mt-3 space-y-3">
                {upcoming.map((call) => {
                  const overdue = new Date(call.startsAt).getTime() < today.getTime() && !isSameLocalDay(new Date(call.startsAt), today);
                  return (
                    <li key={call.id} className="space-y-1">
                      <button type="button" onClick={() => call.lead && setOpenLeadId(call.lead.id)} className="text-left text-sm font-semibold hover:underline" style={{ color: "var(--text)" }}>
                        {call.lead?.companyName || "Lead"}
                      </button>
                      <p className="text-xs" style={{ color: overdue ? "var(--status-lost-tx)" : "var(--text-2)" }}>
                        {overdue ? "Überfällig · " : ""}
                        {format(new Date(call.startsAt), "EEE d. MMM, HH:mm", { locale: de })}
                      </p>
                      {call.note && <p className="text-xs" style={{ color: "var(--text-3)" }}>{call.note}</p>}
                    </li>
                  );
                })}
              </ul>
            )}
          </aside>
        </div>
      )}

      {openLeadId && (
        <LeadDetailModal leadId={openLeadId} onClose={() => setOpenLeadId(null)} onUpdate={() => { load().catch(() => undefined); }} />
      )}
    </div>
  );
}

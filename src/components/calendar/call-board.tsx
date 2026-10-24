"use client";

import { useState, type DragEvent } from "react";
import {
  BOARD_COLUMNS,
  PLANNED_CALL_TYPE_LABELS,
  boardColumnFor,
  phoneToTelUri,
  type BoardColumnId,
  type PlannedCallDto,
  type PlannedCallStatus,
} from "@/lib/planned-call";

type CallBoardProps = {
  calls: PlannedCallDto[];
  onOpenLead: (leadId: string) => void;
  onEdit: (call: PlannedCallDto) => void;
  onStatus: (id: string, status: PlannedCallStatus) => void;
};

export function CallBoard({ calls, onOpenLead, onEdit, onStatus }: CallBoardProps) {
  const [now] = useState(() => new Date());
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<BoardColumnId | null>(null);

  function onDrop(event: DragEvent, columnId: BoardColumnId) {
    event.preventDefault();
    setDragOver(null);
    setDraggedId(null);
    const id = event.dataTransfer.getData("text/plain");
    const call = calls.find((item) => item.id === id);
    const column = BOARD_COLUMNS.find((item) => item.id === columnId);
    if (!call || !column || call.status === column.dropStatus) return;
    onStatus(call.id, column.dropStatus);
  }

  return (
    <div className="space-y-3">
      <p className="text-xs" style={{ color: "var(--text-3)" }}>
        Heute und Überfällig ergeben sich aus der Uhrzeit. Ziehen ändert nur den Anruf, nicht den Lead.
      </p>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {BOARD_COLUMNS.map((column) => {
          const items = calls
            .filter((call) => boardColumnFor(call, now) === column.id)
            .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
          return (
            <section
              key={column.id}
              aria-label={column.label}
              className="w-72 shrink-0 flex flex-col max-h-[70vh] rounded-2xl"
              style={{ background: dragOver === column.id ? "var(--surface-2)" : "transparent" }}
              onDragOver={(event: DragEvent) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                if (dragOver !== column.id) setDragOver(column.id);
              }}
              onDragLeave={() => setDragOver(null)}
              onDrop={(event) => onDrop(event, column.id)}
            >
              <header className="px-3 py-3 flex items-baseline gap-2">
                <h3 className="text-sm font-medium" style={{ color: "var(--text)" }}>{column.label}</h3>
                <span className="text-xs" style={{ color: "var(--text-3)" }}>{items.length}</span>
              </header>
              <div className="flex-1 overflow-y-auto px-1 pb-3 space-y-2">
                {items.length === 0 ? (
                  <p className="px-3 text-xs text-center" style={{ color: "var(--text-3)" }}>Keine Anrufe</p>
                ) : (
                  items.map((call) => {
                    const when = new Date(call.startsAt);
                    const tel = call.lead?.phone ? phoneToTelUri(call.lead.phone) : null;
                    return (
                      <article
                        key={call.id}
                        draggable
                        onDragStart={(event) => {
                          event.dataTransfer.setData("text/plain", call.id);
                          event.dataTransfer.effectAllowed = "move";
                          setDraggedId(call.id);
                        }}
                        onDragEnd={() => {
                          setDraggedId(null);
                          setDragOver(null);
                        }}
                        className="rounded-xl border p-3 space-y-2 cursor-grab"
                        style={{
                          background: "var(--surface)",
                          borderColor: "var(--border)",
                          opacity: draggedId === call.id ? 0.55 : 1,
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => call.lead && onOpenLead(call.lead.id)}
                          disabled={!call.lead}
                          className="text-left text-sm font-semibold hover:underline disabled:no-underline"
                          style={{ color: "var(--text)" }}
                        >
                          {call.lead?.companyName || "Lead nicht verfügbar"}
                        </button>
                        <p className="text-xs" style={{ color: "var(--text-2)" }}>
                          {new Intl.DateTimeFormat("de-AT", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(when)}
                          {" · "}
                          {PLANNED_CALL_TYPE_LABELS[call.type]}
                          {call.reminderMinutes > 0 ? ` · ${call.reminderMinutes} Min.` : ""}
                        </p>
                        {tel && call.lead?.phone && (
                          <a href={tel} className="block text-xs font-medium" style={{ color: "var(--accent)" }}>
                            {call.lead.phone}
                          </a>
                        )}
                        {call.note && <p className="text-xs" style={{ color: "var(--text-2)" }}>{call.note}</p>}
                        <div className="flex flex-wrap gap-2 pt-1">
                          {call.lead && (
                            <button type="button" onClick={() => onOpenLead(call.lead!.id)} className="text-[11px] font-semibold" style={{ color: "var(--accent)" }}>
                              Lead öffnen
                            </button>
                          )}
                          {call.status === "PLANNED" && (
                            <button type="button" onClick={() => onStatus(call.id, "DONE")} className="text-[11px] font-semibold" style={{ color: "var(--status-warm-tx)" }}>
                              Erledigt
                            </button>
                          )}
                          {call.status === "PLANNED" && (
                            <button type="button" onClick={() => onStatus(call.id, "CANCELLED")} className="text-[11px] font-semibold" style={{ color: "var(--status-lost-tx)" }}>
                              Absagen
                            </button>
                          )}
                          {call.status !== "PLANNED" && (
                            <button type="button" onClick={() => onStatus(call.id, "PLANNED")} className="text-[11px] font-semibold" style={{ color: "var(--text-2)" }}>
                              Wieder planen
                            </button>
                          )}
                          <button type="button" onClick={() => onEdit(call)} className="text-[11px] font-semibold" style={{ color: "var(--text-2)" }}>
                            Bearbeiten
                          </button>
                        </div>
                      </article>
                    );
                  })
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

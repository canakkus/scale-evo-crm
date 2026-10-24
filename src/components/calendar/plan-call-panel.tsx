"use client";

import { useCallback, useEffect, useState } from "react";
import { Phone } from "lucide-react";
import { PlanCallForm } from "@/components/calendar/plan-call-form";
import { phoneToTelUri, type PlannedCallDto, type PlannedCallStatus } from "@/lib/planned-call";

async function patchCall(id: string, body: { status: PlannedCallStatus }) {
  const res = await fetch(`/api/planned-calls/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Anruf konnte nicht geändert werden.");
  }
}

export function PlanCallPanel({ leadId, leadName }: { leadId: string; leadName: string }) {
  const [open, setOpen] = useState(false);
  const [calls, setCalls] = useState<PlannedCallDto[]>([]);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const res = await fetch(`/api/planned-calls?leadId=${encodeURIComponent(leadId)}`);
    if (!res.ok) return;
    const data = await res.json();
    setCalls(data.calls || []);
  }, [leadId]);

  useEffect(() => {
    const timer = setTimeout(() => {
      load().catch(() => setError("Geplante Anrufe konnten nicht geladen werden."));
    }, 0);
    return () => clearTimeout(timer);
  }, [load]);

  async function setStatus(id: string, status: PlannedCallStatus) {
    setError("");
    try {
      await patchCall(id, { status });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Anruf konnte nicht geändert werden.");
    }
  }

  const planned = calls.filter((call) => call.status === "PLANNED");

  return (
    <div className="space-y-2 rounded-lg border p-3" style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-semibold" style={{ color: "var(--text)" }}>
          <Phone className="w-3.5 h-3.5" />
          <span>Cold Call</span>
        </div>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="text-xs font-semibold"
          style={{ color: "var(--accent)" }}
        >
          {open ? "Schließen" : "Call planen"}
        </button>
      </div>

      {planned.length > 0 && (
        <ul className="space-y-1.5">
          {planned.map((call) => {
            const when = new Date(call.startsAt);
            const tel = call.lead?.phone ? phoneToTelUri(call.lead.phone) : null;
            return (
              <li key={call.id} className="text-xs" style={{ color: "var(--text-2)" }}>
                <div className="font-medium" style={{ color: "var(--text)" }}>
                  {new Intl.DateTimeFormat("de-AT", { dateStyle: "medium", timeStyle: "short" }).format(when)}
                </div>
                {call.note && <p>{call.note}</p>}
                <div className="mt-1 flex flex-wrap gap-2">
                  {tel && (
                    <a href={tel} className="font-semibold" style={{ color: "var(--accent)" }}>
                      Anrufen
                    </a>
                  )}
                  <button type="button" onClick={() => setStatus(call.id, "DONE")} className="font-semibold" style={{ color: "var(--status-warm-tx)" }}>
                    Erledigt
                  </button>
                  <button type="button" onClick={() => setStatus(call.id, "CANCELLED")} className="font-semibold" style={{ color: "var(--status-lost-tx)" }}>
                    Absagen
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {error && <p className="text-xs" style={{ color: "var(--status-lost-tx)" }}>{error}</p>}

      {open && (
        <PlanCallForm
          leadId={leadId}
          leadName={leadName}
          onSaved={() => {
            setOpen(false);
            load().catch(() => setError("Geplante Anrufe konnten nicht geladen werden."));
          }}
          onCancel={() => setOpen(false)}
        />
      )}
    </div>
  );
}

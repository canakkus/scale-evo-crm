"use client";

import { useEffect, useState, type FormEvent } from "react";
import {
  DEFAULT_REMINDER_MINUTES,
  PLANNED_CALL_TYPE_LABELS,
  PLANNED_CALL_TYPES,
  REMINDER_PRESETS,
  defaultPlanTime,
  toDatetimeLocalValue,
  type PlannedCallDto,
  type PlannedCallType,
} from "@/lib/planned-call";

type LeadOption = { id: string; companyName: string; phone?: string | null };

type PlanCallFormProps = {
  leadId?: string;
  leadName?: string;
  editing?: PlannedCallDto | null;
  defaultStartsAt?: Date;
  onSaved: () => void;
  onCancel: () => void;
};

const REMINDER_LABELS: Record<(typeof REMINDER_PRESETS)[number], string> = {
  0: "Keine Erinnerung",
  5: "5 Minuten vorher",
  15: "15 Minuten vorher",
  30: "30 Minuten vorher",
  60: "1 Stunde vorher",
  120: "2 Stunden vorher",
};

export function PlanCallForm({ leadId, leadName, editing, defaultStartsAt, onSaved, onCancel }: PlanCallFormProps) {
  const lockedLead = Boolean(leadId);
  const [query, setQuery] = useState("");
  const [leads, setLeads] = useState<LeadOption[]>([]);
  const [selectedLeadId, setSelectedLeadId] = useState(editing?.leadId || leadId || "");
  const initialDate = editing ? new Date(editing.startsAt) : defaultStartsAt || defaultPlanTime();
  const pad = (n: number) => String(n).padStart(2, "0");
  const [datePart, setDatePart] = useState(
    `${initialDate.getFullYear()}-${pad(initialDate.getMonth() + 1)}-${pad(initialDate.getDate())}`
  );
  const [timePart, setTimePart] = useState(
    `${pad(initialDate.getHours())}:${pad(initialDate.getMinutes())}`
  );
  const [type, setType] = useState<PlannedCallType>(editing?.type || "COLD_CALL");
  const [reminderMinutes, setReminderMinutes] = useState(editing?.reminderMinutes ?? DEFAULT_REMINDER_MINUTES);
  const [note, setNote] = useState(editing?.note || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (lockedLead) return;
    const timer = setTimeout(() => {
      const params = new URLSearchParams({ limit: "20", sortBy: "updatedAt" });
      if (query.trim()) params.set("search", query.trim());
      fetch(`/api/leads?${params.toString()}`)
        .then((res) => res.json())
        .then((data) => {
          const found: LeadOption[] = data.leads || [];
          if (editing?.lead && !found.some((lead) => lead.id === editing.leadId)) {
            found.unshift({ id: editing.leadId, companyName: editing.lead.companyName, phone: editing.lead.phone });
          }
          setLeads(found);
        })
        .catch(() => setLeads([]));
    }, 250);
    return () => clearTimeout(timer);
  }, [query, lockedLead, editing]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (!selectedLeadId) {
      setError("Bitte einen Lead wählen.");
      return;
    }
    if (!datePart || !timePart) {
      setError("Datum und Uhrzeit sind erforderlich.");
      return;
    }
    const when = new Date(`${datePart}T${timePart}`);
    if (Number.isNaN(when.getTime())) {
      setError("Datum und Uhrzeit sind ungültig.");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        leadId: selectedLeadId,
        startsAt: when.toISOString(),
        type,
        note,
        reminderMinutes,
      };
      const res = await fetch(editing ? `/api/planned-calls/${editing.id}` : "/api/planned-calls", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Anruf konnte nicht gespeichert werden.");
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Anruf konnte nicht gespeichert werden.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border p-4 space-y-3" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold" style={{ color: "var(--text)" }}>
          {editing ? "Anruf bearbeiten" : "Anruf planen"}
        </h2>
        <button type="button" onClick={onCancel} className="text-xs font-medium" style={{ color: "var(--text-2)" }}>
          Abbrechen
        </button>
      </div>

      {lockedLead ? (
        <p className="text-sm font-medium" style={{ color: "var(--text)" }}>{leadName}</p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="block text-xs font-semibold" style={{ color: "var(--text-2)" }} htmlFor="plan-lead-search">
            Lead suchen
            <input
              id="plan-lead-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Firma oder Telefon"
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm outline-none"
              style={{ background: "var(--surface-2)", borderColor: "var(--border)", color: "var(--text)" }}
            />
          </label>
          <label className="block text-xs font-semibold" style={{ color: "var(--text-2)" }} htmlFor="plan-lead">
            Lead
            <select
              id="plan-lead"
              required
              value={selectedLeadId}
              onChange={(event) => setSelectedLeadId(event.target.value)}
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm outline-none"
              style={{ background: "var(--surface-2)", borderColor: "var(--border)", color: "var(--text)" }}
            >
              <option value="">Lead wählen</option>
              {leads.map((lead) => (
                <option key={lead.id} value={lead.id}>
                  {lead.companyName}{lead.phone ? ` · ${lead.phone}` : ""}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      <div className="grid gap-2 sm:grid-cols-4">
        <label className="block text-xs font-semibold" style={{ color: "var(--text-2)" }} htmlFor="plan-date">
          Datum
          <input
            id="plan-date"
            type="date"
            required
            value={datePart}
            onChange={(event) => setDatePart(event.target.value)}
            className="mt-1 w-full rounded-md border px-3 py-2 text-sm outline-none"
            style={{ background: "var(--surface-2)", borderColor: "var(--border)", color: "var(--text)" }}
          />
        </label>
        <label className="block text-xs font-semibold" style={{ color: "var(--text-2)" }} htmlFor="plan-time">
          Uhrzeit (24h)
          <input
            id="plan-time"
            type="time"
            step="60"
            required
            value={timePart}
            onChange={(event) => setTimePart(event.target.value)}
            className="mt-1 w-full rounded-md border px-3 py-2 text-sm outline-none"
            style={{ background: "var(--surface-2)", borderColor: "var(--border)", color: "var(--text)" }}
          />
        </label>
        <label className="block text-xs font-semibold" style={{ color: "var(--text-2)" }} htmlFor="plan-type">
          Art
          <select
            id="plan-type"
            value={type}
            onChange={(event) => setType(event.target.value as PlannedCallType)}
            className="mt-1 w-full rounded-md border px-3 py-2 text-sm outline-none"
            style={{ background: "var(--surface-2)", borderColor: "var(--border)", color: "var(--text)" }}
          >
            {PLANNED_CALL_TYPES.map((value) => (
              <option key={value} value={value}>{PLANNED_CALL_TYPE_LABELS[value]}</option>
            ))}
          </select>
        </label>
        <label className="block text-xs font-semibold" style={{ color: "var(--text-2)" }} htmlFor="plan-reminder">
          Erinnerung
          <select
            id="plan-reminder"
            value={reminderMinutes}
            onChange={(event) => setReminderMinutes(Number(event.target.value))}
            className="mt-1 w-full rounded-md border px-3 py-2 text-sm outline-none"
            style={{ background: "var(--surface-2)", borderColor: "var(--border)", color: "var(--text)" }}
          >
            {REMINDER_PRESETS.map((value) => (
              <option key={value} value={value}>{REMINDER_LABELS[value]}</option>
            ))}
          </select>
        </label>
      </div>

      <label className="block text-xs font-semibold" style={{ color: "var(--text-2)" }} htmlFor="plan-note">
        Notiz
        <input
          id="plan-note"
          value={note}
          maxLength={500}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Optional, z. B. nach 17 Uhr anrufen"
          className="mt-1 w-full rounded-md border px-3 py-2 text-sm outline-none"
          style={{ background: "var(--surface-2)", borderColor: "var(--border)", color: "var(--text)" }}
        />
      </label>

      {error && <p className="text-xs" style={{ color: "var(--status-lost-tx)" }}>{error}</p>}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={saving}
          className="rounded-md px-3 py-2 text-xs font-semibold disabled:opacity-60"
          style={{ background: "var(--accent)", color: "white" }}
        >
          {saving ? "Speichert…" : editing ? "Speichern" : "Anruf planen"}
        </button>
      </div>
    </form>
  );
}

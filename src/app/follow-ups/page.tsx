"use client";

import { useState, useEffect } from "react";
import { CalendarClock, Phone, Mail, Globe, Check, ArrowRight } from "lucide-react";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatDate } from "@/lib/utils";
import Link from "next/link";

export default function FollowUpsPage() {
  const [leads, setLeads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/leads?status=FOLLOW_UP&limit=100")
      .then((res) => res.json())
      .then((data) => setLeads(data.leads || []))
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  }, []);

  async function handleMarkContacted(leadId: string) {
    try {
      const res = await fetch(`/api/leads/${leadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "CONTACTED", lastContactAt: new Date() }),
      });
      if (res.ok) {
        setLeads((prev) => prev.filter((l) => l.id !== leadId));
      }
    } catch (err) {
      console.error(err);
    }
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="font-heading text-2xl font-bold tracking-tight" style={{ color: "var(--text)" }}>
          Follow-up Termine
        </h1>
        <p className="mt-1 text-xs" style={{ color: "var(--text-2)" }}>
          Leads, die ein Follow-up benötigen. Kontaktiere sie pünktlich und halte dein CRM aktuell.
        </p>
      </div>

      <div className="rounded-xl border overflow-hidden shadow-sm" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
        {loading ? (
          <div className="p-12 text-center text-xs" style={{ color: "var(--text-3)" }}>
            Follow-ups werden geladen…
          </div>
        ) : leads.length === 0 ? (
          <div className="p-12 text-center text-xs space-y-2" style={{ color: "var(--text-3)" }}>
            <CalendarClock className="w-8 h-8 mx-auto" />
            <p className="font-semibold text-sm" style={{ color: "var(--text)" }}>Keine anstehenden Follow-ups</p>
            <p>Du hast aktuell keine Leads im Status 'Follow-up'.</p>
          </div>
        ) : (
          <div className="divide-y" style={{ borderColor: "var(--border)" }}>
            {leads.map((lead) => (
              <div key={lead.id} className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-3">
                    <h3 className="font-bold text-sm" style={{ color: "var(--text)" }}>
                      {lead.companyName}
                    </h3>
                    <StatusBadge status={lead.status} />
                  </div>
                  <p className="text-xs" style={{ color: "var(--text-2)" }}>
                    {lead.industry || "Branche k.A."} · {lead.city || "—"} {lead.phone ? `· Tel: ${lead.phone}` : ""}
                  </p>
                  {lead.notes && (
                    <p className="text-xs italic pt-1" style={{ color: "var(--text-3)" }}>
                      "{lead.notes}"
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-xs font-semibold px-3 py-1 rounded-md" style={{ background: "var(--status-planned-bg)", color: "var(--status-planned-tx)" }}>
                    {lead.nextFollowUpAt ? formatDate(lead.nextFollowUpAt) : "Heute fällig"}
                  </span>

                  <button
                    onClick={() => handleMarkContacted(lead.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold"
                    style={{ background: "var(--accent)", color: "var(--bg)" }}
                  >
                    <Check className="w-3.5 h-3.5" />
                    Als kontaktiert markieren
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

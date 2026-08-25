"use client";

import { useState, useEffect, useCallback } from "react";
import { PIPELINE_STATUSES, STATUS_LABELS, NEXT_STATUS } from "@/lib/constants";
import { StatusBadge } from "@/components/ui/status-badge";
import { Phone, Globe, ChevronRight, Plus, MapPin, Star } from "lucide-react";
import type { LeadStatus } from "@prisma/client";

export function PipelineBoardComponent() {
  const [leads, setLeads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/leads?limit=100");
      if (res.ok) {
        const data = await res.json();
        setLeads(data.leads || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  async function handleAdvanceStatus(leadId: string, currentStatus: LeadStatus) {
    const next = NEXT_STATUS[currentStatus];
    if (!next) return;

    try {
      const res = await fetch(`/api/leads/${leadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });

      if (res.ok) {
        fetchLeads();
      }
    } catch (err) {
      console.error(err);
    }
  }

  async function handleSetStatus(leadId: string, status: LeadStatus) {
    try {
      const res = await fetch(`/api/leads/${leadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });

      if (res.ok) {
        fetchLeads();
      }
    } catch (err) {
      console.error(err);
    }
  }

  if (loading) {
    return (
      <div className="p-12 text-center text-xs" style={{ color: "var(--text-3)" }}>
        <div className="w-5 h-5 rounded-full border-2 border-t-transparent animate-spin mx-auto mb-2" style={{ borderColor: "var(--border-2)", borderTopColor: "var(--accent)" }} />
        Pipeline wird geladen…
      </div>
    );
  }

  return (
    <div className="flex gap-4 overflow-x-auto pb-6 min-h-[70vh]">
      {PIPELINE_STATUSES.map((statusKey) => {
        const columnLeads = leads.filter((l) => l.status === statusKey);
        return (
          <div
            key={statusKey}
            className="w-72 shrink-0 rounded-xl border flex flex-col max-h-[75vh]"
            style={{ background: "var(--surface)", borderColor: "var(--border)" }}
          >
            {/* Column Header */}
            <div className="p-3.5 border-b flex items-center justify-between shrink-0" style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}>
              <div className="flex items-center gap-2">
                <StatusBadge status={statusKey} />
                <span className="text-xs font-bold" style={{ color: "var(--text-2)" }}>
                  {columnLeads.length}
                </span>
              </div>
            </div>

            {/* Column Body */}
            <div className="flex-1 overflow-y-auto p-3 space-y-3">
              {columnLeads.length === 0 ? (
                <div className="p-6 text-center text-xs italic" style={{ color: "var(--text-3)" }}>
                  Keine Leads
                </div>
              ) : (
                columnLeads.map((lead) => {
                  const nextStatus = NEXT_STATUS[statusKey as LeadStatus];
                  return (
                    <div
                      key={lead.id}
                      className="p-3.5 rounded-lg border space-y-2.5 transition hover:shadow-md hover:border-[var(--border-2)]"
                      style={{ background: "var(--surface-2)", borderColor: "var(--border)" }}
                    >
                      <div>
                        <h4 className="font-bold text-xs" style={{ color: "var(--text)" }}>
                          {lead.companyName}
                        </h4>
                        <p className="text-[11px]" style={{ color: "var(--text-3)" }}>
                          {lead.industry || "Branche k.A."} {lead.city ? `· ${lead.city}` : ""}
                        </p>
                      </div>

                      <div className="space-y-1 text-[11px]" style={{ color: "var(--text-2)" }}>
                        {lead.phone && (
                          <div className="flex items-center gap-1.5 font-mono">
                            <Phone className="w-3 h-3" style={{ color: "var(--text-3)" }} />
                            {lead.phone}
                          </div>
                        )}
                        {lead.googleRating != null && (
                          <div className="flex items-center gap-1">
                            <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                            <span>{lead.googleRating.toFixed(1)}★</span>
                          </div>
                        )}
                      </div>

                      {/* Dropdown status switcher or advance button */}
                      <div className="pt-2 border-t flex items-center justify-between gap-2" style={{ borderColor: "var(--border)" }}>
                        <select
                          className="text-[10px] rounded px-1.5 py-1 border outline-none bg-[var(--surface)] text-[var(--text-2)] cursor-pointer"
                          style={{ borderColor: "var(--border)" }}
                          value={lead.status}
                          onChange={(e) => handleSetStatus(lead.id, e.target.value as LeadStatus)}
                        >
                          {Object.entries(STATUS_LABELS).map(([k, label]) => (
                            <option key={k} value={k}>{label}</option>
                          ))}
                        </select>

                        {nextStatus && (
                          <button
                            onClick={() => handleAdvanceStatus(lead.id, lead.status)}
                            className="p-1 rounded text-[10px] font-semibold flex items-center gap-0.5 hover:bg-[var(--surface-3)] transition-colors"
                            style={{ color: "var(--accent)" }}
                            title={`Weiter zu ${STATUS_LABELS[nextStatus]}`}
                          >
                            Weiter <ChevronRight className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

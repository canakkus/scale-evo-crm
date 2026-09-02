"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  CALL_PIPELINE_STATUSES,
  WALK_IN_PIPELINE_STATUSES,
  CALL_NEXT_STATUS,
  WALK_IN_NEXT_STATUS,
  STATUS_LABELS,
  ACQUISITION_TYPE_LABELS,
} from "@/lib/constants";
import { StatusBadge } from "@/components/ui/status-badge";
import { LeadDetailModal } from "@/components/leads/lead-detail-modal";
import {
  Phone,
  Globe,
  ChevronRight,
  MapPin,
  Star,
  Navigation,
  ExternalLink,
  Copy,
  Check,
  Radio,
  Sparkles,
  UtensilsCrossed,
  Plus,
  Search,
} from "lucide-react";
import type { AcquisitionType, LeadStatus } from "@prisma/client";

export function PipelineBoardComponent() {
  const [leads, setLeads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<AcquisitionType>("CALL");
  const [draggedLead, setDraggedLead] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [copiedNfcId, setCopiedNfcId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

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

  // Split leads by acquisition type
  const coldCallLeads = useMemo(
    () => leads.filter((l) => (l.acquisitionType || "CALL") === "CALL"),
    [leads]
  );
  const walkInLeads = useMemo(
    () => leads.filter((l) => l.acquisitionType === "WALK_IN"),
    [leads]
  );

  const activeLeads = activeTab === "CALL" ? coldCallLeads : walkInLeads;

  // Filter leads by search query if present
  const displayedLeads = useMemo(() => {
    if (!searchQuery.trim()) return activeLeads;
    const query = searchQuery.toLowerCase();
    return activeLeads.filter(
      (l) =>
        l.companyName?.toLowerCase().includes(query) ||
        l.city?.toLowerCase().includes(query) ||
        l.industry?.toLowerCase().includes(query) ||
        l.address?.toLowerCase().includes(query)
    );
  }, [activeLeads, searchQuery]);

  const activeColumns = activeTab === "CALL" ? CALL_PIPELINE_STATUSES : WALK_IN_PIPELINE_STATUSES;
  const activeNextMap = activeTab === "CALL" ? CALL_NEXT_STATUS : WALK_IN_NEXT_STATUS;

  async function handleAdvanceStatus(leadId: string, currentStatus: LeadStatus) {
    const next = activeNextMap[currentStatus];
    if (!next) return;

    // Optimistic update
    setLeads((prev) => prev.map((l) => (l.id === leadId ? { ...l, status: next } : l)));

    try {
      const res = await fetch(`/api/leads/${leadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });

      if (!res.ok) {
        fetchLeads(); // Revert on failure
      }
    } catch (err) {
      console.error(err);
      fetchLeads(); // Revert on failure
    }
  }

  async function handleSetStatus(leadId: string, status: LeadStatus) {
    // Optimistic update
    setLeads((prev) => prev.map((l) => (l.id === leadId ? { ...l, status } : l)));

    try {
      const res = await fetch(`/api/leads/${leadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });

      if (!res.ok) {
        fetchLeads(); // Revert on failure
      }
    } catch (err) {
      console.error(err);
      fetchLeads(); // Revert on failure
    }
  }

  function handleCopyNfc(e: React.MouseEvent, url: string, leadId: string) {
    e.stopPropagation();
    navigator.clipboard.writeText(url);
    setCopiedNfcId(leadId);
    setTimeout(() => setCopiedNfcId(null), 2000);
  }

  function getMapsUrl(lead: any): string | null {
    if (lead.googleMapsUrl) return lead.googleMapsUrl;
    if (lead.address || lead.city) {
      const queryParts = [lead.companyName, lead.address, lead.city].filter(Boolean);
      return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(queryParts.join(", "))}`;
    }
    return null;
  }

  // --- Drag & Drop Handlers ---
  function onDragStart(e: React.DragEvent, leadId: string) {
    e.dataTransfer.setData("text/plain", leadId);
    e.dataTransfer.effectAllowed = "move";
    setDraggedLead(leadId);
  }

  function onDragOver(e: React.DragEvent, statusKey: string) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragOverColumn !== statusKey) {
      setDragOverColumn(statusKey);
    }
  }

  function onDragLeave(e: React.DragEvent) {
    e.preventDefault();
    setDragOverColumn(null);
  }

  function onDrop(e: React.DragEvent, statusKey: LeadStatus) {
    e.preventDefault();
    setDragOverColumn(null);
    setDraggedLead(null);

    const leadId = e.dataTransfer.getData("text/plain");
    if (!leadId) return;

    const lead = leads.find((l) => l.id === leadId);
    if (lead && lead.status !== statusKey) {
      handleSetStatus(leadId, statusKey);
    }
  }

  return (
    <div className="space-y-4">
      {/* Top Header Controls: View Switcher Toggle & Search */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Toggle Switcher: Cold Calls vs Walk-Ins */}
        <div
          className="inline-flex p-1 rounded-xl border max-w-fit shadow-inner"
          style={{ background: "var(--surface-2)", borderColor: "var(--border)" }}
        >
          <button
            type="button"
            onClick={() => setActiveTab("CALL")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
              activeTab === "CALL"
                ? "shadow-md scale-[1.02]"
                : "opacity-75 hover:opacity-100 hover:text-[var(--text)]"
            }`}
            style={{
              background: activeTab === "CALL" ? "var(--accent)" : "transparent",
              color: activeTab === "CALL" ? "var(--bg)" : "var(--text-2)",
            }}
          >
            <span className="text-sm">📞</span>
            <span>Cold Calls</span>
            <span
              className="px-2 py-0.5 rounded-full text-[10px] font-bold"
              style={{
                background: activeTab === "CALL" ? "rgba(0,0,0,0.2)" : "var(--surface-3)",
                color: activeTab === "CALL" ? "var(--bg)" : "var(--text-3)",
              }}
            >
              {coldCallLeads.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("WALK_IN")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
              activeTab === "WALK_IN"
                ? "shadow-md scale-[1.02]"
                : "opacity-75 hover:opacity-100 hover:text-[var(--text)]"
            }`}
            style={{
              background: activeTab === "WALK_IN" ? "var(--accent)" : "transparent",
              color: activeTab === "WALK_IN" ? "var(--bg)" : "var(--text-2)",
            }}
          >
            <span className="text-sm">🚶‍♂️</span>
            <span>Walk-Ins</span>
            <span
              className="px-2 py-0.5 rounded-full text-[10px] font-bold"
              style={{
                background: activeTab === "WALK_IN" ? "rgba(0,0,0,0.2)" : "var(--surface-3)",
                color: activeTab === "WALK_IN" ? "var(--bg)" : "var(--text-3)",
              }}
            >
              {walkInLeads.length}
            </span>
          </button>
        </div>

        {/* Search Input for Kanban Board */}
        <div className="relative flex-1 max-w-xs sm:max-w-sm">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4"
            style={{ color: "var(--text-3)" }}
          />
          <input
            type="text"
            placeholder="Board filtern (Name, Stadt, Adresse)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg pl-9 pr-4 py-2 text-xs border outline-none transition-colors"
            style={{
              background: "var(--surface)",
              borderColor: "var(--border)",
              color: "var(--text)",
            }}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-bold px-1.5 py-0.5 rounded hover:bg-[var(--surface-3)]"
              style={{ color: "var(--text-3)" }}
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="p-12 text-center text-xs" style={{ color: "var(--text-3)" }}>
          <div
            className="w-5 h-5 rounded-full border-2 border-t-transparent animate-spin mx-auto mb-2"
            style={{ borderColor: "var(--border-2)", borderTopColor: "var(--accent)" }}
          />
          Pipeline wird geladen…
        </div>
      ) : (
        /* Kanban Board Columns */
        <div
          className="flex gap-4 overflow-x-auto pb-6 min-h-[70vh] touch-pan-x select-none md:select-auto"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          {(activeColumns as LeadStatus[]).map((statusKey: LeadStatus) => {
            const columnLeads = displayedLeads.filter((l) => l.status === statusKey);

            return (
              <div
                key={statusKey}
                className={`w-72 shrink-0 rounded-xl border flex flex-col max-h-[75vh] transition-colors shadow-sm ${
                  dragOverColumn === statusKey
                    ? "border-[var(--accent)] ring-2 ring-[var(--accent)] ring-opacity-50"
                    : ""
                }`}
                style={{
                  background: "var(--surface)",
                  borderColor: dragOverColumn === statusKey ? "var(--accent)" : "var(--border)",
                }}
                onDragOver={(e) => onDragOver(e, statusKey)}
                onDragLeave={onDragLeave}
                onDrop={(e) => onDrop(e, statusKey)}
              >
                {/* Column Header */}
                <div
                  className="p-3.5 border-b flex items-center justify-between shrink-0"
                  style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}
                >
                  <div className="flex items-center gap-2">
                    <StatusBadge status={statusKey} />
                    <span className="text-xs font-bold px-1.5 py-0.5 rounded-full bg-[var(--surface-3)]" style={{ color: "var(--text-2)" }}>
                      {columnLeads.length}
                    </span>
                  </div>
                </div>

                {/* Column Body */}
                <div className="flex-1 overflow-y-auto p-3 space-y-3">
                  {columnLeads.length === 0 ? (
                    <div
                      className="p-6 text-center text-xs italic rounded-lg border border-dashed"
                      style={{ color: "var(--text-3)", borderColor: "var(--border)" }}
                    >
                      Keine Leads
                    </div>
                  ) : (
                    columnLeads.map((lead) => {
                      const nextStatus = activeNextMap[statusKey as LeadStatus];
                      const mapsUrl = getMapsUrl(lead);

                      return (
                        <div
                          key={lead.id}
                          draggable
                          onDragStart={(e) => onDragStart(e, lead.id)}
                          onDragEnd={() => setDraggedLead(null)}
                          onClick={() => setSelectedLeadId(lead.id)}
                          className={`p-3.5 rounded-lg border space-y-3 transition-all cursor-pointer hover:shadow-md hover:border-[var(--border-2)] ${
                            draggedLead === lead.id ? "opacity-40 scale-95" : "opacity-100"
                          }`}
                          style={{ background: "var(--surface-2)", borderColor: "var(--border)" }}
                        >
                          {/* Top row: Name & Industry */}
                          <div>
                            <div className="flex items-start justify-between gap-1">
                              <h4 className="font-bold text-xs leading-snug" style={{ color: "var(--text)" }}>
                                {lead.companyName}
                              </h4>
                              {lead.score > 0 && (
                                <span
                                  className="text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 bg-amber-500/10 text-amber-400 border border-amber-500/20"
                                  title="Lead Score"
                                >
                                  ★ {lead.score}
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] mt-0.5" style={{ color: "var(--text-3)" }}>
                              {lead.industry || "Branche k.A."} {lead.city ? `· ${lead.city}` : ""}
                            </p>
                          </div>

                          {/* Address / Physical Info (Crucial for Walk-Ins) */}
                          {lead.address && (
                            <div className="flex items-start gap-1.5 text-[11px]" style={{ color: "var(--text-2)" }}>
                              <MapPin className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color: "var(--text-3)" }} />
                              <span className="truncate">{lead.address}</span>
                            </div>
                          )}

                          {/* Contact & Meta Info */}
                          <div className="space-y-1 text-[11px]" style={{ color: "var(--text-2)" }}>
                            {lead.phone && (
                              <div className="flex items-center gap-1.5 font-mono">
                                <Phone className="w-3 h-3 shrink-0" style={{ color: "var(--text-3)" }} />
                                <span>{lead.phone}</span>
                              </div>
                            )}

                            <div className="flex items-center gap-2 flex-wrap pt-0.5">
                              {lead.googleRating != null && (
                                <div className="flex items-center gap-1 text-[11px]">
                                  <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                                  <span className="font-semibold">{lead.googleRating.toFixed(1)}</span>
                                  {lead.googleReviewCount != null && (
                                    <span style={{ color: "var(--text-3)" }}>({lead.googleReviewCount})</span>
                                  )}
                                </div>
                              )}

                              {lead.hasMenu === true && (
                                <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                                  <UtensilsCrossed className="w-2.5 h-2.5" /> Karte
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Quick Action Utilities Row */}
                          <div
                            className="flex items-center gap-1.5 flex-wrap pt-2 border-t"
                            style={{ borderColor: "var(--border)" }}
                            onClick={(e) => e.stopPropagation()}
                          >
                            {/* Maps Navigation Button */}
                            {mapsUrl && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  window.open(mapsUrl, "_blank", "noopener,noreferrer");
                                }}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-semibold border transition-all hover:bg-[var(--surface-3)] hover:scale-[1.02]"
                                style={{
                                  background: "var(--surface)",
                                  borderColor: "var(--border)",
                                  color: "var(--text)",
                                }}
                                title="Navigation: Route auf Google/Apple Maps öffnen"
                              >
                                <Navigation className="w-3 h-3 text-sky-400 shrink-0" />
                                <span>Route</span>
                              </button>
                            )}

                            {/* NFC Demo Quick-Action */}
                            {lead.nfcDemoUrl ? (
                              <div className="inline-flex items-center rounded border overflow-hidden" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
                                <button
                                  type="button"
                                  onClick={(e) => handleCopyNfc(e, lead.nfcDemoUrl, lead.id)}
                                  className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-semibold transition-colors hover:bg-[var(--surface-3)]"
                                  style={{ color: copiedNfcId === lead.id ? "var(--accent)" : "var(--text-2)" }}
                                  title={`NFC-Demo URL kopieren: ${lead.nfcDemoUrl}`}
                                >
                                  {copiedNfcId === lead.id ? (
                                    <>
                                      <Check className="w-3 h-3 text-emerald-400" />
                                      <span className="text-emerald-400 font-bold">Kopiert!</span>
                                    </>
                                  ) : (
                                    <>
                                      <Radio className="w-3 h-3 text-purple-400" />
                                      <span>NFC</span>
                                    </>
                                  )}
                                </button>
                                <a
                                  href={lead.nfcDemoUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className="px-1.5 py-1 border-l hover:bg-[var(--surface-3)] transition-colors"
                                  style={{ borderColor: "var(--border)", color: "var(--text-3)" }}
                                  title="NFC-Demo im Browser öffnen"
                                >
                                  <ExternalLink className="w-2.5 h-2.5" />
                                </a>
                              </div>
                            ) : null}

                            {/* Call Button */}
                            {lead.phone && (
                              <a
                                href={`tel:${lead.phone}`}
                                onClick={(e) => e.stopPropagation()}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-semibold border transition-all hover:bg-[var(--surface-3)]"
                                style={{
                                  background: "var(--surface)",
                                  borderColor: "var(--border)",
                                  color: "var(--accent)",
                                }}
                                title={`Anrufen: ${lead.phone}`}
                              >
                                <Phone className="w-3 h-3" />
                                <span>Anruf</span>
                              </a>
                            )}
                          </div>

                          {/* Dropdown status switcher or advance button */}
                          <div
                            className="pt-2 border-t flex items-center justify-between gap-2"
                            style={{ borderColor: "var(--border)" }}
                          >
                            <select
                              onClick={(e) => e.stopPropagation()}
                              className="text-[10px] rounded px-1.5 py-1 border outline-none bg-[var(--surface)] text-[var(--text-2)] cursor-pointer font-medium"
                              style={{ borderColor: "var(--border)" }}
                              value={lead.status}
                              onChange={(e) => handleSetStatus(lead.id, e.target.value as LeadStatus)}
                            >
                              <optgroup label="Aktuelle Pipeline">
                                {(activeColumns as LeadStatus[]).map((k: LeadStatus) => (
                                  <option key={k} value={k}>
                                    {STATUS_LABELS[k]}
                                  </option>
                                ))}
                              </optgroup>
                              <optgroup label="Weitere Status">
                                {Object.entries(STATUS_LABELS)
                                  .filter(([k]) => !activeColumns.includes(k as LeadStatus))
                                  .map(([k, label]) => (
                                    <option key={k} value={k}>
                                      {label}
                                    </option>
                                  ))}
                              </optgroup>
                            </select>

                            {nextStatus && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleAdvanceStatus(lead.id, lead.status);
                                }}
                                className="p-1 rounded text-[10px] font-semibold flex items-center gap-0.5 hover:bg-[var(--surface-3)] transition-colors shrink-0"
                                style={{ color: "var(--accent)" }}
                                title={`Weiter zu: ${STATUS_LABELS[nextStatus]}`}
                              >
                                <span>Weiter</span>
                                <ChevronRight className="w-3 h-3" />
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
      )}

      {selectedLeadId && (
        <LeadDetailModal
          leadId={selectedLeadId}
          onClose={() => setSelectedLeadId(null)}
          onUpdate={fetchLeads}
        />
      )}
    </div>
  );
}

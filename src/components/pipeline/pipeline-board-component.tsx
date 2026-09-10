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
    <div className="space-y-6">
      {/* Top Header Controls */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        {/* Apple-style Segmented Control */}
        <div
          className="inline-flex p-1 rounded-xl"
          style={{ background: "var(--surface-2)" }}
        >
          <button
            type="button"
            onClick={() => setActiveTab("CALL")}
            className={`px-5 py-1.5 rounded-lg text-[13px] font-medium transition-all ${
              activeTab === "CALL"
                ? "shadow-sm"
                : "opacity-70 hover:opacity-100"
            }`}
            style={{
              background: activeTab === "CALL" ? "var(--surface)" : "transparent",
              color: "var(--text)",
            }}
          >
            Cold Calls <span className="opacity-50 ml-1">{coldCallLeads.length}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("WALK_IN")}
            className={`px-5 py-1.5 rounded-lg text-[13px] font-medium transition-all ${
              activeTab === "WALK_IN"
                ? "shadow-sm"
                : "opacity-70 hover:opacity-100"
            }`}
            style={{
              background: activeTab === "WALK_IN" ? "var(--surface)" : "transparent",
              color: "var(--text)",
            }}
          >
            Walk-Ins <span className="opacity-50 ml-1">{walkInLeads.length}</span>
          </button>
        </div>

        {/* Minimal Search Input */}
        <div className="relative flex-1 max-w-xs">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 opacity-50"
            style={{ color: "var(--text)" }}
          />
          <input
            type="text"
            placeholder="Suchen..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-xl pl-9 pr-8 py-2 text-[14px] outline-none transition-all"
            style={{
              background: "var(--surface-2)",
              color: "var(--text)",
            }}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[13px] opacity-50 hover:opacity-100"
              style={{ color: "var(--text)" }}
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="p-12 text-center text-[14px]" style={{ color: "var(--text-3)" }}>
          <div
            className="w-5 h-5 rounded-full border-2 border-t-transparent animate-spin mx-auto mb-3"
            style={{ borderColor: "var(--border-2)", borderTopColor: "var(--text)" }}
          />
          Laden...
        </div>
      ) : (
        /* Kanban Board Columns */
        <div
          className="flex gap-4 overflow-x-auto pb-6 min-h-[70vh] touch-pan-x select-none md:select-auto px-1"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          {(activeColumns as LeadStatus[]).map((statusKey: LeadStatus) => {
            const columnLeads = displayedLeads.filter((l) => l.status === statusKey);

            return (
              <div
                key={statusKey}
                className={`w-72 shrink-0 flex flex-col max-h-[75vh] transition-all rounded-2xl ${
                  dragOverColumn === statusKey
                    ? "bg-[var(--surface-2)]"
                    : "bg-transparent"
                }`}
                onDragOver={(e) => onDragOver(e, statusKey)}
                onDragLeave={onDragLeave}
                onDrop={(e) => onDrop(e, statusKey)}
              >
                {/* Minimal Column Header */}
                <div className="px-3 py-3 flex items-center justify-between shrink-0">
                  <div className="flex items-baseline gap-2">
                    <h3 className="text-[14px] font-medium" style={{ color: "var(--text)" }}>
                      {STATUS_LABELS[statusKey]}
                    </h3>
                    <span className="text-[13px] opacity-50" style={{ color: "var(--text)" }}>
                      {columnLeads.length}
                    </span>
                  </div>
                </div>

                {/* Column Body */}
                <div className="flex-1 overflow-y-auto px-1 pb-4 space-y-2">
                  {columnLeads.length === 0 ? (
                    <div className="p-3 text-[13px] opacity-50 text-center" style={{ color: "var(--text)" }}>
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
                          className={`group relative p-3.5 rounded-2xl transition-all cursor-pointer ${
                            draggedLead === lead.id ? "opacity-40" : "opacity-100"
                          }`}
                          style={{
                            background: "var(--surface)",
                            boxShadow: "0 1px 3px rgba(0,0,0,0.02), 0 0 0 1px var(--border)",
                          }}
                        >
                          {/* Clean Card Content (Typography-driven) */}
                          <div className="pr-8">
                            <h4 className="text-[14px] font-medium leading-tight mb-1" style={{ color: "var(--text)" }}>
                              {lead.companyName}
                            </h4>
                            
                            <div className="text-[13px] space-y-0.5" style={{ color: "var(--text-2)" }}>
                              <p>
                                {lead.industry || "Branche k.A."}
                                {lead.city ? ` · ${lead.city}` : ""}
                              </p>
                              <p className="truncate" title={lead.address}>
                                {lead.address}
                              </p>
                              
                              {(lead.score > 0 || lead.googleRating != null || lead.hasMenu) && (
                                <p style={{ color: "var(--text-3)" }}>
                                  {[
                                    lead.score > 0 ? `Score: ${lead.score}` : null,
                                    lead.googleRating != null ? `Rating: ${lead.googleRating.toFixed(1)}` : null,
                                    lead.hasMenu ? "Menükarte" : null
                                  ].filter(Boolean).join(" · ")}
                                </p>
                              )}
                            </div>
                          </div>

                          {/* Hover Actions (Progressive Disclosure) */}
                          <div className="absolute right-2 top-1/2 -translate-y-1/2 opacity-100 transition-opacity flex flex-col gap-1 bg-[var(--surface)]/90 backdrop-blur-md p-1 rounded-xl shadow-sm border border-[var(--border)]">
                            {lead.phone && (
                              <a
                                href={`tel:${lead.phone}`}
                                onClick={(e) => e.stopPropagation()}
                                className="p-1.5 hover:bg-[var(--surface-3)] rounded-lg text-[var(--text-2)] hover:text-[var(--text)] transition-colors"
                                title={`Anrufen: ${lead.phone}`}
                              >
                                <Phone className="w-4 h-4" />
                              </a>
                            )}
                            {mapsUrl && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  window.open(mapsUrl, "_blank", "noopener,noreferrer");
                                }}
                                className="p-1.5 hover:bg-[var(--surface-3)] rounded-lg text-[var(--text-2)] hover:text-[var(--text)] transition-colors"
                                title="Route"
                              >
                                <Navigation className="w-4 h-4" />
                              </button>
                            )}
                            {lead.nfcDemoUrl && (
                              <button
                                type="button"
                                onClick={(e) => handleCopyNfc(e, lead.nfcDemoUrl, lead.id)}
                                className="p-1.5 hover:bg-[var(--surface-3)] rounded-lg transition-colors"
                                style={{ color: copiedNfcId === lead.id ? "var(--accent)" : "var(--text-2)" }}
                                title="NFC URL kopieren"
                              >
                                {copiedNfcId === lead.id ? <Check className="w-4 h-4" /> : <Radio className="w-4 h-4" />}
                              </button>
                            )}
                            {nextStatus && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleAdvanceStatus(lead.id, lead.status);
                                }}
                                className="p-1.5 hover:bg-[var(--surface-3)] rounded-lg text-[var(--text-2)] hover:text-[var(--text)] transition-colors"
                                title={`Weiter zu: ${STATUS_LABELS[nextStatus]}`}
                              >
                                <ChevronRight className="w-4 h-4" />
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

"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Search, User,
  Plus,
  Filter,
  Phone,
  Globe,
  MapPin,
  ChevronLeft,
  ChevronRight,
  MoreVertical,
  Star,
  ExternalLink,
  Trash2,
  Eye,
  Navigation,
  Radio,
  Check,
  Copy,
  RefreshCw,
  Sparkles,
  Mail,
  Flame,
  ShieldAlert,
  Archive,
  RotateCcw,
} from "lucide-react";
import { StatusBadge, PriorityDot, STATUS_STYLES } from "@/components/ui/status-badge";
import { LeadPriorityBadge } from "@/components/leads/lead-priority-badge";
import { LeadDetailModal, LeadFormModal } from "@/components/leads/lazy-modals";
import { STATUS_LABELS, INDUSTRIES } from "@/lib/constants";
import { getMapsUrl } from "@/lib/maps-url";
import { formatDate, timeAgo } from "@/lib/utils";
import type { LeadStatus } from "@prisma/client";

export function LeadsTable({
  initialData,
  initialLeadId = null,
}: {
  initialData?: { leads: any[]; allIndustries?: string[]; pagination?: { totalPages?: number; total?: number } } | null;
  initialLeadId?: string | null;
}) {
  const [leads, setLeads] = useState<any[]>(initialData?.leads ?? []);
  const [loading, setLoading] = useState(!initialData);
  const [error, setError] = useState("");

  // Filters & Search
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [acquisitionFilter, setAcquisitionFilter] = useState<string>("");
  const [isFocusFilter, setIsFocusFilter] = useState(false);
  const [archiveFilter, setArchiveFilter] = useState(false);
  const [sourceFilter, setSourceFilter] = useState<"" | "bot_raw" | "bot" | "manual">("");
  const [industryFilters, setIndustryFilters] = useState<string[]>([]);
  const [availableIndustries, setAvailableIndustries] = useState<string[]>(initialData?.allIndustries ?? []);
  const [isIndustryDropdownOpen, setIsIndustryDropdownOpen] = useState(false);
  const [industrySearch, setIndustrySearch] = useState("");
  const [updatedDateFilter, setUpdatedDateFilter] = useState("");
  const [customDate, setCustomDate] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(initialData?.pagination?.totalPages || 1);
  const [totalLeads, setTotalLeads] = useState(initialData?.pagination?.total || 0);
  const [copiedNfcId, setCopiedNfcId] = useState<string | null>(null);

  // Selection & Batch Audit / Bulk Archive
  const [selectedLeadIds, setSelectedLeadIds] = useState<string[]>([]);
  const [bulkArchiving, setBulkArchiving] = useState(false);
  const [batchState, setBatchState] = useState<{
    running: boolean;
    current: number;
    total: number;
    currentLeadName?: string;
    cancelRequested?: boolean;
  } | null>(null);

  // Modals
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formMounted, setFormMounted] = useState(false);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(initialLeadId);

  // Debounce search input to avoid laggy keystrokes & excessive API requests
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
    }, 280);
    return () => clearTimeout(timer);
  }, [search]);

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (debouncedSearch.trim()) params.set("search", debouncedSearch.trim());
      if (statusFilter) params.set("status", statusFilter);
      if (acquisitionFilter) params.set("acquisitionType", acquisitionFilter);
      if (isFocusFilter) params.set("isFocus", "true");
      if (archiveFilter) params.set("archived", "true");
      if (sourceFilter === "bot_raw") {
        params.set("enrichmentStatus", "raw");
      } else if (sourceFilter === "bot") {
        params.set("source", "bot");
      } else if (sourceFilter === "manual") {
        params.set("source", "manual");
      }
      if (industryFilters.length > 0) params.set("industry", industryFilters.join(","));
      if (updatedDateFilter) {
        if (updatedDateFilter === "custom") {
          if (customDate) params.set("updatedDate", customDate);
        } else {
          params.set("updatedDate", updatedDateFilter);
        }
      }
      params.set("page", String(page));
      params.set("limit", "20");

      const res = await fetch(`/api/leads?${params.toString()}`);
      if (!res.ok) throw new Error("Fehler beim Laden.");
      const data = await res.json();

      setLeads(data.leads || []);
      setAvailableIndustries(data.allIndustries || INDUSTRIES);
      setTotalPages(data.pagination?.totalPages || 1);
      setTotalLeads(data.pagination?.total || 0);
    } catch (err) {
      setError("Fehler beim Laden der Leads.");
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, statusFilter, acquisitionFilter, isFocusFilter, archiveFilter, sourceFilter, industryFilters, updatedDateFilter, customDate, page]);

  async function handleToggleFocus(leadId: string, currentVal: boolean, currentStatus?: string) {
    if (currentStatus === "NOT_RELEVANT" && !currentVal) {
      return; // Irrelevante Leads dürfen keinen 2-Wochen-Fokus erhalten
    }
    const nextVal = !currentVal;
    setLeads((prev) => prev.map((l) => (l.id === leadId ? { ...l, isFocus: nextVal } : l)));
    try {
      await fetch(`/api/leads/${leadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isFocus: nextVal }),
      });
    } catch (err) {
      console.error(err);
      fetchLeads();
    }
  }

  async function handleQuickChangeStatus(
    leadId: string,
    newStatus: LeadStatus,
    e?: React.MouseEvent | React.ChangeEvent
  ) {
    e?.stopPropagation();
    const isArchivedStatus = ["NOT_RELEVANT", "LOST", "VISITED_NO_INTEREST"].includes(newStatus);
    const shouldRemoveFromView =
      (!archiveFilter && isArchivedStatus) ||
      (archiveFilter && !isArchivedStatus) ||
      Boolean(statusFilter && statusFilter !== newStatus);

    if (shouldRemoveFromView) {
      setLeads((prev) => prev.filter((l) => l.id !== leadId));
      setTotalLeads((prev) => Math.max(0, prev - 1));
      setSelectedLeadIds((prev) => prev.filter((id) => id !== leadId));
    } else {
      setLeads((prev) =>
        prev.map((l) =>
          l.id === leadId
            ? {
                ...l,
                status: newStatus,
                isFocus: newStatus === "NOT_RELEVANT" ? false : l.isFocus,
                ...(newStatus === "NOT_RELEVANT"
                  ? {
                      priority: "LOW",
                      prioritySource: "SYSTEM",
                      priorityRatedAt: null,
                      priorityRatedByName: null,
                      priorityRatedBy: null,
                    }
                  : {}),
              }
            : l
        )
      );
    }
    try {
      const res = await fetch(`/api/leads/${leadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error("Fehler beim Status-Update");
      const payload = await res.json().catch(() => null);
      if (payload?.lead && !shouldRemoveFromView) {
        setLeads((prev) => prev.map((l) => (l.id === leadId ? { ...l, ...payload.lead } : l)));
      }
    } catch (err) {
      console.error(err);
      fetchLeads();
    }
  }

  async function handleQuickMarkNotRelevant(leadId: string, e?: React.MouseEvent) {
    return handleQuickChangeStatus(leadId, "NOT_RELEVANT", e);
  }

  async function handleBulkArchiveSelected(action: "archive" | "unarchive") {
    if (bulkArchiving || selectedLeadIds.length === 0) return;
    setBulkArchiving(true);
    const idsToMove = [...selectedLeadIds];
    if ((action === "archive" && !archiveFilter) || (action === "unarchive" && archiveFilter)) {
      setLeads((prev) => prev.filter((l) => !idsToMove.includes(l.id)));
      setTotalLeads((prev) => Math.max(0, prev - idsToMove.length));
    }
    setSelectedLeadIds([]);
    try {
      const res = await fetch("/api/leads/bulk", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadIds: idsToMove, action }),
      });
      if (!res.ok) throw new Error("Fehler bei der Archiv-Aktion");
      await fetchLeads();
    } catch (err) {
      console.error(err);
      fetchLeads();
    } finally {
      setBulkArchiving(false);
    }
  }

  async function handleQuickChangeAcquisition(leadId: string, newType: string, e: React.MouseEvent | React.ChangeEvent) {
    e.stopPropagation();
    setLeads((prev) => prev.map((l) => (l.id === leadId ? { ...l, acquisitionType: newType } : l)));
    try {
      const res = await fetch(`/api/leads/${leadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acquisitionType: newType }),
      });
      if (!res.ok) throw new Error("Fehler beim Akquise-Update");
    } catch (err) {
      console.error(err);
      fetchLeads();
    }
  }

  function handleCopyNfc(e: React.MouseEvent, url: string, leadId: string) {
    e.stopPropagation();
    navigator.clipboard.writeText(url);
    setCopiedNfcId(leadId);
    setTimeout(() => setCopiedNfcId(null), 2000);
  }

  const skipInitialFetch = useRef(Boolean(initialData));
  useEffect(() => {
    if (skipInitialFetch.current) {
      skipInitialFetch.current = false;
      return;
    }
    fetchLeads();
  }, [fetchLeads]);

  async function handleDeleteLead(id: string, name: string) {
    if (!confirm(`Möchtest du den Lead "${name}" wirklich löschen?`)) return;
    try {
      const res = await fetch(`/api/leads/${id}`, { method: "DELETE" });
      if (res.ok) {
        fetchLeads();
      }
    } catch (err) {
      console.error(err);
    }
  }

  // Poll batch audit state & auto-refresh on finish
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;

    async function checkBatchState() {
      try {
        const res = await fetch("/api/leads/batch-audit");
        if (res.ok) {
          const data = await res.json();
          setBatchState((prev) => {
            if (prev?.running && !data.state?.running) {
              fetchLeads();
            }
            return data.state;
          });
        }
      } catch {
        // network error ignore
      }
    }

    const startTimer = batchState?.running ? null : setTimeout(() => void checkBatchState(), 1500);
    if (batchState?.running) {
      void checkBatchState();
      interval = setInterval(checkBatchState, 2500);
    }

    return () => {
      if (interval) clearInterval(interval);
      if (startTimer) clearTimeout(startTimer);
    };
  }, [batchState?.running, fetchLeads]);

  // Selection helpers
  const visibleLeadIds = leads.map((l) => l.id);
  const allVisibleSelected =
    visibleLeadIds.length > 0 && visibleLeadIds.every((id) => selectedLeadIds.includes(id));
  const someVisibleSelected =
    visibleLeadIds.some((id) => selectedLeadIds.includes(id)) && !allVisibleSelected;

  function handleToggleSelectAll() {
    if (allVisibleSelected) {
      setSelectedLeadIds((prev) => prev.filter((id) => !visibleLeadIds.includes(id)));
    } else {
      setSelectedLeadIds((prev) => Array.from(new Set([...prev, ...visibleLeadIds])));
    }
  }

  function handleToggleSelect(leadId: string) {
    setSelectedLeadIds((prev) =>
      prev.includes(leadId) ? prev.filter((id) => id !== leadId) : [...prev, leadId]
    );
  }

  // Batch trigger handlers
  async function handleStartBatchAll() {
    if (batchState?.running) return;
    if (!confirm("Möchtest du den automatischen Security- & Health-Check für alle Leads mit Website starten?")) {
      return;
    }
    try {
      const res = await fetch("/api/leads/batch-audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
      });
      if (res.ok) {
        const data = await res.json();
        setBatchState(data.state);
      } else {
        const errData = await res.json().catch(() => ({}));
        alert(errData.error || "Fehler beim Starten des Health-Checks.");
      }
    } catch (err) {
      console.error(err);
      alert("Netzwerkfehler beim Starten des Health-Checks.");
    }
  }

  async function handleStartBatchSelected() {
    if (batchState?.running || selectedLeadIds.length === 0) return;
    try {
      const res = await fetch("/api/leads/batch-audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadIds: selectedLeadIds }),
      });
      if (res.ok) {
        const data = await res.json();
        setBatchState(data.state);
      } else {
        const errData = await res.json().catch(() => ({}));
        alert(errData.error || "Fehler beim Starten des Health-Checks.");
      }
    } catch (err) {
      console.error(err);
      alert("Netzwerkfehler beim Starten des Health-Checks.");
    }
  }

  async function handleCancelBatch() {
    try {
      const res = await fetch("/api/leads/batch-audit", { method: "DELETE" });
      if (res.ok) {
        const data = await res.json();
        setBatchState(data.state);
        fetchLeads();
      }
    } catch (err) {
      console.error(err);
    }
  }

  return (
    <div className="space-y-6">
      {/* Action Bar / Controls */}
      <div className="flex flex-col gap-3">
        {/* Top Row: Channel Switcher & Primary Actions */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Acquisition Toggle */}
          <div
            className="inline-flex p-0.5 rounded-xl border max-w-full overflow-x-auto shrink-0 shadow-inner"
            style={{ background: "var(--surface-2)", borderColor: "var(--border)" }}
          >
            <button
              type="button"
              onClick={() => {
                setAcquisitionFilter("");
                setPage(1);
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
                acquisitionFilter === ""
                  ? "shadow-sm"
                  : "opacity-75 hover:opacity-100 hover:text-[var(--text)]"
              }`}
              style={{
                background: acquisitionFilter === "" ? "var(--surface)" : "transparent",
                color: acquisitionFilter === "" ? "var(--text)" : "var(--text-2)",
              }}
            >
              Alle
            </button>
            <button
              type="button"
              onClick={() => {
                setAcquisitionFilter("CALL");
                setPage(1);
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
                acquisitionFilter === "CALL"
                  ? "shadow-sm"
                  : "opacity-75 hover:opacity-100 hover:text-[var(--text)]"
              }`}
              style={{
                background: acquisitionFilter === "CALL" ? "var(--surface)" : "transparent",
                color: acquisitionFilter === "CALL" ? "var(--text)" : "var(--text-2)",
              }}
            >
              <Phone className="w-3.5 h-3.5 opacity-70" />
              <span>Calls</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setAcquisitionFilter("WALK_IN");
                setPage(1);
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
                acquisitionFilter === "WALK_IN"
                  ? "shadow-sm"
                  : "opacity-75 hover:opacity-100 hover:text-[var(--text)]"
              }`}
              style={{
                background: acquisitionFilter === "WALK_IN" ? "var(--surface)" : "transparent",
                color: acquisitionFilter === "WALK_IN" ? "var(--text)" : "var(--text-2)",
              }}
            >
              <User className="w-3.5 h-3.5 opacity-70" />
              <span>Walk-Ins</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setAcquisitionFilter("DM");
                setPage(1);
              }}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
                acquisitionFilter === "DM"
                  ? "shadow-sm"
                  : "opacity-75 hover:opacity-100 hover:text-[var(--text)]"
              }`}
              style={{
                background: acquisitionFilter === "DM" ? "var(--accent)" : "transparent",
                color: acquisitionFilter === "DM" ? "var(--bg)" : "var(--text-2)",
              }}
            >
              <span>💬</span>
              <span>Instagram DM</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setAcquisitionFilter("EMAIL");
                setPage(1);
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
                acquisitionFilter === "EMAIL"
                  ? "shadow-sm"
                  : "opacity-75 hover:opacity-100 hover:text-[var(--text)]"
              }`}
              style={{
                background: acquisitionFilter === "EMAIL" ? "#F59E0B" : "transparent",
                color: acquisitionFilter === "EMAIL" ? "#000" : "var(--text-2)",
              }}
            >
              <Mail className="w-3.5 h-3.5 opacity-80" />
              <span>E-Mails</span>
            </button>
          </div>

          {/* Quick Focus & Relevance Buttons + New Lead */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => {
                setIsFocusFilter((prev) => !prev);
                setPage(1);
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all whitespace-nowrap ${
                isFocusFilter
                  ? "shadow-sm border-amber-500/50 bg-amber-500/15 text-amber-300"
                  : "border-[var(--border)] bg-[var(--surface)] text-[var(--text-2)] hover:text-[var(--text)]"
              }`}
              title="Zeigt nur Leads, die für die nächsten 2 Wochen vorgemerkt sind"
            >
              <Star className={`w-3.5 h-3.5 ${isFocusFilter ? "fill-amber-400 text-amber-400" : ""}`} />
              <span>2-Wochen-Fokus</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setArchiveFilter((prev) => {
                  const next = !prev;
                  if (!next && ["NOT_RELEVANT", "LOST", "VISITED_NO_INTEREST"].includes(statusFilter)) {
                    setStatusFilter("");
                  } else if (next && statusFilter && !["NOT_RELEVANT", "LOST", "VISITED_NO_INTEREST"].includes(statusFilter)) {
                    setStatusFilter("");
                  }
                  return next;
                });
                setSelectedLeadIds([]);
                setPage(1);
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all whitespace-nowrap ${
                archiveFilter
                  ? "shadow-sm border-amber-500/50 bg-amber-500/15 text-amber-300 font-bold"
                  : "border-[var(--border)] bg-[var(--surface)] text-[var(--text-2)] hover:text-[var(--text)]"
              }`}
              title={archiveFilter ? "Zurück zu aktiven Leads" : "Zeigt nur archivierte / nicht relevante Leads"}
            >
              <Archive className={`w-3.5 h-3.5 ${archiveFilter ? "text-amber-400" : ""}`} />
              <span>{archiveFilter ? "📦 Archiv aktiv" : "📦 Archiv"}</span>
            </button>

            {/* Bot Filter Segmented Buttons */}
            <div
              className="inline-flex p-0.5 rounded-xl border max-w-full overflow-x-auto shrink-0 shadow-inner"
              style={{ background: "var(--surface-2)", borderColor: "var(--border)" }}
            >
              <button
                type="button"
                onClick={() => {
                  setSourceFilter((prev) => (prev === "bot_raw" ? "" : "bot_raw"));
                  setPage(1);
                }}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
                  sourceFilter === "bot_raw"
                    ? "bg-amber-500 text-black shadow-sm font-bold"
                    : "opacity-75 hover:opacity-100 text-[var(--text-2)]"
                }`}
                title="Zeigt nur unqualifizierte Rohleads von Hunter"
              >
                <span>⚡</span>
                <span>Nur RAW ({leads.filter((l) => l.enrichmentStatus === "raw").length > 0 ? "aktiv" : "Bot"})</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setSourceFilter((prev) => (prev === "bot" ? "" : "bot"));
                  setPage(1);
                }}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
                  sourceFilter === "bot"
                    ? "bg-purple-500 text-white shadow-sm font-bold"
                    : "opacity-75 hover:opacity-100 text-[var(--text-2)]"
                }`}
                title="Alle Leads aus der Grok Bot Pipeline (Hunter/Guy)"
              >
                <span>🤖</span>
                <span>Bot-Pipeline</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setSourceFilter((prev) => (prev === "manual" ? "" : "manual"));
                  setPage(1);
                }}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
                  sourceFilter === "manual"
                    ? "bg-blue-500 text-white shadow-sm font-bold"
                    : "opacity-75 hover:opacity-100 text-[var(--text-2)]"
                }`}
                title="Nur manuell oder via Scout erfasste Leads"
              >
                <span>👤</span>
                <span>Eigene</span>
              </button>
            </div>

            {/* Refresh Button */}
            <button
              type="button"
              onClick={() => fetchLeads()}
              disabled={loading}
              title="Leads aktualisieren"
              className="flex items-center justify-center rounded-xl p-2 sm:px-2.5 sm:py-1.5 text-xs sm:text-sm font-medium border outline-none transition-all cursor-pointer hover:bg-[var(--surface-2)] active:scale-95 disabled:opacity-50"
              style={{ background: "var(--surface)", borderColor: "var(--border)" }}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin text-[var(--accent)]" : ""}`} style={{ color: "var(--text-2)" }} />
              <span className="hidden lg:inline ml-1.5" style={{ color: "var(--text-2)" }}>Aktualisieren</span>
            </button>

            {/* Health-Check All Button */}
            <button
              type="button"
              onClick={handleStartBatchAll}
              disabled={batchState?.running}
              title="Automatischer Health- & Security-Check für alle Leads mit Website"
              className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs sm:text-sm font-semibold border transition-all shrink-0 ${
                batchState?.running
                  ? "opacity-60 cursor-not-allowed border-blue-500/40 bg-blue-500/10 text-blue-300"
                  : "border-blue-500/30 bg-blue-500/15 text-blue-300 hover:bg-blue-500/25 active:scale-95"
              }`}
            >
              <ShieldAlert className={`w-4 h-4 ${batchState?.running ? "animate-pulse text-blue-400" : "text-blue-400"}`} />
              <span className="hidden sm:inline">{batchState?.running ? "Scan läuft…" : "Health-Check (Alle)"}</span>
              <span className="sm:hidden">{batchState?.running ? "Scan…" : "Audit"}</span>
            </button>

            {/* New Lead Button */}
            <button
              onClick={() => {
                setFormMounted(true);
                setIsFormOpen(true);
              }}
              className="flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs sm:text-sm font-semibold shadow-sm transition-all hover:opacity-90 active:scale-95 shrink-0"
              style={{ background: "var(--accent)", color: "var(--bg)" }}
            >
              <Plus className="w-4 h-4" />
              <span>Neuer Lead</span>
            </button>
          </div>
        </div>

        {/* Bottom Row: Search & Detail Filters */}
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          {/* Search Input */}
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: "var(--text-3)" }} />
            <input
              type="text"
              placeholder="Lead suchen (Firma, Stadt, Kontakt, Telefon)..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="w-full rounded-xl pl-9 pr-7 py-1.5 text-xs sm:text-sm border outline-none transition-colors"
              style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text)" }}
            />
            {search && (
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  setPage(1);
                }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs opacity-50 hover:opacity-100"
                style={{ color: "var(--text)" }}
              >
                ✕
              </button>
            )}
          </div>

          {/* Filter Dropdowns */}
          <div className="flex items-center gap-2 flex-wrap shrink-0">
            {/* Update Date Filter */}
            <div className="flex items-center gap-1.5">
              <select
                value={updatedDateFilter}
                onChange={(e) => {
                  setUpdatedDateFilter(e.target.value);
                  setPage(1);
                  if (e.target.value !== "custom") {
                    setCustomDate("");
                  }
                }}
                className="rounded-xl px-2.5 py-1.5 text-xs sm:text-sm font-medium border outline-none cursor-pointer"
                style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text-2)" }}
              >
                <option value="">Jederzeit</option>
                <option value="today">Heute</option>
                <option value="yesterday">Gestern</option>
                <option value="thisWeek">Diese Woche</option>
                <option value="custom">Datum...</option>
              </select>

              {updatedDateFilter === "custom" && (
                <input
                  type="date"
                  value={customDate}
                  onChange={(e) => {
                    setCustomDate(e.target.value);
                    setPage(1);
                  }}
                  className="rounded-xl px-2.5 py-1.5 text-xs sm:text-sm border outline-none cursor-pointer animate-fade-in"
                  style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text-2)" }}
                />
              )}
            </div>

            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={(e) => {
                const nextStatus = e.target.value;
                setStatusFilter(nextStatus);
                if (["NOT_RELEVANT", "LOST", "VISITED_NO_INTEREST"].includes(nextStatus)) {
                  setArchiveFilter(true);
                } else {
                  setArchiveFilter(false);
                }
                setSelectedLeadIds([]);
                setPage(1);
              }}
              className="rounded-xl px-2.5 py-1.5 text-xs sm:text-sm font-medium border outline-none cursor-pointer"
              style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text-2)" }}
            >
              <option value="">Alle Status</option>
              {Object.entries(STATUS_LABELS).map(([key, label]) => (
                <option key={key} value={key}>
                  {key === "NOT_RELEVANT" ? `${label} (📦 Archiv)` : label}
                </option>
              ))}
            </select>

          {/* Multi-Select Industry Filter */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsIndustryDropdownOpen(!isIndustryDropdownOpen)}
              className="rounded-xl px-2.5 py-1.5 text-xs sm:text-sm font-medium border outline-none cursor-pointer flex items-center gap-1.5 transition-colors hidden md:flex"
              style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text-2)" }}
            >
              <Filter className="w-3.5 h-3.5" />
              <span>
                {industryFilters.length === 0
                  ? "Branchen"
                  : industryFilters.length === 1
                  ? industryFilters[0]
                  : `${industryFilters.length} Branchen`}
              </span>
            </button>

            {isIndustryDropdownOpen && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setIsIndustryDropdownOpen(false)}
                />
                <div
                  className="absolute right-0 mt-2 w-64 rounded-xl border shadow-xl p-3 space-y-3 z-20 animate-fade-in"
                  style={{ background: "var(--surface)", borderColor: "var(--border)" }}
                >
                  <input
                    type="text"
                    placeholder="Branche suchen..."
                    value={industrySearch}
                    onChange={(e) => setIndustrySearch(e.target.value)}
                    className="w-full rounded-md px-3 py-1.5 text-sm border outline-none"
                    style={{ background: "var(--surface-2)", borderColor: "var(--border)", color: "var(--text)" }}
                  />

                  <div className="max-h-48 overflow-y-auto space-y-1 pr-1">
                    <label className="flex items-center gap-2 cursor-pointer text-sm p-1.5 rounded-md hover:bg-[var(--surface-2)]">
                      <input
                        type="checkbox"
                        checked={industryFilters.includes("Keine Angabe")}
                        onChange={() => {
                          setIndustryFilters((prev) =>
                            prev.includes("Keine Angabe")
                              ? prev.filter((item) => item !== "Keine Angabe")
                              : [...prev, "Keine Angabe"]
                          );
                          setPage(1);
                        }}
                        className="rounded border-[var(--border)] text-[var(--accent)] accent-[var(--accent)]"
                      />
                      <span style={{ color: "var(--text)" }}>— Keine Angabe —</span>
                    </label>

                    {availableIndustries
                      .filter((ind) => ind.toLowerCase().includes(industrySearch.toLowerCase()))
                      .map((ind) => (
                        <label key={ind} className="flex items-center gap-2 cursor-pointer text-sm p-1.5 rounded-md hover:bg-[var(--surface-2)]">
                          <input
                            type="checkbox"
                            checked={industryFilters.includes(ind)}
                            onChange={() => {
                              setIndustryFilters((prev) =>
                                prev.includes(ind)
                                  ? prev.filter((item) => item !== ind)
                                  : [...prev, ind]
                              );
                              setPage(1);
                            }}
                            className="rounded border-[var(--border)] text-[var(--accent)] accent-[var(--accent)]"
                          />
                          <span style={{ color: "var(--text)" }}>{ind}</span>
                        </label>
                      ))}
                  </div>

                  <div className="flex items-center justify-between border-t pt-3" style={{ borderColor: "var(--border)" }}>
                    <button
                      type="button"
                      onClick={() => {
                        setIndustryFilters([]);
                        setPage(1);
                      }}
                      className="text-xs font-semibold uppercase transition-colors hover:text-[var(--accent)]"
                      style={{ color: "var(--text-3)" }}
                    >
                      Zurücksetzen
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsIndustryDropdownOpen(false)}
                      className="text-xs font-semibold uppercase rounded-md px-3 py-1.5"
                      style={{ background: "var(--accent)", color: "var(--bg)" }}
                    >
                      Fertig
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>

      {/* Batch Running Progress Banner */}
      {batchState?.running && (
        <div
          className="rounded-xl p-3 border flex flex-col sm:flex-row items-center justify-between gap-3 animate-fade-in shadow-sm"
          style={{ background: "rgba(59, 130, 246, 0.08)", borderColor: "rgba(59, 130, 246, 0.3)" }}
        >
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <div className="w-5 h-5 rounded-full border-2 border-blue-400 border-t-transparent animate-spin shrink-0" />
            <div className="min-w-0">
              <div className="text-xs font-bold flex items-center gap-2 text-blue-400">
                <span>Website Health-Check läuft… ({batchState.current} / {batchState.total})</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300">
                  {Math.round((batchState.current / Math.max(batchState.total, 1)) * 100)}%
                </span>
              </div>
              {batchState.currentLeadName && (
                <div className="text-[11px] truncate max-w-xs sm:max-w-md text-blue-300/80">
                  Aktiv: {batchState.currentLeadName}
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0 w-full sm:w-auto justify-end">
            <div className="w-32 bg-blue-950/60 rounded-full h-2 overflow-hidden border border-blue-500/30">
              <div
                className="bg-blue-400 h-full transition-all duration-300"
                style={{ width: `${Math.round((batchState.current / Math.max(batchState.total, 1)) * 100)}%` }}
              />
            </div>
            <button
              type="button"
              onClick={handleCancelBatch}
              disabled={batchState.cancelRequested}
              className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-red-500/20 text-red-300 hover:bg-red-500/30 border border-red-500/30 transition-all disabled:opacity-50"
            >
              {batchState.cancelRequested ? "Bricht ab…" : "Abbrechen"}
            </button>
          </div>
        </div>
      )}

      {/* Multi-Select Action Bar */}
      {selectedLeadIds.length > 0 && (
        <div
          className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-xl border animate-fade-in shadow-sm"
          style={{ background: "var(--surface-2)", borderColor: "var(--accent)" }}
        >
          <div className="flex items-center gap-2 text-xs font-semibold" style={{ color: "var(--text)" }}>
            <span className="w-2 h-2 rounded-full" style={{ background: "var(--accent)" }} />
            <span>
              {selectedLeadIds.length} {selectedLeadIds.length === 1 ? "Lead" : "Leads"} ausgewählt
            </span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {!archiveFilter ? (
              <button
                type="button"
                onClick={() => handleBulkArchiveSelected("archive")}
                disabled={bulkArchiving}
                className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold border transition-all hover:bg-amber-500/25 active:scale-95 disabled:opacity-50 border-amber-500/40 bg-amber-500/15 text-amber-300 cursor-pointer"
                title="Ausgewählte Leads als 'Nicht relevant' ins Archiv verschieben"
              >
                <Archive className="w-3.5 h-3.5 text-amber-400" />
                <span>Ins Archiv verschieben ({selectedLeadIds.length})</span>
              </button>
            ) : (
              <>
                {leads.some((l) => selectedLeadIds.includes(l.id) && l.status !== "NOT_RELEVANT") && (
                  <button
                    type="button"
                    onClick={() => handleBulkArchiveSelected("archive")}
                    disabled={bulkArchiving}
                    className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold border transition-all hover:bg-amber-500/25 active:scale-95 disabled:opacity-50 border-amber-500/40 bg-amber-500/15 text-amber-300 cursor-pointer"
                    title="Ausgewählte Leads als 'Nicht relevant' markieren (entfernt Priorität)"
                  >
                    <Archive className="w-3.5 h-3.5 text-amber-400" />
                    <span>Als &bdquo;Nicht relevant&ldquo; (keine Prio)</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => handleBulkArchiveSelected("unarchive")}
                  disabled={bulkArchiving}
                  className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold border transition-all hover:bg-emerald-500/25 active:scale-95 disabled:opacity-50 border-emerald-500/40 bg-emerald-500/15 text-emerald-300 cursor-pointer"
                  title="Ausgewählte Leads aus dem Archiv wiederherstellen"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Wiederherstellen ({selectedLeadIds.length})</span>
                </button>
              </>
            )}
            <button
              type="button"
              onClick={handleStartBatchSelected}
              disabled={batchState?.running}
              className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold shadow-sm transition-all hover:opacity-90 active:scale-95 disabled:opacity-50"
              style={{ background: "var(--accent)", color: "var(--bg)" }}
            >
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>Ausgewählte scannen ({selectedLeadIds.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setSelectedLeadIds([])}
              className="px-2.5 py-1 rounded-lg text-xs font-medium hover:bg-[var(--surface-3)] transition-colors"
              style={{ color: "var(--text-3)" }}
            >
              Auswahl aufheben
            </button>
          </div>
        </div>
      )}

      {/* Table Container */}
      <div className="rounded-xl border overflow-hidden shadow-sm" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="border-b" style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}>
                <th className="w-10 px-4 py-3 text-center">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = someVisibleSelected;
                    }}
                    onChange={handleToggleSelectAll}
                    className="w-4 h-4 rounded border cursor-pointer accent-[var(--accent)]"
                    title="Alle sichtbaren Leads auswählen"
                  />
                </th>
                <th className="px-5 py-3 font-medium" style={{ color: "var(--text-2)" }}>Firma / Branche</th>
                <th className="px-5 py-3 font-medium" style={{ color: "var(--text-2)" }}>Typ & Status</th>
                <th className="px-5 py-3 font-medium" style={{ color: "var(--text-2)" }}>Kontakt</th>
                <th className="px-5 py-3 font-medium" style={{ color: "var(--text-2)" }}>Adresse / Stadt</th>
                <th className="px-5 py-3 font-medium" style={{ color: "var(--text-2)" }}>Bewertung &amp; Audit</th>
                <th className="px-5 py-3 font-medium" style={{ color: "var(--text-2)" }}>Erstellt von</th>
                <th className="px-5 py-3 font-medium text-right" style={{ color: "var(--text-2)" }}>Aktionen</th>
              </tr>
            </thead>
            <tbody className="divide-y" style={{ borderColor: "var(--border)" }}>
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-5 py-12 text-center" style={{ color: "var(--text-3)" }}>
                    <div className="w-6 h-6 rounded-full border-2 border-t-transparent animate-spin mx-auto mb-3" style={{ borderColor: "var(--border-2)", borderTopColor: "var(--accent)" }} />
                    Leads werden geladen…
                  </td>
                </tr>
              ) : leads.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-5 py-12 text-center text-base" style={{ color: "var(--text-3)" }}>
                    Keine Leads gefunden.
                  </td>
                </tr>
              ) : (
                leads.map((lead) => {
                  const mapsUrl = getMapsUrl(lead);
                  const isWalkIn = lead.acquisitionType === "WALK_IN";

                  return (
                    <tr
                      key={lead.id}
                      onClick={() => setSelectedLeadId(lead.id)}
                      className="hover:bg-[var(--surface-3)] transition-colors cursor-pointer group"
                    >
                      {/* Checkbox */}
                      <td className="w-10 px-4 py-4 text-center align-top" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedLeadIds.includes(lead.id)}
                          onChange={() => handleToggleSelect(lead.id)}
                          className="w-4 h-4 rounded border cursor-pointer accent-[var(--accent)]"
                          aria-label={`${lead.companyName} auswählen`}
                        />
                      </td>
                      {/* Firma */}
                      <td className="px-5 py-4 align-top">
                        <div className="flex items-center gap-2 font-semibold text-base mb-1" style={{ color: "var(--text)" }}>
                          <button
                            type="button"
                            disabled={lead.status === "NOT_RELEVANT" && !lead.isFocus}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleToggleFocus(lead.id, !!lead.isFocus, lead.status);
                            }}
                            title={
                              lead.status === "NOT_RELEVANT" && !lead.isFocus
                                ? "Irrelevante Leads können keinen 2-Wochen-Fokus erhalten"
                                : lead.isFocus
                                ? "2-Wochen-Fokus entfernen"
                                : "Für 2-Wochen-Fokus vormerken"
                            }
                            className={`p-1 rounded-md transition-all shrink-0 ${
                              lead.status === "NOT_RELEVANT" && !lead.isFocus
                                ? "text-[var(--text-3)] opacity-20 cursor-not-allowed"
                                : lead.isFocus
                                ? "text-amber-400 bg-amber-400/15"
                                : "text-[var(--text-3)] hover:text-amber-400 hover:bg-[var(--surface-2)] opacity-40 group-hover:opacity-100"
                            }`}
                          >
                            <Star className={`w-4 h-4 ${lead.isFocus ? "fill-amber-400 text-amber-400" : ""}`} />
                          </button>
                          <span>{lead.companyName}</span>
                          {lead.enrichmentStatus === "raw" && (
                            <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30 tracking-wider animate-pulse">
                              ⚡ RAW
                            </span>
                          )}
                          {lead.source?.includes("Hunter") && (
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-300 border border-purple-500/25">
                              🤖 Grok
                            </span>
                          )}
                          {lead.isFocus && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                              2-Wochen-Fokus
                            </span>
                          )}
                          {lead.hasMenu === true && (
                            <span className="text-xs font-normal px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                              Karte
                            </span>
                          )}
                          {lead.hasMenu === false && lead.website && (
                            <span className="text-xs font-normal px-2 py-0.5 rounded-md bg-red-500/10 text-red-500 border border-red-500/20">
                              Keine Karte
                            </span>
                          )}
                          {lead.auditSeverity != null && (
                            <span
                              className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${
                                lead.auditSeverity >= 60
                                  ? "bg-red-500/15 text-red-400 border-red-500/25"
                                  : lead.auditSeverity >= 30
                                  ? "bg-amber-500/15 text-amber-400 border-amber-500/25"
                                  : "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                              }`}
                              title={`Website Risiko-Score: ${lead.auditSeverity}/100`}
                            >
                              Audit {lead.auditSeverity}
                            </span>
                          )}
                          {(lead.auditStatus === "pending" || lead.auditStatus === "running") && (
                            <span
                              className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 animate-pulse"
                              title="Website-Audit läuft..."
                            >
                              Scan…
                            </span>
                          )}
                        </div>
                        <div className="text-xs font-medium pl-6" style={{ color: "var(--text-2)" }}>
                          {lead.industry || "—"}
                        </div>
                      </td>

                      {/* Typ, Status & Priorität */}
                      <td className="px-5 py-4 align-top" onClick={(e) => e.stopPropagation()}>
                        <div className="flex flex-col gap-1.5 items-start">
                          {/* Status Tag als Dropdown */}
                          <div className="relative">
                            <select
                              value={lead.status}
                              onChange={(e) => handleQuickChangeStatus(lead.id, e.target.value as LeadStatus, e)}
                              className="text-xs font-semibold px-2 py-0.5 rounded-md border outline-none cursor-pointer transition-all hover:opacity-90 tracking-wide"
                              style={{
                                background: STATUS_STYLES[lead.status as LeadStatus]?.bg || "var(--status-new-bg)",
                                color: STATUS_STYLES[lead.status as LeadStatus]?.tx || "var(--status-new-tx)",
                                borderColor: "rgba(255, 255, 255, 0.12)",
                              }}
                            >
                              {Object.entries(STATUS_LABELS).map(([k, lbl]) => (
                                <option key={k} value={k} className="bg-[var(--surface)] text-[var(--text)]">
                                  {k === "NOT_RELEVANT" ? `${lbl} (📦 Archiv)` : lbl}
                                </option>
                              ))}
                            </select>
                          </div>

                          {/* Akquise-Kanal Dropdown */}
                          <div className="relative">
                            <select
                              value={lead.acquisitionType || "CALL"}
                              onChange={(e) => handleQuickChangeAcquisition(lead.id, e.target.value, e)}
                              className="text-xs font-semibold px-2 py-0.5 rounded-md border outline-none cursor-pointer transition-all hover:opacity-90"
                              style={
                                lead.acquisitionType === "DM"
                                  ? { background: "var(--channel-dm-bg)", color: "var(--channel-dm-tx)", borderColor: "rgba(236,72,153,0.3)" }
                                  : lead.acquisitionType === "EMAIL"
                                  ? { background: "rgba(245, 158, 11, 0.15)", color: "#f59e0b", borderColor: "rgba(245, 158, 11, 0.3)" }
                                  : isWalkIn
                                  ? { background: "rgba(168, 85, 247, 0.15)", color: "rgb(192, 132, 252)", borderColor: "rgba(168, 85, 247, 0.3)" }
                                  : { background: "rgba(59, 130, 246, 0.15)", color: "rgb(96, 165, 250)", borderColor: "rgba(59, 130, 246, 0.3)" }
                              }
                            >
                              <option value="CALL" className="bg-[var(--surface)] text-[var(--text)]">Cold Call</option>
                              <option value="WALK_IN" className="bg-[var(--surface)] text-[var(--text)]">Walk-In</option>
                              <option value="DM" className="bg-[var(--surface)] text-[var(--text)]">Instagram DM</option>
                              <option value="EMAIL" className="bg-[var(--surface)] text-[var(--text)]">E-Mail</option>
                            </select>
                          </div>

                          {/* Priorität & Rating Dropdown Tag */}
                          <LeadPriorityBadge
                            leadId={lead.id}
                            status={lead.status}
                            priority={lead.priority}
                            prioritySource={lead.prioritySource}
                            priorityRatedByName={lead.priorityRatedByName || lead.priorityRatedBy?.displayName || lead.priorityRatedBy?.email}
                            priorityRatedAt={lead.priorityRatedAt}
                            variant="table"
                            onArchive={() => handleQuickMarkNotRelevant(lead.id)}
                            onUpdate={(newPrio, newSource, serverLead) => {
                              setLeads((prev) =>
                                prev.map((l) =>
                                  l.id === lead.id
                                    ? {
                                        ...l,
                                        priority: newPrio,
                                        prioritySource: newSource,
                                        priorityRatedByName: serverLead?.priorityRatedByName || (newSource === "USER" ? (l.priorityRatedByName || "Du") : null),
                                        priorityRatedAt: serverLead?.priorityRatedAt || (newSource === "USER" ? new Date().toISOString() : null),
                                      }
                                    : l
                                )
                              );
                            }}
                          />
                        </div>
                      </td>

                      {/* Kontakt */}
                      <td className="px-5 py-4 align-top" onClick={(e) => e.stopPropagation()}>
                        <div className="flex flex-col gap-1.5 text-sm">
                          {lead.phone ? (
                            <a href={`tel:${lead.phone}`} className="flex items-center gap-2 hover:underline font-mono" style={{ color: "var(--accent)" }}>
                              <Phone className="w-3.5 h-3.5 shrink-0" style={{ color: "var(--text-3)" }} />
                              {lead.phone}
                            </a>
                          ) : null}
                          {lead.website ? (
                            <a
                              href={lead.website.startsWith("http") ? lead.website : `https://${lead.website}`}
                              target="_blank"
                              rel="noreferrer"
                              className="flex items-center gap-2 hover:underline truncate max-w-[160px]"
                              style={{ color: "var(--text-2)" }}
                              title={lead.website}
                            >
                              <Globe className="w-3.5 h-3.5 shrink-0" style={{ color: "var(--text-3)" }} />
                              {lead.website.replace(/^https?:\/\/(www\.)?/, "")}
                            </a>
                          ) : null}
                          {lead.treatwellUrl ? (
                            <a
                              href={lead.treatwellUrl.startsWith("http") ? lead.treatwellUrl : `https://${lead.treatwellUrl}`}
                              target="_blank"
                              rel="noreferrer"
                              className="flex items-center gap-2 hover:underline truncate max-w-[160px] text-teal-400 font-medium"
                              title="Treatwell-Profil öffnen"
                            >
                              <Sparkles className="w-3.5 h-3.5 shrink-0 text-teal-400" />
                              Treatwell
                            </a>
                          ) : null}
                          {!lead.phone && !lead.website && !lead.treatwellUrl && <span style={{ color: "var(--text-3)" }}>Keine Kontaktdaten</span>}
                        </div>
                      </td>

                      {/* Adresse / Stadt */}
                      <td className="px-5 py-4 align-top" style={{ color: "var(--text-2)" }}>
                        <div className="flex flex-col gap-1 text-sm">
                          {lead.address && <span className="font-medium truncate max-w-[180px]">{lead.address}</span>}
                          <span style={{ color: "var(--text-3)" }}>{lead.city || "—"}</span>
                        </div>
                      </td>

                      {/* Rating */}
                      {/* Rating & Audit */}
                      <td className="px-5 py-4 align-top">
                        <div className="flex flex-col gap-1.5 items-start">
                          {lead.googleRating != null ? (
                            <div className="flex items-center gap-1.5">
                              <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400 shrink-0" />
                              <span className="font-semibold text-sm" style={{ color: "var(--text)" }}>
                                {lead.googleRating.toFixed(1)}
                              </span>
                              {lead.googleReviewCount != null && (
                                <span className="text-xs" style={{ color: "var(--text-3)" }}>({lead.googleReviewCount})</span>
                              )}
                            </div>
                          ) : (
                            <span className="text-xs" style={{ color: "var(--text-3)" }}>—</span>
                          )}

                          {/* Website Audit Risk Score */}
                          {lead.auditSeverity != null ? (
                            <span
                              className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-md border ${
                                lead.auditSeverity >= 60
                                  ? "bg-red-500/15 text-red-400 border-red-500/30"
                                  : lead.auditSeverity >= 30
                                  ? "bg-amber-500/15 text-amber-400 border-amber-500/30"
                                  : "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                              }`}
                              title={`Website Risiko-Score: ${lead.auditSeverity}/100`}
                            >
                              <ShieldAlert className="w-3 h-3 shrink-0" />
                              Audit {lead.auditSeverity}/100
                            </span>
                          ) : (lead.auditStatus === "pending" || lead.auditStatus === "running") ? (
                            <span
                              className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-400 border border-blue-500/20 animate-pulse"
                              title="Website-Audit läuft..."
                            >
                              Scan läuft…
                            </span>
                          ) : lead.website ? (
                            <span className="text-[10px]" style={{ color: "var(--text-3)" }}>
                              Audit offen
                            </span>
                          ) : null}
                        </div>
                      </td>

                      {/* Erstellt von */}
                      <td className="px-5 py-4 align-top" onClick={(e) => e.stopPropagation()}>
                        <div
                          className="flex items-center gap-2"
                          title={
                            lead.createdBy?.displayName
                              ? ("Erstellt von " + lead.createdBy.displayName)
                              : lead.createdBy?.email
                              ? ("Erstellt von " + lead.createdBy.email)
                              : "Erstellt von Team"
                          }
                        >
                          <div
                            className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 border"
                            style={{
                              background: "var(--surface-3)",
                              borderColor: "var(--border)",
                              color: "var(--accent)",
                            }}
                          >
                            {(lead.createdBy?.displayName || lead.createdBy?.email || "U").charAt(0).toUpperCase()}
                          </div>
                          <div className="flex flex-col min-w-0">
                            <span className="text-xs font-medium truncate max-w-[120px]" style={{ color: "var(--text)" }}>
                              {lead.createdBy?.displayName || (lead.createdBy?.email ? lead.createdBy.email.split("@")[0] : "—")}
                            </span>
                            {lead.createdBy?.email && (
                              <span className="text-[10px] truncate max-w-[120px]" style={{ color: "var(--text-3)" }}>
                                {lead.createdBy.email}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="px-5 py-4 align-top text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-2 opacity-100 transition-opacity">
                          {/* Maps Quick Action */}
                          {mapsUrl && (
                            <button
                              type="button"
                              onClick={() => window.open(mapsUrl, "_blank", "noopener,noreferrer")}
                              className="p-2 rounded-lg hover:bg-[var(--surface-2)] transition-colors text-sky-400"
                              title="Route auf Google Maps öffnen"
                            >
                              <Navigation className="w-4 h-4" />
                            </button>
                          )}

                          {/* NFC Demo Quick Action */}
                          {lead.nfcDemoUrl && (
                            <button
                              type="button"
                              onClick={(e) => handleCopyNfc(e, lead.nfcDemoUrl, lead.id)}
                              className="p-2 rounded-lg hover:bg-[var(--surface-2)] transition-colors text-purple-400"
                              title={copiedNfcId === lead.id ? "Kopiert!" : `NFC Demo URL kopieren`}
                            >
                              {copiedNfcId === lead.id ? (
                                <Check className="w-4 h-4 text-emerald-400" />
                              ) : (
                                <Radio className="w-4 h-4" />
                              )}
                            </button>
                          )}

                          {["NOT_RELEVANT", "LOST", "VISITED_NO_INTEREST"].includes(lead.status) ? (
                            <button
                              type="button"
                              onClick={(e) => handleQuickChangeStatus(lead.id, "NEW", e)}
                              className="p-2 rounded-lg hover:bg-emerald-500/15 transition-colors text-emerald-400"
                              title="Aus Archiv wiederherstellen (Status: Neu)"
                            >
                              <RotateCcw className="w-4 h-4" />
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={(e) => handleQuickMarkNotRelevant(lead.id, e)}
                              className="p-2 rounded-lg hover:bg-amber-500/15 transition-colors opacity-80 hover:opacity-100 text-amber-400"
                              title="Ins Archiv verschieben (Als 'Nicht relevant' markieren)"
                            >
                              <Archive className="w-4 h-4" />
                            </button>
                          )}
                          <button
                            onClick={() => setSelectedLeadId(lead.id)}
                            className="p-2 rounded-lg hover:bg-[var(--surface-2)] transition-colors"
                            title="Details anzeigen"
                            style={{ color: "var(--text-2)" }}
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteLead(lead.id, lead.companyName)}
                            className="p-2 rounded-lg hover:bg-[var(--status-lost-bg)] transition-colors"
                            title="Löschen"
                            style={{ color: "var(--status-lost-tx)" }}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-5 py-4 border-t text-sm" style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}>
            <span style={{ color: "var(--text-2)" }}>
              Seite {page} von {totalPages} ({totalLeads} Leads)
            </span>
            <div className="flex items-center gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="p-2 rounded-md border shadow-sm transition-colors disabled:opacity-40"
                style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text)" }}
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="p-2 rounded-md border shadow-sm transition-colors disabled:opacity-40"
                style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text)" }}
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      {formMounted && (
        <LeadFormModal
          isOpen={isFormOpen}
          onClose={() => setIsFormOpen(false)}
          onSuccess={() => fetchLeads()}
        />
      )}

      {selectedLeadId && (
        <LeadDetailModal
          leadId={selectedLeadId}
          onClose={() => setSelectedLeadId(null)}
          onUpdate={() => fetchLeads()}
        />
      )}
    </div>
  );
}

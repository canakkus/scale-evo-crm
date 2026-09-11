"use client";

import { useState, useEffect, useCallback } from "react";
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
} from "lucide-react";
import { StatusBadge, PriorityDot } from "@/components/ui/status-badge";
import { LeadFormModal } from "@/components/leads/lead-form-modal";
import { LeadDetailModal } from "@/components/leads/lead-detail-modal";
import { STATUS_LABELS, INDUSTRIES } from "@/lib/constants";
import { formatDate, timeAgo } from "@/lib/utils";
import type { LeadStatus } from "@prisma/client";

export function LeadsTable() {
  const [leads, setLeads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Filters & Search
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [acquisitionFilter, setAcquisitionFilter] = useState<string>("");
  const [industryFilters, setIndustryFilters] = useState<string[]>([]);
  const [availableIndustries, setAvailableIndustries] = useState<string[]>([]);
  const [isIndustryDropdownOpen, setIsIndustryDropdownOpen] = useState(false);
  const [industrySearch, setIndustrySearch] = useState("");
  const [updatedDateFilter, setUpdatedDateFilter] = useState("");
  const [customDate, setCustomDate] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalLeads, setTotalLeads] = useState(0);
  const [copiedNfcId, setCopiedNfcId] = useState<string | null>(null);

  // Modals
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set("search", search.trim());
      if (statusFilter) params.set("status", statusFilter);
      if (acquisitionFilter) params.set("acquisitionType", acquisitionFilter);
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
  }, [search, statusFilter, acquisitionFilter, industryFilters, updatedDateFilter, customDate, page]);

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

  useEffect(() => {
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

  return (
    <div className="space-y-6">
      {/* Action Bar */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
        {/* Search Input & Acquisition Type Switcher */}
        <div className="flex items-center gap-3 flex-wrap sm:flex-nowrap flex-1">
          {/* Acquisition Toggle */}
          <div
            className="inline-flex p-1 rounded-xl border max-w-fit shrink-0 shadow-inner"
            style={{ background: "var(--surface-2)", borderColor: "var(--border)" }}
          >
            <button
              type="button"
              onClick={() => {
                setAcquisitionFilter("");
                setPage(1);
              }}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
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
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                acquisitionFilter === "CALL"
                  ? "shadow-sm"
                  : "opacity-75 hover:opacity-100 hover:text-[var(--text)]"
              }`}
              style={{
                background: acquisitionFilter === "CALL" ? "var(--surface)" : "transparent",
                color: acquisitionFilter === "CALL" ? "var(--text)" : "var(--text-2)",
              }}
            >
              <Phone className="w-4 h-4 text-muted-foreground" />
              <span>Cold Calls</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setAcquisitionFilter("WALK_IN");
                setPage(1);
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                acquisitionFilter === "WALK_IN"
                  ? "shadow-sm"
                  : "opacity-75 hover:opacity-100 hover:text-[var(--text)]"
              }`}
              style={{
                background: acquisitionFilter === "WALK_IN" ? "var(--surface)" : "transparent",
                color: acquisitionFilter === "WALK_IN" ? "var(--text)" : "var(--text-2)",
              }}
            >
              <User className="w-4 h-4 text-muted-foreground" />
              <span>Walk-Ins</span>
            </button>
          </div>

          {/* Search Input */}
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "var(--text-3)" }} />
            <input
              type="text"
              placeholder="Lead suchen..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="w-full rounded-lg pl-9 pr-4 py-2 text-sm border outline-none transition-colors"
              style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text)" }}
            />
          </div>
        </div>

        {/* Filters & Add Button */}
        <div className="flex items-center gap-3 flex-wrap sm:flex-nowrap">
          {/* Update Date Filter */}
          <div className="flex items-center gap-2">
            <select
              value={updatedDateFilter}
              onChange={(e) => {
                setUpdatedDateFilter(e.target.value);
                setPage(1);
                if (e.target.value !== "custom") {
                  setCustomDate("");
                }
              }}
              className="rounded-lg px-3 py-2 text-sm font-medium border outline-none cursor-pointer"
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
                className="rounded-lg px-3 py-2 text-sm border outline-none cursor-pointer animate-fade-in"
                style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text-2)" }}
              />
            )}
          </div>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="rounded-lg px-3 py-2 text-sm font-medium border outline-none cursor-pointer"
            style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text-2)" }}
          >
            <option value="">Alle Status</option>
            {Object.entries(STATUS_LABELS).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>

          {/* Multi-Select Industry Filter */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsIndustryDropdownOpen(!isIndustryDropdownOpen)}
              className="rounded-lg px-3 py-2 text-sm font-medium border outline-none cursor-pointer flex items-center gap-2 transition-colors hidden md:flex"
              style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text-2)" }}
            >
              <Filter className="w-4 h-4" />
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

          {/* Refresh Button */}
          <button
            type="button"
            onClick={() => fetchLeads()}
            disabled={loading}
            title="Leads aktualisieren"
            className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium border outline-none transition-all cursor-pointer hover:bg-[var(--surface-2)] active:scale-95 disabled:opacity-50"
            style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text-2)" }}
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin text-[var(--accent)]" : ""}`} />
            <span className="hidden sm:inline">Aktualisieren</span>
          </button>

          {/* New Lead Button */}
          <button
            onClick={() => setIsFormOpen(true)}
            className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold shadow-sm transition-all"
            style={{ background: "var(--accent)", color: "var(--bg)" }}
          >
            <Plus className="w-4 h-4" />
            Neuer Lead
          </button>
        </div>
      </div>

      {/* Table Container */}
      <div className="rounded-xl border overflow-hidden shadow-sm" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="border-b" style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}>
                <th className="px-5 py-3 font-medium" style={{ color: "var(--text-2)" }}>Firma / Branche</th>
                <th className="px-5 py-3 font-medium" style={{ color: "var(--text-2)" }}>Typ & Status</th>
                <th className="px-5 py-3 font-medium" style={{ color: "var(--text-2)" }}>Kontakt</th>
                <th className="px-5 py-3 font-medium" style={{ color: "var(--text-2)" }}>Adresse / Stadt</th>
                <th className="px-5 py-3 font-medium" style={{ color: "var(--text-2)" }}>Bewertung</th>
                <th className="px-5 py-3 font-medium text-right" style={{ color: "var(--text-2)" }}>Aktionen</th>
              </tr>
            </thead>
            <tbody className="divide-y" style={{ borderColor: "var(--border)" }}>
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center" style={{ color: "var(--text-3)" }}>
                    <div className="w-6 h-6 rounded-full border-2 border-t-transparent animate-spin mx-auto mb-3" style={{ borderColor: "var(--border-2)", borderTopColor: "var(--accent)" }} />
                    Leads werden geladen…
                  </td>
                </tr>
              ) : leads.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-base" style={{ color: "var(--text-3)" }}>
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
                      {/* Firma */}
                      <td className="px-5 py-4 align-top">
                        <div className="flex items-center gap-2 font-semibold text-base mb-1" style={{ color: "var(--text)" }}>
                          <span>{lead.companyName}</span>
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
                        </div>
                        <div className="text-xs font-medium" style={{ color: "var(--text-2)" }}>
                          {lead.industry || "—"}
                        </div>
                      </td>

                      {/* Typ & Status */}
                      <td className="px-5 py-4 align-top">
                        <div className="flex flex-col gap-2 items-start">
                          <StatusBadge status={lead.status} />
                          <span
                            className="text-xs font-medium px-2 py-1 rounded-md"
                            style={{
                              background: isWalkIn ? "rgba(168, 85, 247, 0.1)" : "rgba(59, 130, 246, 0.1)",
                              color: isWalkIn ? "rgb(192, 132, 252)" : "rgb(96, 165, 250)",
                            }}
                          >
                            {isWalkIn ? "Walk-In" : "Cold Call"}
                          </span>
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
                            >
                              <Globe className="w-3.5 h-3.5 shrink-0" style={{ color: "var(--text-3)" }} />
                              {lead.website.replace(/^https?:\/\/(www\.)?/, "")}
                            </a>
                          ) : null}
                          {!lead.phone && !lead.website && <span style={{ color: "var(--text-3)" }}>Keine Kontaktdaten</span>}
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
                      <td className="px-5 py-4 align-top">
                        {lead.googleRating != null ? (
                          <div className="flex items-center gap-1.5">
                            <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
                            <span className="font-semibold text-sm" style={{ color: "var(--text)" }}>
                              {lead.googleRating.toFixed(1)}
                            </span>
                            {lead.googleReviewCount != null && (
                              <span className="text-xs" style={{ color: "var(--text-3)" }}>({lead.googleReviewCount})</span>
                            )}
                          </div>
                        ) : (
                          <span style={{ color: "var(--text-3)" }}>—</span>
                        )}
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
      <LeadFormModal
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        onSuccess={() => fetchLeads()}
      />

      <LeadDetailModal
        leadId={selectedLeadId}
        onClose={() => setSelectedLeadId(null)}
        onUpdate={() => fetchLeads()}
      />
    </div>
  );
}

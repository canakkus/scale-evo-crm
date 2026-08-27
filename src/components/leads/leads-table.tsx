"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Search,
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
  const [industryFilters, setIndustryFilters] = useState<string[]>([]);
  const [availableIndustries, setAvailableIndustries] = useState<string[]>([]);
  const [isIndustryDropdownOpen, setIsIndustryDropdownOpen] = useState(false);
  const [industrySearch, setIndustrySearch] = useState("");
  const [updatedDateFilter, setUpdatedDateFilter] = useState("");
  const [customDate, setCustomDate] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalLeads, setTotalLeads] = useState(0);

  // Modals
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set("search", search.trim());
      if (statusFilter) params.set("status", statusFilter);
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
  }, [search, statusFilter, industryFilters, updatedDateFilter, customDate, page]);

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
    <div className="space-y-4">
      {/* Action Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Search Input */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "var(--text-3)" }} />
          <input
            type="text"
            placeholder="Lead suchen (Name, Stadt, Telefon)..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="w-full rounded-md pl-9 pr-4 py-2 text-sm border outline-none transition-colors"
            style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text)" }}
          />
        </div>

        {/* Filters & Add Button */}
        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
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
              className="rounded-md px-3 py-2 text-xs font-medium border outline-none cursor-pointer"
              style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text-2)" }}
            >
              <option value="">Zuletzt geändert: Jederzeit</option>
              <option value="today">Heute</option>
              <option value="yesterday">Gestern</option>
              <option value="thisWeek">Diese Woche</option>
              <option value="custom">Anderes Datum...</option>
            </select>

            {updatedDateFilter === "custom" && (
              <input
                type="date"
                value={customDate}
                onChange={(e) => {
                  setCustomDate(e.target.value);
                  setPage(1);
                }}
                className="rounded-md px-2.5 py-1.5 text-xs border outline-none cursor-pointer animate-fade-in"
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
            className="rounded-md px-3 py-2 text-xs font-medium border outline-none cursor-pointer"
            style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text-2)" }}
          >
            <option value="">Alle Status ({totalLeads})</option>
            {Object.entries(STATUS_LABELS).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>

          {/* Multi-Select Industry Filter */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsIndustryDropdownOpen(!isIndustryDropdownOpen)}
              className="rounded-md px-3 py-2 text-xs font-medium border outline-none cursor-pointer flex items-center gap-1.5 transition-colors hidden md:flex"
              style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text-2)" }}
            >
              <Filter className="w-3.5 h-3.5" />
              <span>
                {industryFilters.length === 0
                  ? "Alle Branchen"
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
                  className="absolute right-0 mt-1 w-64 rounded-md border shadow-lg p-3 space-y-2.5 z-20 animate-fade-in"
                  style={{ background: "var(--surface)", borderColor: "var(--border)" }}
                >
                  <input
                    type="text"
                    placeholder="Branche suchen..."
                    value={industrySearch}
                    onChange={(e) => setIndustrySearch(e.target.value)}
                    className="w-full rounded px-2.5 py-1 text-xs border outline-none"
                    style={{ background: "var(--surface-2)", borderColor: "var(--border)", color: "var(--text)" }}
                  />

                  <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                    {/* Option: Keine Angabe */}
                    <label className="flex items-center gap-2 cursor-pointer text-xs p-1 rounded hover:bg-[var(--surface-2)]">
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
                        <label key={ind} className="flex items-center gap-2 cursor-pointer text-xs p-1 rounded hover:bg-[var(--surface-2)]">
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

                  <div className="flex items-center justify-between border-t pt-2" style={{ borderColor: "var(--border)" }}>
                    <button
                      type="button"
                      onClick={() => {
                        setIndustryFilters([]);
                        setPage(1);
                      }}
                      className="text-[10px] font-bold uppercase transition-colors hover:text-[var(--accent)]"
                      style={{ color: "var(--text-3)" }}
                    >
                      Filter zurücksetzen
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsIndustryDropdownOpen(false)}
                      className="text-[10px] font-bold uppercase rounded px-2.5 py-1"
                      style={{ background: "var(--accent)", color: "var(--bg)" }}
                    >
                      Fertig
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* New Lead Button */}
          <button
            onClick={() => setIsFormOpen(true)}
            className="flex items-center gap-1.5 rounded-md px-3.5 py-2 text-xs font-semibold shadow-sm transition-all"
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
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b" style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}>
                <th className="px-4 py-3 font-semibold" style={{ color: "var(--text-2)" }}>Firma / Branche</th>
                <th className="px-4 py-3 font-semibold" style={{ color: "var(--text-2)" }}>Status</th>
                <th className="px-4 py-3 font-semibold" style={{ color: "var(--text-2)" }}>Kontakt</th>
                <th className="px-4 py-3 font-semibold" style={{ color: "var(--text-2)" }}>Stadt</th>
                <th className="px-4 py-3 font-semibold" style={{ color: "var(--text-2)" }}>Bewertung</th>
                <th className="px-4 py-3 font-semibold" style={{ color: "var(--text-2)" }}>Letzter Kontakt</th>
                <th className="px-4 py-3 font-semibold text-right" style={{ color: "var(--text-2)" }}>Aktionen</th>
              </tr>
            </thead>
            <tbody className="divide-y" style={{ borderColor: "var(--border)" }}>
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center" style={{ color: "var(--text-3)" }}>
                    <div className="w-5 h-5 rounded-full border-2 border-t-transparent animate-spin mx-auto mb-2" style={{ borderColor: "var(--border-2)", borderTopColor: "var(--accent)" }} />
                    Leads werden geladen…
                  </td>
                </tr>
              ) : leads.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center" style={{ color: "var(--text-3)" }}>
                    Keine Leads gefunden.
                  </td>
                </tr>
              ) : (
                leads.map((lead) => (
                  <tr
                    key={lead.id}
                    onClick={() => setSelectedLeadId(lead.id)}
                    className="hover:bg-[var(--surface-3)] transition-colors cursor-pointer group"
                  >
                    {/* Firma */}
                    <td className="px-4 py-3.5">
                      <div className="font-semibold text-sm" style={{ color: "var(--text)" }}>
                        {lead.companyName}
                      </div>
                      <div className="text-[11px]" style={{ color: "var(--text-2)" }}>
                        {lead.industry || "—"}
                      </div>
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3.5">
                      <StatusBadge status={lead.status} />
                    </td>

                    {/* Kontakt */}
                    <td className="px-4 py-3.5" onClick={(e) => e.stopPropagation()}>
                      <div className="flex flex-col gap-0.5 text-[11px]">
                        {lead.phone ? (
                          <a href={`tel:${lead.phone}`} className="flex items-center gap-1.5 hover:underline font-mono" style={{ color: "var(--accent)" }}>
                            <Phone className="w-3 h-3 shrink-0" style={{ color: "var(--text-3)" }} />
                            {lead.phone}
                          </a>
                        ) : null}
                        {lead.website ? (
                          <a
                            href={lead.website.startsWith("http") ? lead.website : `https://${lead.website}`}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center gap-1.5 hover:underline truncate max-w-[160px]"
                            style={{ color: "var(--text-2)" }}
                          >
                            <Globe className="w-3 h-3 shrink-0" style={{ color: "var(--text-3)" }} />
                            {lead.website.replace(/^https?:\/\/(www\.)?/, "")}
                          </a>
                        ) : null}
                        {!lead.phone && !lead.website && <span style={{ color: "var(--text-3)" }}>Keine Kontaktdaten</span>}
                      </div>
                    </td>

                    {/* Stadt */}
                    <td className="px-4 py-3.5" style={{ color: "var(--text-2)" }}>
                      {lead.city || "—"}
                    </td>

                    {/* Rating */}
                    <td className="px-4 py-3.5">
                      {lead.googleRating != null ? (
                        <div className="flex items-center gap-1">
                          <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                          <span className="font-semibold" style={{ color: "var(--text)" }}>
                            {lead.googleRating.toFixed(1)}
                          </span>
                          {lead.googleReviewCount != null && (
                            <span style={{ color: "var(--text-3)" }}>({lead.googleReviewCount})</span>
                          )}
                        </div>
                      ) : (
                        <span style={{ color: "var(--text-3)" }}>—</span>
                      )}
                    </td>

                    {/* Letzter Kontakt */}
                    <td className="px-4 py-3.5 text-[11px]" style={{ color: "var(--text-3)" }}>
                      {lead.lastContactAt ? timeAgo(lead.lastContactAt) : "Noch nie"}
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3.5 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => setSelectedLeadId(lead.id)}
                          className="p-1.5 rounded hover:bg-[var(--surface-2)] transition-colors"
                          title="Details anzeigen"
                          style={{ color: "var(--text-2)" }}
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteLead(lead.id, lead.companyName)}
                          className="p-1.5 rounded hover:bg-[var(--status-lost-bg)] transition-colors"
                          title="Löschen"
                          style={{ color: "var(--status-lost-tx)" }}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t text-xs" style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}>
            <span style={{ color: "var(--text-2)" }}>
              Seite {page} von {totalPages} ({totalLeads} Leads gesamt)
            </span>
            <div className="flex items-center gap-1">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="p-1.5 rounded border transition-colors disabled:opacity-40"
                style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text)" }}
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="p-1.5 rounded border transition-colors disabled:opacity-40"
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

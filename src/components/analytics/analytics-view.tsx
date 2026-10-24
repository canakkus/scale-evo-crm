"use client";

import { useState, useEffect } from "react";
import {
  BarChart3,
  TrendingUp,
  Users,
  Building2,
  Calendar,
  ExternalLink,
  ChevronRight,
  UserCheck,
  Award,
} from "lucide-react";
import { StatusBadge } from "@/components/ui/status-badge";
import { LeadDetailModal } from "@/components/leads/lazy-modals";
import { formatDate } from "@/lib/utils";
import type { LeadStatus } from "@prisma/client";

interface UserLeadStats {
  user: {
    id: string;
    displayName: string;
    email: string;
  };
  totalCreated: number;
  wonCount: number;
  recentCreated: Array<{
    id: string;
    companyName: string;
    industry: string | null;
    city: string | null;
    status: LeadStatus;
    createdAt: string;
  }>;
}

type DashboardData = {
  metrics: {
    totalLeads: number;
    contactedLeads: number;
    wonLeads: number;
    totalCalls: number;
  };
  leadsByUser?: UserLeadStats[];
};

export function AnalyticsView({ initialData }: { initialData?: DashboardData | null }) {
  const [data, setData] = useState<DashboardData | null>(initialData ?? null);
  const [loading, setLoading] = useState(!initialData);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(
    initialData?.leadsByUser?.[0]?.user?.id ?? null,
  );

  useEffect(() => {
    if (initialData) return;
    fetch("/api/dashboard")
      .then((res) => res.json())
      .then((resData: DashboardData) => {
        setData(resData);
        if (resData?.leadsByUser && resData.leadsByUser.length > 0) {
          setSelectedUserId(resData.leadsByUser[0].user.id);
        }
      })
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  }, [initialData]);

  if (loading) {
    return (
      <div className="p-12 text-center text-xs" style={{ color: "var(--text-3)" }}>
        Analytics wird geladen…
      </div>
    );
  }

  const metrics = data?.metrics ?? {
    totalLeads: 0,
    contactedLeads: 0,
    wonLeads: 0,
    totalCalls: 0,
  };
  const leadsByUser: UserLeadStats[] = data?.leadsByUser || [];
  const conversionRate = metrics.totalLeads > 0 ? ((metrics.wonLeads / metrics.totalLeads) * 100).toFixed(1) : "0.0";
  const contactRate = metrics.totalLeads > 0 ? ((metrics.contactedLeads / metrics.totalLeads) * 100).toFixed(1) : "0.0";

  const activeUserStats = leadsByUser.find((u) => u.user.id === selectedUserId) || leadsByUser[0];

  return (
    <div className="p-6 space-y-8 max-w-7xl mx-auto">
      <div>
        <h1 className="font-heading text-2xl font-bold tracking-tight" style={{ color: "var(--text)" }}>
          Analytics & Performance
        </h1>
        <p className="mt-1 text-xs" style={{ color: "var(--text-2)" }}>
          Einblicke in deine Conversion-Rate, Akquise-Aktivitäten und Lead-Verteilung nach Team-Mitgliedern.
        </p>
      </div>

      {/* Metrics Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-xl border p-5 space-y-2 shadow-xs" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
          <span className="text-xs font-semibold" style={{ color: "var(--text-2)" }}>Abschluss-Quote (Won)</span>
          <div className="flex items-baseline justify-between">
            <span className="font-heading text-3xl font-bold" style={{ color: "var(--status-warm-tx)" }}>{conversionRate}%</span>
            <TrendingUp className="w-5 h-5" style={{ color: "var(--status-warm-tx)" }} />
          </div>
          <p className="text-[11px]" style={{ color: "var(--text-3)" }}>{metrics.wonLeads} von {metrics.totalLeads} Leads gewonnen</p>
        </div>

        <div className="rounded-xl border p-5 space-y-2 shadow-xs" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
          <span className="text-xs font-semibold" style={{ color: "var(--text-2)" }}>Kontaktierungs-Quote</span>
          <div className="flex items-baseline justify-between">
            <span className="font-heading text-3xl font-bold" style={{ color: "var(--status-contacted-tx)" }}>{contactRate}%</span>
            <Users className="w-5 h-5" style={{ color: "var(--status-contacted-tx)" }} />
          </div>
          <p className="text-[11px]" style={{ color: "var(--text-3)" }}>{metrics.contactedLeads} kontaktiert</p>
        </div>

        <div className="rounded-xl border p-5 space-y-2 shadow-xs" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
          <span className="text-xs font-semibold" style={{ color: "var(--text-2)" }}>Gemini KI Calls</span>
          <div className="flex items-baseline justify-between">
            <span className="font-heading text-3xl font-bold" style={{ color: "var(--accent)" }}>{metrics.totalCalls || 0}</span>
            <BarChart3 className="w-5 h-5" style={{ color: "var(--accent)" }} />
          </div>
          <p className="text-[11px]" style={{ color: "var(--text-3)" }}>Transkribierte Verkaufsgespräche</p>
        </div>
      </div>

      {/* Team / Lead-Ersteller Sektion */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="font-heading text-lg font-semibold flex items-center gap-2" style={{ color: "var(--text)" }}>
              <Users className="w-5 h-5" style={{ color: "var(--accent)" }} />
              Leads nach Ersteller (Team-Performance)
            </h2>
            <p className="text-xs mt-0.5" style={{ color: "var(--text-2)" }}>
              Übersicht, welches Team-Mitglied wie viele Leads ins CRM eingebracht hat.
            </p>
          </div>
        </div>

        {/* User Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {leadsByUser.map((item, index) => {
            const isSelected = item.user.id === activeUserStats?.user.id;
            const percentage = metrics.totalLeads > 0 ? ((item.totalCreated / metrics.totalLeads) * 100).toFixed(0) : "0";

            return (
              <button
                key={item.user.id}
                type="button"
                onClick={() => setSelectedUserId(item.user.id)}
                className={`text-left rounded-xl border p-5 space-y-3 transition-all cursor-pointer relative ${
                  isSelected ? "ring-2 ring-blue-500 shadow-sm" : "hover:border-slate-300"
                }`}
                style={{
                  background: isSelected ? "var(--surface)" : "var(--surface)",
                  borderColor: isSelected ? "var(--accent)" : "var(--border)",
                }}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm shrink-0"
                      style={{
                        background: isSelected ? "var(--accent)" : "var(--surface-2)",
                        color: isSelected ? "#FFFFFF" : "var(--text)",
                      }}
                    >
                      {item.user.displayName?.charAt(0)?.toUpperCase() || "U"}
                    </div>
                    <div>
                      <h3 className="font-heading font-semibold text-sm leading-tight flex items-center gap-1.5" style={{ color: "var(--text)" }}>
                        {item.user.displayName}
                        {index === 0 && item.totalCreated > 0 && (
                          <span title="Top-Ersteller">
                            <Award className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                          </span>
                        )}
                      </h3>
                      <p className="text-[11px] truncate max-w-[170px]" style={{ color: "var(--text-3)" }}>
                        {item.user.email}
                      </p>
                    </div>
                  </div>
                  <span
                    className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
                    style={{ background: "var(--surface-2)", color: "var(--text-2)" }}
                  >
                    {percentage}%
                  </span>
                </div>

                {/* Progress bar */}
                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span style={{ color: "var(--text-2)" }}>Erstellte Leads:</span>
                    <span className="font-bold font-mono" style={{ color: "var(--text)" }}>{item.totalCreated}</span>
                  </div>
                  <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: "var(--surface-3)" }}>
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${percentage}%`,
                        background: "var(--accent)",
                      }}
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1 text-[11px]" style={{ color: "var(--text-3)" }}>
                  <span>Gewonnen: <strong style={{ color: "var(--status-warm-tx)" }}>{item.wonCount}</strong></span>
                  <span className="flex items-center gap-1 font-medium" style={{ color: isSelected ? "var(--accent)" : "var(--text-3)" }}>
                    Details anzeigen <ChevronRight className="w-3.5 h-3.5" />
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Detail-Liste der zuletzt erstellten Leads für den ausgewählten Benutzer */}
        {activeUserStats && (
          <div className="rounded-xl border p-5 space-y-4" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b" style={{ borderColor: "var(--border)" }}>
              <div>
                <h3 className="font-heading font-semibold text-sm flex items-center gap-2" style={{ color: "var(--text)" }}>
                  <Building2 className="w-4 h-4" style={{ color: "var(--accent)" }} />
                  Zuletzt erstellte Leads von {activeUserStats.user.displayName}
                </h3>
                <p className="text-[11px]" style={{ color: "var(--text-3)" }}>
                  Zeigt die neuesten Leads, die {activeUserStats.user.displayName} in das CRM eingepflegt hat.
                </p>
              </div>
              <a
                href={`/leads`}
                className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors hover:bg-slate-50"
                style={{ borderColor: "var(--border)", color: "var(--text-2)" }}
              >
                In Lead-Tabelle ansehen
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>

            {activeUserStats.recentCreated.length === 0 ? (
              <div className="py-8 text-center text-xs" style={{ color: "var(--text-3)" }}>
                Keine Leads von diesem Benutzer vorhanden.
              </div>
            ) : (
              <div className="divide-y" style={{ borderColor: "var(--border)" }}>
                {activeUserStats.recentCreated.map((lead) => (
                  <div
                    key={lead.id}
                    onClick={() => setSelectedLeadId(lead.id)}
                    className="py-3 px-2 flex items-center justify-between hover:bg-slate-50/70 rounded-lg transition-colors cursor-pointer group"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm group-hover:text-blue-600 transition-colors" style={{ color: "var(--text)" }}>
                          {lead.companyName}
                        </span>
                        <StatusBadge status={lead.status} />
                      </div>
                      <div className="flex items-center gap-3 text-[11px]" style={{ color: "var(--text-3)" }}>
                        {lead.city && <span>📍 {lead.city}</span>}
                        {lead.industry && <span>🏢 {lead.industry}</span>}
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {formatDate(lead.createdAt)}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 text-xs font-medium opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: "var(--accent)" }}>
                      <span>Öffnen</span>
                      <ChevronRight className="w-4 h-4" />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modal für Lead-Details */}
      {selectedLeadId && (
        <LeadDetailModal
          leadId={selectedLeadId}
          onClose={() => setSelectedLeadId(null)}
          onUpdate={() => {
            // Nach Lead-Update Dashboard-Daten refreshen
            fetch("/api/dashboard")
              .then((res) => res.json())
              .then((resData) => setData(resData))
              .catch(console.error);
          }}
        />
      )}
    </div>
  );
}

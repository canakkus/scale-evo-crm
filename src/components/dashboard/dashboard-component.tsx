"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Users,
  PhoneCall,
  CalendarClock,
  Trophy,
  CheckSquare,
  Sparkles,
  ArrowUpRight,
  Plus,
  Radar,
  Upload,
  ArrowRight,
  MapPin,
  Star,
} from "lucide-react";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatDate, timeAgo } from "@/lib/utils";

export function DashboardComponent({ initialData }: { initialData?: any }) {
  const [data, setData] = useState<any>(initialData || null);
  const [loading, setLoading] = useState(!initialData);

  useEffect(() => {
    if (!initialData) {
      fetch("/api/dashboard")
        .then((res) => res.json())
        .then((resData) => setData(resData))
        .catch((err) => console.error(err))
        .finally(() => setLoading(false));
    }
  }, [initialData]);

  if (loading) {
    return (
      <div className="p-12 text-center text-xs" style={{ color: "var(--text-3)" }}>
        <div className="w-5 h-5 rounded-full border-2 border-t-transparent animate-spin mx-auto mb-2" style={{ borderColor: "var(--border-2)", borderTopColor: "var(--accent)" }} />
        Dashboard lädt…
      </div>
    );
  }

  const metrics = data?.metrics || {};

  const cards = [
    { label: "Gesamt Leads", value: metrics.totalLeads || 0, icon: Users, href: "/leads", color: "var(--status-new-tx)" },
    { label: "In Kontakt", value: metrics.contactedLeads || 0, icon: PhoneCall, href: "/pipeline", color: "var(--status-contacted-tx)" },
    { label: "Offene Follow-ups", value: metrics.openFollowUps || 0, icon: CalendarClock, href: "/follow-ups", color: "var(--status-planned-tx)" },
    { label: "Gewonnene Kunden", value: metrics.wonLeads || 0, icon: Trophy, href: "/leads?status=WON", color: "var(--status-warm-tx)" },
    { label: "Call-Aufnahmen", value: metrics.totalCalls || 0, icon: Sparkles, href: "/cold-calls", color: "var(--status-warm-tx)" },
    { label: "Offene Tasks", value: metrics.openTasks || 0, icon: CheckSquare, href: "/tasks", color: "var(--accent)" },
  ];

  return (
    <div className="space-y-6">
      {/* Metric Cards Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        {cards.map((card, i) => {
          const Icon = card.icon;
          return (
            <Link
              key={i}
              href={card.href}
              className="rounded-xl border p-4 transition-all hover:shadow-md hover:border-[var(--border-2)] group flex flex-col justify-between"
              style={{ background: "var(--surface)", borderColor: "var(--border)" }}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold" style={{ color: "var(--text-2)" }}>{card.label}</span>
                <Icon className="w-4 h-4" style={{ color: card.color }} />
              </div>
              <div className="mt-3 flex items-baseline justify-between">
                <span className="font-heading text-2xl font-bold tracking-tight" style={{ color: "var(--text)" }}>
                  {card.value}
                </span>
                <ArrowUpRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: "var(--text-3)" }} />
              </div>
            </Link>
          );
        })}
      </div>

      {/* Quick Action Shortcuts */}
      <div className="rounded-xl border p-5 space-y-3" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
        <h3 className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--text-3)" }}>
          Schnellaktionen
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Link
            href="/lead-scout"
            className="flex items-center gap-3 p-3 rounded-lg border transition-all hover:border-[var(--accent)]"
            style={{ background: "var(--surface-2)", borderColor: "var(--border)" }}
          >
            <div className="p-2 rounded-md" style={{ background: "var(--surface-3)", color: "var(--status-warm-tx)" }}>
              <Radar className="w-4 h-4" />
            </div>
            <div>
              <p className="text-xs font-bold" style={{ color: "var(--text)" }}>Lead Scout 3.0</p>
              <p className="text-[11px]" style={{ color: "var(--text-2)" }}>Treatwell & Places scouten</p>
            </div>
          </Link>

          <Link
            href="/cold-calls"
            className="flex items-center gap-3 p-3 rounded-lg border transition-all hover:border-[var(--accent)]"
            style={{ background: "var(--surface-2)", borderColor: "var(--border)" }}
          >
            <div className="p-2 rounded-md" style={{ background: "var(--surface-3)", color: "var(--status-contacted-tx)" }}>
              <Upload className="w-4 h-4" />
            </div>
            <div>
              <p className="text-xs font-bold" style={{ color: "var(--text)" }}>Call-Upload</p>
              <p className="text-[11px]" style={{ color: "var(--text-2)" }}>Gemini KI Transkription</p>
            </div>
          </Link>

          <Link
            href="/ai"
            className="flex items-center gap-3 p-3 rounded-lg border transition-all hover:border-[var(--accent)]"
            style={{ background: "var(--surface-2)", borderColor: "var(--border)" }}
          >
            <div className="p-2 rounded-md" style={{ background: "var(--surface-3)", color: "var(--status-planned-tx)" }}>
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <p className="text-xs font-bold" style={{ color: "var(--text)" }}>KI-Assistent Chat</p>
              <p className="text-[11px]" style={{ color: "var(--text-2)" }}>Strategien & Outreach Text</p>
            </div>
          </Link>
        </div>
      </div>

      {/* Main Content Grid: Recent Leads & Follow-ups */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Neueste Leads */}
        <div className="rounded-xl border p-5 space-y-4" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--text-2)" }}>
              Neueste Leads
            </h3>
            <Link href="/leads" className="text-xs font-semibold hover:underline flex items-center gap-1" style={{ color: "var(--accent)" }}>
              Alle anzeigen <ArrowRight className="w-3 h-3" />
            </Link>
          </div>

          <div className="divide-y" style={{ borderColor: "var(--border)" }}>
            {data?.recentLeads?.length === 0 ? (
              <p className="py-6 text-center text-xs" style={{ color: "var(--text-3)" }}>Keine Leads im System.</p>
            ) : (
              data?.recentLeads?.map((lead: any) => (
                <div key={lead.id} className="py-3 flex items-center justify-between gap-3">
                  <div>
                    <Link href="/leads" className="font-semibold text-xs hover:underline" style={{ color: "var(--text)" }}>
                      {lead.companyName}
                    </Link>
                    <p className="text-[11px]" style={{ color: "var(--text-3)" }}>
                      {lead.industry || "Branche k.A."} · {lead.city || "—"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={lead.status} />
                    <span className="text-[10px]" style={{ color: "var(--text-3)" }}>{timeAgo(lead.createdAt)}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Anstehende Follow-ups */}
        <div className="rounded-xl border p-5 space-y-4" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--text-2)" }}>
              Anstehende Follow-ups
            </h3>
            <Link href="/follow-ups" className="text-xs font-semibold hover:underline flex items-center gap-1" style={{ color: "var(--accent)" }}>
              Alle Follow-ups <ArrowRight className="w-3 h-3" />
            </Link>
          </div>

          <div className="divide-y" style={{ borderColor: "var(--border)" }}>
            {data?.upcomingFollowUps?.length === 0 ? (
              <p className="py-6 text-center text-xs" style={{ color: "var(--text-3)" }}>Keine anstehenden Follow-ups.</p>
            ) : (
              data?.upcomingFollowUps?.map((lead: any) => (
                <div key={lead.id} className="py-3 flex items-center justify-between gap-3">
                  <div>
                    <span className="font-semibold text-xs" style={{ color: "var(--text)" }}>
                      {lead.companyName}
                    </span>
                    <p className="text-[11px]" style={{ color: "var(--text-3)" }}>
                      {lead.phone ? `Tel: ${lead.phone}` : "Keine Tel."} · {lead.city || "—"}
                    </p>
                  </div>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded" style={{ background: "var(--status-planned-bg)", color: "var(--status-planned-tx)" }}>
                    {lead.nextFollowUpAt ? formatDate(lead.nextFollowUpAt) : "Heute"}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

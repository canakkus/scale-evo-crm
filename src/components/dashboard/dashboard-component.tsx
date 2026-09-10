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
  Radar,
  Upload,
  ArrowRight,
  Radio,
} from "lucide-react";
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
      <div className="p-12 text-center text-sm" style={{ color: "var(--text-3)" }}>
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
    { label: "Call-Aufnahmen", value: metrics.totalCalls || 0, icon: Radio, href: "/cold-calls", color: "var(--status-warm-tx)" },
    { label: "Offene Tasks", value: metrics.openTasks || 0, icon: CheckSquare, href: "/tasks", color: "var(--accent)" },
  ];

  return (
    <div className="space-y-12 pb-16">
      {/* Metric Cards Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {cards.map((card, i) => {
          const Icon = card.icon;
          return (
            <Link
              key={i}
              href={card.href}
              className="p-4 transition-opacity hover:opacity-80 group flex flex-col justify-between rounded-2xl"
              style={{ background: "var(--surface-2)" }}
            >
              <div className="flex items-center gap-2 mb-3">
                <Icon className="w-4 h-4" style={{ color: card.color }} />
                <span className="text-[13px] font-medium" style={{ color: "var(--text-2)" }}>{card.label}</span>
              </div>
              <div className="flex items-baseline justify-between mt-1">
                <span className="font-heading text-3xl font-medium tracking-tight" style={{ color: "var(--text)" }}>
                  {card.value}
                </span>
              </div>
            </Link>
          );
        })}
      </div>

      {/* Quick Action Shortcuts */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold tracking-tight" style={{ color: "var(--text)" }}>
          Schnellaktionen
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Link
            href="/lead-scout"
            className="flex items-center gap-4 p-4 rounded-2xl transition-opacity hover:opacity-80"
            style={{ background: "var(--surface-2)" }}
          >
            <Radar className="w-5 h-5" style={{ color: "var(--status-warm-tx)" }} />
            <div>
              <p className="text-sm font-medium" style={{ color: "var(--text)" }}>Lead Scout 3.0</p>
              <p className="text-[13px]" style={{ color: "var(--text-2)" }}>Treatwell & Places scouten</p>
            </div>
          </Link>

          <Link
            href="/cold-calls"
            className="flex items-center gap-4 p-4 rounded-2xl transition-opacity hover:opacity-80"
            style={{ background: "var(--surface-2)" }}
          >
            <Upload className="w-5 h-5" style={{ color: "var(--status-contacted-tx)" }} />
            <div>
              <p className="text-sm font-medium" style={{ color: "var(--text)" }}>Call-Upload</p>
              <p className="text-[13px]" style={{ color: "var(--text-2)" }}>Gemini KI Transkription</p>
            </div>
          </Link>

          <Link
            href="/ai"
            className="flex items-center gap-4 p-4 rounded-2xl transition-opacity hover:opacity-80"
            style={{ background: "var(--surface-2)" }}
          >
            <Sparkles className="w-5 h-5" style={{ color: "var(--status-planned-tx)" }} />
            <div>
              <p className="text-sm font-medium" style={{ color: "var(--text)" }}>KI-Assistent Chat</p>
              <p className="text-[13px]" style={{ color: "var(--text-2)" }}>Strategien & Outreach Text</p>
            </div>
          </Link>
        </div>
      </div>

      {/* Main Content Grid: Recent Leads & Follow-ups */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
        {/* Neueste Leads */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold tracking-tight" style={{ color: "var(--text)" }}>
              Neueste Leads
            </h3>
            <Link href="/leads" className="text-sm hover:underline flex items-center gap-1" style={{ color: "var(--accent)" }}>
              Alle anzeigen <ArrowRight className="w-4 h-4" />
            </Link>
          </div>

          <div className="flex flex-col">
            {data?.recentLeads?.length === 0 ? (
              <p className="py-4 text-[13px]" style={{ color: "var(--text-3)" }}>Keine Leads im System.</p>
            ) : (
              data?.recentLeads?.map((lead: any) => (
                <div key={lead.id} className="py-3 flex items-center justify-between group border-b last:border-0" style={{ borderColor: "var(--border)" }}>
                  <div className="flex flex-col">
                    <Link href="/leads" className="font-medium text-[15px] hover:underline" style={{ color: "var(--text)" }}>
                      {lead.companyName}
                    </Link>
                    <p className="text-sm mt-0.5" style={{ color: "var(--text-2)" }}>
                      {lead.industry || "Branche k.A."} · {lead.city || "—"}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className="text-sm font-medium" style={{ color: "var(--text-2)" }}>{lead.status}</span>
                    <span className="text-[13px]" style={{ color: "var(--text-3)" }}>{timeAgo(lead.createdAt)}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Anstehende Follow-ups */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold tracking-tight" style={{ color: "var(--text)" }}>
              Anstehende Follow-ups
            </h3>
            <Link href="/follow-ups" className="text-sm hover:underline flex items-center gap-1" style={{ color: "var(--accent)" }}>
              Alle Follow-ups <ArrowRight className="w-4 h-4" />
            </Link>
          </div>

          <div className="flex flex-col">
            {data?.upcomingFollowUps?.length === 0 ? (
              <p className="py-4 text-[13px]" style={{ color: "var(--text-3)" }}>Keine anstehenden Follow-ups.</p>
            ) : (
              data?.upcomingFollowUps?.map((lead: any) => (
                <div key={lead.id} className="py-3 flex items-center justify-between border-b last:border-0" style={{ borderColor: "var(--border)" }}>
                  <div className="flex flex-col">
                    <span className="font-medium text-[15px]" style={{ color: "var(--text)" }}>
                      {lead.companyName}
                    </span>
                    <p className="text-sm mt-0.5" style={{ color: "var(--text-2)" }}>
                      {lead.phone ? `Tel: ${lead.phone}` : "Keine Tel."} · {lead.city || "—"}
                    </p>
                  </div>
                  <span className="text-sm font-medium" style={{ color: "var(--status-planned-tx)" }}>
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

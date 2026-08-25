"use client";

import { useState, useEffect } from "react";
import { BarChart3, PieChart, TrendingUp, Users, CheckCircle2, ShieldCheck } from "lucide-react";
import { STATUS_LABELS } from "@/lib/constants";

export default function AnalyticsPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/dashboard")
      .then((res) => res.json())
      .then((resData) => setData(resData))
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="p-12 text-center text-xs" style={{ color: "var(--text-3)" }}>
        Analytics wird geladen…
      </div>
    );
  }

  const metrics = data?.metrics || {};
  const conversionRate = metrics.totalLeads > 0 ? ((metrics.wonLeads / metrics.totalLeads) * 100).toFixed(1) : "0.0";
  const contactRate = metrics.totalLeads > 0 ? ((metrics.contactedLeads / metrics.totalLeads) * 100).toFixed(1) : "0.0";

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="font-heading text-2xl font-bold tracking-tight" style={{ color: "var(--text)" }}>
          Analytics & Performance
        </h1>
        <p className="mt-1 text-xs" style={{ color: "var(--text-2)" }}>
          Einblicke in deine Conversion-Rate, Akquise-Aktivitäten und Lead-Verteilung.
        </p>
      </div>

      {/* Metrics Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-xl border p-5 space-y-2" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
          <span className="text-xs font-semibold" style={{ color: "var(--text-2)" }}>Abschluss-Quote (Won)</span>
          <div className="flex items-baseline justify-between">
            <span className="font-heading text-3xl font-bold" style={{ color: "var(--status-warm-tx)" }}>{conversionRate}%</span>
            <TrendingUp className="w-5 h-5" style={{ color: "var(--status-warm-tx)" }} />
          </div>
          <p className="text-[11px]" style={{ color: "var(--text-3)" }}>{metrics.wonLeads} von {metrics.totalLeads} Leads gewonnen</p>
        </div>

        <div className="rounded-xl border p-5 space-y-2" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
          <span className="text-xs font-semibold" style={{ color: "var(--text-2)" }}>Kontaktierungs-Quote</span>
          <div className="flex items-baseline justify-between">
            <span className="font-heading text-3xl font-bold" style={{ color: "var(--status-contacted-tx)" }}>{contactRate}%</span>
            <Users className="w-5 h-5" style={{ color: "var(--status-contacted-tx)" }} />
          </div>
          <p className="text-[11px]" style={{ color: "var(--text-3)" }}>{metrics.contactedLeads} kontaktiert</p>
        </div>

        <div className="rounded-xl border p-5 space-y-2" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
          <span className="text-xs font-semibold" style={{ color: "var(--text-2)" }}>Gemini KI Calls</span>
          <div className="flex items-baseline justify-between">
            <span className="font-heading text-3xl font-bold" style={{ color: "var(--accent)" }}>{metrics.totalCalls || 0}</span>
            <BarChart3 className="w-5 h-5" style={{ color: "var(--accent)" }} />
          </div>
          <p className="text-[11px]" style={{ color: "var(--text-3)" }}>Transkribierte Verkaufsgespräche</p>
        </div>
      </div>
    </div>
  );
}

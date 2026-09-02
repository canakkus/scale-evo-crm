"use client";

import { useState, useEffect } from "react";
import {
  Key,
  ShieldCheck,
  CheckCircle2,
  XCircle,
} from "lucide-react";

export default function SettingsPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/settings")
      .then((res) => res.json())
      .then((resData) => setData(resData))
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="p-12 text-center text-xs" style={{ color: "var(--text-3)" }}>
        <div className="w-5 h-5 rounded-full border-2 border-t-transparent animate-spin mx-auto mb-2" style={{ borderColor: "var(--border-2)", borderTopColor: "var(--accent)" }} />
        Einstellungen werden geladen…
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="font-heading text-2xl font-bold tracking-tight" style={{ color: "var(--text)" }}>
          Einstellungen & System-Status
        </h1>
        <p className="mt-1 text-xs" style={{ color: "var(--text-2)" }}>
          Übersicht der konfigurierten API-Keys, Auth-Berechtigungen und System-Einstellungen.
        </p>
      </div>

      <div className="space-y-4">
        {/* System Integrations Card */}
        <div
          className="rounded-xl border p-6 space-y-4 shadow-sm"
          style={{ background: "var(--surface)", borderColor: "var(--border)" }}
        >
          <h3 className="text-sm font-bold flex items-center gap-2" style={{ color: "var(--text)" }}>
            <Key className="w-4 h-4" style={{ color: "var(--accent)" }} />
            API-Schlüssel & Schnittstellen
          </h3>

          <div className="divide-y" style={{ borderColor: "var(--border)" }}>
            {/* Gemini */}
            <div className="py-3 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold" style={{ color: "var(--text)" }}>Google Gemini API Key</p>
                <p className="text-[11px]" style={{ color: "var(--text-3)" }}>Pflicht für Call-Transkription, Speisekarten-Scan & KI-Assistent</p>
              </div>
              {data?.hasGeminiKey ? (
                <span className="flex items-center gap-1 text-xs font-bold" style={{ color: "var(--status-warm-tx)" }}>
                  <CheckCircle2 className="w-4 h-4" /> Konfiguriert
                </span>
              ) : (
                <span className="flex items-center gap-1 text-xs font-bold" style={{ color: "var(--status-lost-tx)" }}>
                  <XCircle className="w-4 h-4" /> Fehlt (.env)
                </span>
              )}
            </div>

            {/* Google Places */}
            <div className="py-3 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold" style={{ color: "var(--text)" }}>Google Places API Key</p>
                <p className="text-[11px]" style={{ color: "var(--text-3)" }}>Optional für Lead-Autofill & Restaurant-Scout</p>
              </div>
              {data?.hasPlacesKey ? (
                <span className="flex items-center gap-1 text-xs font-bold" style={{ color: "var(--status-warm-tx)" }}>
                  <CheckCircle2 className="w-4 h-4" /> Konfiguriert
                </span>
              ) : (
                <span className="flex items-center gap-1 text-xs font-bold" style={{ color: "var(--status-planned-tx)" }}>
                  <XCircle className="w-4 h-4" /> Nicht aktiv (Optional)
                </span>
              )}
            </div>
          </div>
        </div>

        {/* User Whitelist Card */}
        <div
          className="rounded-xl border p-6 space-y-3 shadow-sm"
          style={{ background: "var(--surface)", borderColor: "var(--border)" }}
        >
          <h3 className="text-sm font-bold flex items-center gap-2" style={{ color: "var(--text)" }}>
            <ShieldCheck className="w-4 h-4" style={{ color: "var(--status-warm-tx)" }} />
            Autorisierte Benutzer-E-Mails (Whitelist)
          </h3>
          <div className="flex flex-wrap gap-2 pt-1">
            {data?.allowedEmails?.map((email: string, i: number) => (
              <span
                key={i}
                className="px-3 py-1 rounded-md text-xs font-mono border"
                style={{ background: "var(--surface-2)", borderColor: "var(--border)", color: "var(--accent)" }}
              >
                {email}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

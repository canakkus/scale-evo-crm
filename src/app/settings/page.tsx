"use client";

import { useState, useEffect } from "react";
import {
  Key,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  LogOut,
  User,
  AlertTriangle,
  Loader2,
  X,
} from "lucide-react";
import { initials } from "@/lib/utils";

export default function SettingsPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Logout Confirmation State
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    fetch("/api/settings")
      .then((res) => res.json())
      .then((resData) => setData(resData))
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  }, []);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      window.location.href = "/login";
    } catch (err) {
      console.error("Logout failed:", err);
      window.location.href = "/login";
    }
  }

  if (loading) {
    return (
      <div className="p-12 text-center text-xs" style={{ color: "var(--text-3)" }}>
        <div className="w-5 h-5 rounded-full border-2 border-t-transparent animate-spin mx-auto mb-2" style={{ borderColor: "var(--border-2)", borderTopColor: "var(--accent)" }} />
        Einstellungen werden geladen…
      </div>
    );
  }

  const currentUser = data?.currentUser;

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="font-heading text-2xl font-bold tracking-tight" style={{ color: "var(--text)" }}>
          Einstellungen & System-Status
        </h1>
        <p className="mt-1 text-xs" style={{ color: "var(--text-2)" }}>
          Übersicht der konfigurierten API-Keys, Auth-Berechtigungen und Kontoeinstellungen.
        </p>
      </div>

      <div className="space-y-4">
        {/* Account & Logout Card */}
        <div
          className="rounded-xl border p-6 space-y-4 shadow-sm"
          style={{ background: "var(--surface)", borderColor: "var(--border)" }}
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div
                className="w-11 h-11 rounded-xl flex items-center justify-center font-bold text-sm shrink-0 border"
                style={{
                  background: "var(--surface-2)",
                  borderColor: "var(--border)",
                  color: "var(--accent)",
                }}
              >
                {currentUser?.displayName ? initials(currentUser.displayName) : <User size={18} />}
              </div>
              <div>
                <h3 className="text-sm font-bold" style={{ color: "var(--text)" }}>
                  {currentUser?.displayName || "Aktueller Benutzer"}
                </h3>
                <p className="text-xs font-mono" style={{ color: "var(--text-3)" }}>
                  {currentUser?.email || "Eingeloggte Sitzung aktiv"}
                </p>
              </div>
            </div>

            {/* Red Logout Button */}
            <button
              type="button"
              onClick={() => setShowLogoutConfirm(true)}
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all shadow-sm active:scale-95 bg-red-600 hover:bg-red-700 text-white cursor-pointer"
            >
              <LogOut size={15} />
              <span>Abmelden</span>
            </button>
          </div>
        </div>

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

      {/* Confirmation Modal: Really Logout? */}
      {showLogoutConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-fade-in">
          <div
            className="w-full max-w-sm rounded-2xl border p-6 space-y-5 shadow-2xl animate-scale-up"
            style={{ background: "var(--surface)", borderColor: "var(--border)" }}
          >
            <div className="flex items-start justify-between">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center bg-red-500/10 border border-red-500/20 text-red-400"
              >
                <AlertTriangle size={20} />
              </div>
              <button
                type="button"
                onClick={() => setShowLogoutConfirm(false)}
                className="p-1 rounded-lg hover:bg-[var(--surface-2)] text-[var(--text-3)] hover:text-[var(--text)] transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-1.5">
              <h4 className="font-heading text-base font-bold" style={{ color: "var(--text)" }}>
                Wirklich ausloggen?
              </h4>
              <p className="text-xs leading-relaxed" style={{ color: "var(--text-2)" }}>
                Bist du sicher, dass du dich abmelden möchtest? Deine aktuelle Sitzung wird beendet und du musst dich erneut anmelden.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                disabled={loggingOut}
                onClick={() => setShowLogoutConfirm(false)}
                className="px-4 py-2.5 rounded-xl text-xs font-semibold border transition-colors hover:bg-[var(--surface-2)]"
                style={{ borderColor: "var(--border)", color: "var(--text-2)" }}
              >
                Abbrechen
              </button>
              <button
                type="button"
                disabled={loggingOut}
                onClick={handleLogout}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all shadow-md active:scale-95 bg-red-600 hover:bg-red-700 text-white disabled:opacity-50"
              >
                {loggingOut ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    <span>Wird abgemeldet…</span>
                  </>
                ) : (
                  <>
                    <LogOut size={14} />
                    <span>Ja, wirklich ausloggen</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import { useState, useEffect } from "react";
import {
  Key,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  UtensilsCrossed,
  User,
  Sliders,
  Sparkles,
} from "lucide-react";
import { initials } from "@/lib/utils";

export default function SettingsPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [savingScout, setSavingScout] = useState(false);
  const [restaurantScoutEnabled, setRestaurantScoutEnabled] = useState(true);

  useEffect(() => {
    fetch("/api/settings")
      .then((res) => res.json())
      .then((resData) => {
        setData(resData);
        if (resData?.currentUser?.restaurantScoutEnabled !== undefined) {
          setRestaurantScoutEnabled(resData.currentUser.restaurantScoutEnabled);
        }
      })
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  }, []);

  async function handleToggleRestaurantScout(newVal: boolean) {
    setRestaurantScoutEnabled(newVal);
    setSavingScout(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ restaurantScoutEnabled: newVal }),
      });
      if (res.ok) {
        // Broadcast custom event so sidebar updates immediately without full page reload
        window.dispatchEvent(new CustomEvent("user-settings-updated", { detail: { restaurantScoutEnabled: newVal } }));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSavingScout(false);
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
      {/* Header */}
      <div>
        <h1 className="font-heading text-2xl font-bold tracking-tight" style={{ color: "var(--text)" }}>
          Einstellungen & Profil
        </h1>
        <p className="mt-1 text-xs" style={{ color: "var(--text-2)" }}>
          Übersicht deines Accounts, Feature-Toggles und API-Schnittstellen.
        </p>
      </div>

      <div className="space-y-4">
        {/* User Account Info Card */}
        <div
          className="rounded-xl border p-5 shadow-sm"
          style={{ background: "var(--surface)", borderColor: "var(--border)" }}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 border"
                style={{
                  background: "var(--surface-2)",
                  borderColor: "var(--border)",
                  color: "var(--accent)",
                }}
              >
                {currentUser?.displayName ? initials(currentUser.displayName) : <User size={16} />}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold" style={{ color: "var(--text-3)" }}>
                    Eingeloggt als
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-bold" style={{ background: "var(--surface-2)", color: "var(--accent)", border: "1px solid var(--border)" }}>
                    {currentUser?.displayName || "Benutzer"}
                  </span>
                </div>
                <p className="text-xs font-mono font-medium mt-0.5" style={{ color: "var(--text)" }}>
                  {currentUser?.email || "Sitzung aktiv"}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 text-xs text-emerald-400 font-medium bg-emerald-500/10 px-3 py-1.5 rounded-lg border border-emerald-500/20">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>Sitzung aktiv</span>
            </div>
          </div>
        </div>

        {/* Feature Toggles & Modules Card */}
        <div
          className="rounded-xl border p-6 space-y-4 shadow-sm"
          style={{ background: "var(--surface)", borderColor: "var(--border)" }}
        >
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4" style={{ color: "var(--accent)" }} />
            <h3 className="text-sm font-bold" style={{ color: "var(--text)" }}>
              Module & Feature-Toggles
            </h3>
          </div>

          <div className="divide-y" style={{ borderColor: "var(--border)" }}>
            {/* Restaurant Scout Toggle */}
            <div className="py-3 flex items-center justify-between gap-4">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <UtensilsCrossed size={16} style={{ color: "var(--accent)" }} />
                  <p className="text-xs font-bold" style={{ color: "var(--text)" }}>
                    Restaurant Scout & Menü-Radar
                  </p>
                </div>
                <p className="text-[11px] max-w-lg leading-relaxed" style={{ color: "var(--text-3)" }}>
                  Automatisiertes Scouting von Gastronomiebetrieben via Google Places & Speisekarten-Erkennung per Gemini KI in der Sidebar.
                </p>
              </div>

              {/* iOS Style Toggle Switch */}
              <button
                type="button"
                role="switch"
                aria-checked={restaurantScoutEnabled}
                disabled={savingScout}
                onClick={() => handleToggleRestaurantScout(!restaurantScoutEnabled)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                  restaurantScoutEnabled ? "bg-[var(--accent)]" : "bg-zinc-700"
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                    restaurantScoutEnabled ? "translate-x-5 bg-black" : "translate-x-0"
                  }`}
                />
              </button>
            </div>
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
    </div>
  );
}

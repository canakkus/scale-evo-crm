"use client";

import React from "react";
import Link from "next/link";
import { Navigation, MapPin, Settings, X, Sparkles, Check, ArrowRight, Loader2 } from "lucide-react";
import { useUserLocation } from "@/lib/location-context";

export function LocationPromptModal() {
  const {
    showPrompt,
    showSettingsHint,
    loadingGps,
    gpsError,
    requestLiveLocation,
    dismissPrompt,
    closeSettingsHint,
  } = useUserLocation();

  const handleAllowGps = async () => {
    const success = await requestLiveLocation();
    if (success) {
      dismissPrompt(false);
    }
  };

  const handleDecline = () => {
    dismissPrompt(true);
  };

  return (
    <>
      {/* 1. Main Launch Prompt Modal */}
      {showPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div
            className="w-full max-w-md rounded-2xl border p-6 shadow-2xl space-y-5 transition-all"
            style={{
              background: "var(--surface)",
              borderColor: "var(--border)",
              boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5)",
            }}
          >
            {/* Header Icon & Title */}
            <div className="flex items-start gap-3.5">
              <div
                className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 border"
                style={{
                  background: "rgba(56, 189, 248, 0.12)",
                  borderColor: "rgba(56, 189, 248, 0.25)",
                  color: "#38bdf8",
                }}
              >
                <Navigation className="w-5 h-5 animate-pulse" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-base font-bold tracking-tight" style={{ color: "var(--text)" }}>
                  Standort für Walk-In & Distanzberechnung
                </h3>
                <p className="text-xs mt-1 leading-relaxed" style={{ color: "var(--text-2)" }}>
                  Möchtest du deinen aktuellen <strong>Live-Standort (GPS)</strong> freigeben, um Entfernungen zu Leads & Kunden in Echtzeit zu berechnen?
                </p>
              </div>
            </div>

            {gpsError && (
              <div
                className="p-3 rounded-lg text-xs font-medium border text-red-400 bg-red-500/10 border-red-500/20"
              >
                {gpsError}
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={handleDecline}
                disabled={loadingGps}
                className="px-4 py-2 rounded-xl text-xs font-semibold border transition-all cursor-pointer hover:bg-[var(--surface-2)]"
                style={{ borderColor: "var(--border)", color: "var(--text-2)" }}
              >
                Nein, vorerst nicht
              </button>

              <button
                type="button"
                onClick={handleAllowGps}
                disabled={loadingGps}
                className="flex items-center justify-center gap-2 px-5 py-2 rounded-xl text-xs font-bold transition-all shadow-md active:scale-95 cursor-pointer disabled:opacity-50"
                style={{ background: "var(--accent)", color: "var(--bg)" }}
              >
                {loadingGps ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Navigation className="w-4 h-4" />
                )}
                {loadingGps ? "Standort ermitteln…" : "Ja, Live-Standort nutzen"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. Educational Settings Hint Card (Shown after clicking "Nein") */}
      {showSettingsHint && (
        <div
          className="fixed bottom-5 right-5 z-50 max-w-sm rounded-2xl border p-4 shadow-2xl space-y-3 animate-slide-up backdrop-blur-md"
          style={{
            background: "var(--surface)",
            borderColor: "rgba(56, 189, 248, 0.3)",
            boxShadow: "0 20px 40px -10px rgba(0, 0, 0, 0.6)",
          }}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <div
                className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 border"
                style={{
                  background: "rgba(56, 189, 248, 0.12)",
                  borderColor: "rgba(56, 189, 248, 0.25)",
                  color: "#38bdf8",
                }}
              >
                <MapPin className="w-4 h-4" />
              </div>
              <h4 className="text-xs font-bold" style={{ color: "var(--text)" }}>
                Fixer Standort per Google Places
              </h4>
            </div>
            <button
              onClick={closeSettingsHint}
              className="p-1 rounded-md text-[var(--text-3)] hover:text-[var(--text)] transition-colors cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <p className="text-xs leading-relaxed" style={{ color: "var(--text-2)" }}>
            Kein Problem! Du kannst deinen festen Startpunkt (z. B. Büro oder Firmenadresse) jederzeit in den{" "}
            <strong className="text-[var(--text)]">Einstellungen per Google Places Autofill</strong> hinterlegen. Alle Distanzen werden dann automatisch von dort gemessen.
          </p>

          <div className="flex items-center justify-end gap-2 pt-1 border-t" style={{ borderColor: "var(--border)" }}>
            <button
              onClick={closeSettingsHint}
              className="text-[11px] font-semibold px-2.5 py-1 rounded-md text-[var(--text-3)] hover:text-[var(--text)] cursor-pointer"
            >
              Schließen
            </button>
            <Link
              href="/settings"
              onClick={closeSettingsHint}
              className="flex items-center gap-1 text-[11px] font-bold px-3 py-1.5 rounded-lg shadow-sm transition-all cursor-pointer active:scale-95"
              style={{ background: "var(--accent)", color: "var(--bg)" }}
            >
              <Settings className="w-3 h-3" />
              <span>Zu den Einstellungen</span>
              <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
        </div>
      )}
    </>
  );
}

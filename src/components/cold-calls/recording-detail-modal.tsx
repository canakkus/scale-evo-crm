"use client";

import { X, Sparkles, Calendar, User, FileText, CheckCircle2, AlertTriangle, Activity } from "lucide-react";
import { timeAgo } from "@/lib/utils";

type RecordingDetailModalProps = {
  recording: any | null;
  onClose: () => void;
};

export function RecordingDetailModal({ recording, onClose }: RecordingDetailModalProps) {
  if (!recording) return null;

  const sentimentStyles: Record<string, { bg: string; tx: string; label: string }> = {
    POSITIVE: { bg: "var(--status-warm-bg)", tx: "var(--status-warm-tx)", label: "Positiv" },
    NEUTRAL:  { bg: "var(--status-new-bg)", tx: "var(--status-new-tx)", label: "Neutral" },
    NEGATIVE: { bg: "var(--status-lost-bg)", tx: "var(--status-lost-tx)", label: "Negativ" },
    MIXED:    { bg: "var(--status-planned-bg)", tx: "var(--status-planned-tx)", label: "Gemischt" },
  };

  const sentiment = sentimentStyles[recording.aiSentiment] || sentimentStyles.NEUTRAL;
  const extracted = recording.aiExtractedData || {};
  const nextSteps = Array.isArray(recording.aiNextSteps) ? recording.aiNextSteps : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "var(--overlay)", backdropFilter: "var(--overlay-blur)" }}>
      <div
        className="relative w-full max-w-3xl max-h-[90vh] flex flex-col rounded-xl border shadow-2xl overflow-hidden animate-fade-in"
        style={{ background: "var(--surface)", borderColor: "var(--border)" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b shrink-0" style={{ borderColor: "var(--border)" }}>
          <div className="flex items-center gap-3">
            <h2 className="font-heading text-lg font-bold" style={{ color: "var(--text)" }}>
              {recording.lead?.companyName || recording.fileName}
            </h2>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold" style={{ background: sentiment.bg, color: sentiment.tx }}>
              {sentiment.label}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md transition-colors hover:bg-[var(--surface-3)]"
            style={{ color: "var(--text-2)" }}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* AI Summary Box */}
          <div className="p-4 rounded-xl border space-y-3" style={{ background: "var(--surface-2)", borderColor: "var(--border)" }}>
            <h3 className="text-xs font-semibold flex items-center gap-2" style={{ color: "var(--status-warm-tx)" }}>
              <Sparkles className="w-4 h-4" />
              Gemini AI Zusammenfassung
            </h3>
            <p className="text-xs leading-relaxed" style={{ color: "var(--text)" }}>
              {recording.aiSummary || "Keine Zusammenfassung vorhanden."}
            </p>
          </div>

          {/* Next Steps & Extracted Data Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Next Steps */}
            <div className="p-4 rounded-xl border space-y-2" style={{ background: "var(--surface-2)", borderColor: "var(--border)" }}>
              <h4 className="text-xs font-semibold flex items-center gap-1.5" style={{ color: "var(--text-2)" }}>
                <CheckCircle2 className="w-4 h-4" style={{ color: "var(--status-warm-tx)" }} />
                Nächste Schritte
              </h4>
              <ul className="space-y-1 text-xs">
                {nextSteps.length === 0 ? (
                  <li style={{ color: "var(--text-3)" }}>Keine konkreten Folgeschritte erkannt.</li>
                ) : (
                  nextSteps.map((step: string, i: number) => (
                    <li key={i} className="flex items-start gap-1.5" style={{ color: "var(--text)" }}>
                      <span style={{ color: "var(--accent)" }}>•</span>
                      {step}
                    </li>
                  ))
                )}
              </ul>
            </div>

            {/* Extracted Data */}
            <div className="p-4 rounded-xl border space-y-2 text-xs" style={{ background: "var(--surface-2)", borderColor: "var(--border)" }}>
              <h4 className="text-xs font-semibold flex items-center gap-1.5" style={{ color: "var(--text-2)" }}>
                <Activity className="w-4 h-4" style={{ color: "var(--status-new-tx)" }} />
                Extrahierte Daten
              </h4>

              {extracted.contactName && (
                <div className="flex items-center justify-between">
                  <span style={{ color: "var(--text-3)" }}>Ansprechpartner:</span>
                  <span className="font-semibold" style={{ color: "var(--text)" }}>{extracted.contactName}</span>
                </div>
              )}

              {extracted.appointmentDate && (
                <div className="flex items-center justify-between">
                  <span style={{ color: "var(--text-3)" }}>Vereinbarter Termin:</span>
                  <span className="font-semibold" style={{ color: "var(--status-warm-tx)" }}>{extracted.appointmentDate}</span>
                </div>
              )}

              {extracted.interestLevel && (
                <div className="flex items-center justify-between">
                  <span style={{ color: "var(--text-3)" }}>Interesse-Level:</span>
                  <span className="font-semibold" style={{ color: "var(--text)" }}>{extracted.interestLevel}</span>
                </div>
              )}

              {Array.isArray(extracted.objections) && extracted.objections.length > 0 && (
                <div className="pt-1">
                  <span className="block mb-0.5" style={{ color: "var(--text-3)" }}>Erwähnte Einwände:</span>
                  <p style={{ color: "var(--status-planned-tx)" }}>{extracted.objections.join(", ")}</p>
                </div>
              )}
            </div>
          </div>

          {/* Full Transcription */}
          <div className="space-y-2">
            <h3 className="text-xs font-semibold flex items-center gap-1.5" style={{ color: "var(--text-2)" }}>
              <FileText className="w-4 h-4" />
              Vollständige Transkription
            </h3>
            <div
              className="p-4 rounded-xl border text-xs leading-relaxed max-h-60 overflow-y-auto whitespace-pre-wrap font-mono"
              style={{ background: "var(--surface-2)", borderColor: "var(--border)", color: "var(--text-2)" }}
            >
              {recording.transcription || "Keine Transkription verfügbar."}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useState, useEffect, useCallback } from "react";
import { Phone, Upload, Sparkles, FileAudio, Eye, Clock, CheckCircle2, AlertTriangle, ArrowRight } from "lucide-react";
import { AudioUploadModal } from "@/components/cold-calls/audio-upload-modal";
import { RecordingDetailModal } from "@/components/cold-calls/recording-detail-modal";
import { timeAgo } from "@/lib/utils";

export function ColdCallsComponent() {
  const [recordings, setRecordings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [selectedRecording, setSelectedRecording] = useState<any | null>(null);

  const fetchRecordings = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/cold-calls/recordings");
      if (res.ok) {
        const data = await res.json();
        setRecordings(data.recordings || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRecordings();
  }, [fetchRecordings]);

  const sentimentBadge: Record<string, { bg: string; tx: string; label: string }> = {
    POSITIVE: { bg: "var(--status-warm-bg)", tx: "var(--status-warm-tx)", label: "Positiv" },
    NEUTRAL:  { bg: "var(--status-new-bg)", tx: "var(--status-new-tx)", label: "Neutral" },
    NEGATIVE: { bg: "var(--status-lost-bg)", tx: "var(--status-lost-tx)", label: "Negativ" },
    MIXED:    { bg: "var(--status-planned-bg)", tx: "var(--status-planned-tx)", label: "Gemischt" },
  };

  return (
    <div className="space-y-6">
      {/* Top Banner / Call Upload Action */}
      <div
        className="rounded-xl border p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm"
        style={{ background: "var(--surface)", borderColor: "var(--border)" }}
      >
        <div className="space-y-1">
          <h2 className="font-heading text-lg font-bold flex items-center gap-2" style={{ color: "var(--text)" }}>
            <Sparkles className="w-5 h-5" style={{ color: "var(--status-warm-tx)" }} />
            Gemini KI Call-Transkription & Notizen
          </h2>
          <p className="text-xs max-w-2xl" style={{ color: "var(--text-2)" }}>
            Lade Sprachmemos oder Anrufaufnahmen (MP3/WAV/M4A) hoch. Gemini transkribiert das Gespräch automatisch, fasst die wichtigsten Punkte zusammen und hängt die Notiz an das Lead-Profil an.
          </p>
        </div>

        <button
          onClick={() => setIsUploadOpen(true)}
          className="flex items-center gap-2 rounded-md px-4 py-2.5 text-xs font-semibold shrink-0 shadow-md transition-all"
          style={{ background: "var(--accent)", color: "var(--bg)" }}
        >
          <Upload className="w-4 h-4" />
          Call Hochladen
        </button>
      </div>

      {/* Recordings List */}
      <div className="space-y-4">
        <div className="flex items-center justify-between px-1">
          <h3 className="text-sm font-bold tracking-tight" style={{ color: "var(--text)" }}>
            Transkribierte Calls ({recordings.length})
          </h3>
        </div>

        {loading ? (
          <div className="rounded-xl border p-12 text-center text-xs" style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text-3)" }}>
            <div className="w-5 h-5 rounded-full border-2 border-t-transparent animate-spin mx-auto mb-2" style={{ borderColor: "var(--border-2)", borderTopColor: "var(--accent)" }} />
            Aufnahmen werden geladen…
          </div>
        ) : recordings.length === 0 ? (
          <div className="rounded-xl border p-12 text-center text-xs space-y-3" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
            <FileAudio className="w-10 h-10 mx-auto" style={{ color: "var(--text-3)" }} />
            <div>
              <p className="font-semibold text-sm" style={{ color: "var(--text)" }}>Noch keine Call-Aufnahmen vorhanden</p>
              <p className="text-xs" style={{ color: "var(--text-3)" }}>
                Lade eine Audiodatei hoch, um deinen ersten Anruf mit Gemini transkribieren zu lassen.
              </p>
            </div>
            <button
              onClick={() => setIsUploadOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-md px-3.5 py-2 text-xs font-semibold"
              style={{ background: "var(--accent)", color: "var(--bg)" }}
            >
              <Upload className="w-3.5 h-3.5" />
              Erste Aufnahme hochladen
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {recordings.map((rec) => {
              const badge = sentimentBadge[rec.aiSentiment] || sentimentBadge.NEUTRAL;
              return (
                <div
                  key={rec.id}
                  onClick={() => setSelectedRecording(rec)}
                  className="rounded-xl border p-5 space-y-3 cursor-pointer transition hover:shadow-lg group"
                  style={{ background: "var(--surface)", borderColor: "var(--border)" }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h4 className="font-bold text-sm" style={{ color: "var(--text)" }}>
                        {rec.lead?.companyName || rec.fileName}
                      </h4>
                      <p className="text-[11px]" style={{ color: "var(--text-3)" }}>
                        {timeAgo(rec.createdAt)} · {rec.fileName}
                      </p>
                    </div>
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold shrink-0" style={{ background: badge.bg, color: badge.tx }}>
                      {badge.label}
                    </span>
                  </div>

                  <p className="text-xs line-clamp-2 leading-relaxed" style={{ color: "var(--text-2)" }}>
                    {rec.aiSummary || rec.transcription || "Keine Zusammenfassung."}
                  </p>

                  <div className="pt-2 border-t flex items-center justify-between text-xs" style={{ borderColor: "var(--border)" }}>
                    <span className="font-medium flex items-center gap-1 text-[11px]" style={{ color: "var(--accent)" }}>
                      <Eye className="w-3.5 h-3.5" /> Transkript & Details anzeigen
                    </span>
                    <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-1" style={{ color: "var(--text-3)" }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modals */}
      <AudioUploadModal
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        onSuccess={() => fetchRecordings()}
      />

      <RecordingDetailModal
        recording={selectedRecording}
        onClose={() => setSelectedRecording(null)}
      />
    </div>
  );
}

"use client";

import { useState, useEffect, useCallback } from "react";
import {
  X,
  Phone,
  Mail,
  Globe,
  Camera,
  MapPin,
  Calendar,
  User,
  Plus,
  Send,
  Star,
  Clock,
  Sparkles,
  Upload,
  FileAudio,
  Eye,
  Brain,
  CheckCircle,
  FileText,
  Activity,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import { StatusBadge } from "@/components/ui/status-badge";
import { STATUS_LABELS, INTERACTION_LABELS } from "@/lib/constants";
import { formatDate, timeAgo } from "@/lib/utils";
import type { LeadStatus, InteractionType } from "@prisma/client";

type LeadDetailModalProps = {
  leadId: string | null;
  onClose: () => void;
  onUpdate: () => void;
};

export function LeadDetailModal({ leadId, onClose, onUpdate }: LeadDetailModalProps) {
  const [lead, setLead] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [notesText, setNotesText] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);

  // Tab State: "timeline" or "gemini"
  const [activeTab, setActiveTab] = useState<"timeline" | "gemini">("timeline");

  // Call recordings for this lead
  const [recordings, setRecordings] = useState<any[]>([]);
  const [loadingRecordings, setLoadingRecordings] = useState(false);
  const [selectedRecordingId, setSelectedRecordingId] = useState<string | null>(null);

  // Upload Call State
  const [uploadingCall, setUploadingCall] = useState(false);
  const [uploadError, setUploadError] = useState("");

  // New Interaction Form
  const [newInteractionType, setNewInteractionType] = useState<InteractionType>("PHONE");
  const [newInteractionNote, setNewInteractionNote] = useState("");
  const [addingInteraction, setAddingInteraction] = useState(false);

  const fetchRecordings = useCallback(async () => {
    if (!leadId) return;
    setLoadingRecordings(true);
    try {
      const res = await fetch(`/api/cold-calls/recordings?leadId=${leadId}`);
      if (res.ok) {
        const data = await res.json();
        setRecordings(data.recordings || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingRecordings(false);
    }
  }, [leadId]);

  useEffect(() => {
    if (!leadId) return;
    setLoading(true);
    fetch(`/api/leads/${leadId}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.lead) {
          setLead(data.lead);
          setNotesText(data.lead.notes || "");
        }
      })
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));

    fetchRecordings();
  }, [leadId, fetchRecordings]);

  if (!leadId) return null;

  async function handleStatusChange(newStatus: LeadStatus) {
    if (!lead) return;
    try {
      const res = await fetch(`/api/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        setLead({ ...lead, status: newStatus });
        onUpdate();
      }
    } catch (err) {
      console.error(err);
    }
  }

  async function handleSaveNotes() {
    if (!lead) return;
    setSavingNotes(true);
    try {
      const res = await fetch(`/api/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: notesText }),
      });
      if (res.ok) {
        setLead({ ...lead, notes: notesText });
        onUpdate();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSavingNotes(false);
    }
  }

  async function handleAddInteraction(e: React.FormEvent) {
    e.preventDefault();
    if (!newInteractionNote.trim() || !lead) return;
    setAddingInteraction(true);

    try {
      const res = await fetch(`/api/leads/${lead.id}/interactions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: newInteractionType,
          note: newInteractionNote,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setLead({
          ...lead,
          interactions: [data.interaction, ...(lead.interactions || [])],
        });
        setNewInteractionNote("");
        onUpdate();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setAddingInteraction(false);
    }
  }

  async function handleAudioUpload(e: React.ChangeEvent<HTMLInputElement>) {
    if (!e.target.files || !e.target.files[0] || !lead) return;
    const file = e.target.files[0];

    setUploadingCall(true);
    setUploadError("");

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("leadId", lead.id);

      const res = await fetch("/api/cold-calls/transcribe", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Transkription fehlgeschlagen.");
      }

      // Refresh recordings feed & Lead interactions timeline
      await fetchRecordings();
      const updatedLeadRes = await fetch(`/api/leads/${lead.id}`);
      const updatedLeadData = await updatedLeadRes.json();
      if (updatedLeadData.lead) {
        setLead(updatedLeadData.lead);
      }
      onUpdate();
    } catch (err: any) {
      setUploadError(err.message || "Fehler beim Upload & Analyse.");
    } finally {
      setUploadingCall(false);
    }
  }

  const sentimentBadge: Record<string, { bg: string; tx: string; label: string }> = {
    POSITIVE: { bg: "var(--status-warm-bg)", tx: "var(--status-warm-tx)", label: "Positiv" },
    NEUTRAL:  { bg: "var(--status-new-bg)", tx: "var(--status-new-tx)", label: "Neutral" },
    NEGATIVE: { bg: "var(--status-lost-bg)", tx: "var(--status-lost-tx)", label: "Negativ" },
    MIXED:    { bg: "var(--status-planned-bg)", tx: "var(--status-planned-tx)", label: "Gemischt" },
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col animate-fade-in" style={{ background: "var(--bg)" }}>
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b shrink-0" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
        <div className="flex items-center gap-3">
          <h2 className="font-heading text-xl font-bold" style={{ color: "var(--text)" }}>
            {lead?.companyName || "Lädt…"}
          </h2>
          {lead && <StatusBadge status={lead.status} />}
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-md transition-colors hover:bg-[var(--surface-3)]"
          style={{ color: "var(--text-2)" }}
        >
          <X className="w-6 h-6" />
        </button>
      </div>

      {loading || !lead ? (
        <div className="flex-1 flex flex-col items-center justify-center" style={{ color: "var(--text-3)" }}>
          <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin mb-3" style={{ borderColor: "var(--border-2)", borderTopColor: "var(--accent)" }} />
          <span>Lädt Lead Details…</span>
        </div>
      ) : (
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
          {/* Left Column: Quick Info & Status */}
          <div className="w-full md:w-80 shrink-0 border-r overflow-y-auto p-6 space-y-6" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
            {/* Status Switcher */}
            <div>
              <label className="block text-xs font-semibold mb-2" style={{ color: "var(--text-2)" }}>
                Status ändern
              </label>
              <select
                className="w-full rounded-md px-3 py-2.5 text-xs font-medium border outline-none cursor-pointer"
                style={{ background: "var(--surface-2)", borderColor: "var(--border)", color: "var(--text)" }}
                value={lead.status}
                onChange={(e) => handleStatusChange(e.target.value as LeadStatus)}
              >
                {Object.entries(STATUS_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>

            {/* Details List */}
            <div className="space-y-4 text-xs">
              <h3 className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--text-3)" }}>
                Lead-Informationen
              </h3>

              {lead.industry && (
                <div className="flex items-center gap-2" style={{ color: "var(--text-2)" }}>
                  <span className="font-semibold" style={{ color: "var(--text-3)" }}>Branche:</span>
                  <span style={{ color: "var(--text)" }}>{lead.industry}</span>
                </div>
              )}

              {lead.city && (
                <div className="flex items-start gap-2" style={{ color: "var(--text-2)" }}>
                  <MapPin className="w-4 h-4 shrink-0 mt-0.5" style={{ color: "var(--text-3)" }} />
                  <span style={{ color: "var(--text)" }}>{lead.address ? `${lead.address}, ${lead.city}` : lead.city}</span>
                </div>
              )}

              {lead.phone && (
                <div className="flex items-center gap-2">
                  <Phone className="w-4 h-4 shrink-0" style={{ color: "var(--text-3)" }} />
                  <a href={`tel:${lead.phone}`} className="hover:underline font-mono" style={{ color: "var(--accent)" }}>
                    {lead.phone}
                  </a>
                </div>
              )}

              {lead.email && (
                <div className="flex items-center gap-2">
                  <Mail className="w-4 h-4 shrink-0" style={{ color: "var(--text-3)" }} />
                  <a href={`mailto:${lead.email}`} className="hover:underline truncate" style={{ color: "var(--accent)" }}>
                    {lead.email}
                  </a>
                </div>
              )}

              {lead.website && (
                <div className="flex items-center gap-2">
                  <Globe className="w-4 h-4 shrink-0" style={{ color: "var(--text-3)" }} />
                  <a href={lead.website.startsWith("http") ? lead.website : `https://${lead.website}`} target="_blank" rel="noreferrer" className="hover:underline truncate" style={{ color: "var(--accent)" }}>
                    {lead.website.replace(/^https?:\/\//, "")}
                  </a>
                </div>
              )}

              {lead.instagram && (
                <div className="flex items-center gap-2">
                  <Camera className="w-4 h-4 shrink-0" style={{ color: "var(--text-3)" }} />
                  <span style={{ color: "var(--text)" }}>{lead.instagram}</span>
                </div>
              )}

              {lead.googleRating != null && (
                <div className="flex items-center gap-2">
                  <Star className="w-4 h-4 shrink-0 fill-amber-400 text-amber-400" />
                  <span className="font-semibold" style={{ color: "var(--text)" }}>
                    {lead.googleRating.toFixed(1)}
                  </span>
                  {lead.googleReviewCount != null && (
                    <span style={{ color: "var(--text-3)" }}>({lead.googleReviewCount} Bewertungen)</span>
                  )}
                </div>
              )}

              {lead.contactPerson && (
                <div className="flex items-center gap-2 pt-3 border-t" style={{ borderColor: "var(--border)" }}>
                  <User className="w-4 h-4 shrink-0" style={{ color: "var(--text-3)" }} />
                  <span style={{ color: "var(--text-2)" }}>Ansprechpartner:</span>
                  <span className="font-medium" style={{ color: "var(--text)" }}>{lead.contactPerson}</span>
                </div>
              )}
            </div>
          </div>

          {/* Right Area: Tabs Header & Tab Content */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Tab Bar */}
            <div className="flex items-center border-b px-6 py-2 shrink-0" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
              <button
                onClick={() => setActiveTab("timeline")}
                className={`px-4 py-2 text-xs font-semibold border-b-2 transition-all ${
                  activeTab === "timeline"
                    ? "border-[var(--accent)] text-[var(--text)]"
                    : "border-transparent text-[var(--text-2)] hover:text-[var(--text)]"
                }`}
              >
                Notizen & Timeline
              </button>

              <button
                onClick={() => setActiveTab("gemini")}
                className={`px-4 py-2 text-xs font-semibold border-b-2 transition-all flex items-center gap-1.5 ${
                  activeTab === "gemini"
                    ? "border-[var(--accent)] text-[var(--text)]"
                    : "border-transparent text-[var(--text-2)] hover:text-[var(--text)]"
                }`}
              >
                <Brain className="w-3.5 h-3.5" style={{ color: "var(--status-warm-tx)" }} />
                Gemini Transkripte ({recordings.length})
              </button>
            </div>

            {/* Tab Content Box */}
            <div className="flex-1 overflow-y-auto p-6">
              {activeTab === "timeline" ? (
                <div className="space-y-6 max-w-4xl">
                  {/* Notes Box */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold" style={{ color: "var(--text)" }}>
                        Notizen & Besonderheiten
                      </label>
                      <button
                        onClick={handleSaveNotes}
                        disabled={savingNotes}
                        className="text-xs font-semibold px-3 py-1.5 rounded transition-colors hover:bg-[var(--surface-3)]"
                        style={{ background: "var(--surface-2)", color: "var(--accent)" }}
                      >
                        {savingNotes ? "Speichert…" : "Notiz Speichern"}
                      </button>
                    </div>
                    <textarea
                      rows={5}
                      className="w-full rounded-md p-3 text-xs border outline-none resize-none"
                      style={{ background: "var(--surface-2)", borderColor: "var(--border)", color: "var(--text)" }}
                      value={notesText}
                      onChange={(e) => setNotesText(e.target.value)}
                      placeholder="Notizen zum Lead..."
                    />
                  </div>

                  {/* Interactions Timeline */}
                  <div className="space-y-4 pt-4 border-t" style={{ borderColor: "var(--border)" }}>
                    <h3 className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--text-2)" }}>
                      Kontakt-Timeline ({lead.interactions?.length || 0})
                    </h3>

                    {/* Add Interaction Form */}
                    <form onSubmit={handleAddInteraction} className="flex gap-2">
                      <select
                        className="rounded-md px-2.5 py-1.5 text-xs border outline-none cursor-pointer"
                        style={{ background: "var(--surface-2)", borderColor: "var(--border)", color: "var(--text)" }}
                        value={newInteractionType}
                        onChange={(e) => setNewInteractionType(e.target.value as InteractionType)}
                      >
                        {Object.entries(INTERACTION_LABELS).map(([key, label]) => (
                          <option key={key} value={key}>{label}</option>
                        ))}
                      </select>
                      <input
                        type="text"
                        required
                        placeholder="Neue Interaktion protokollieren..."
                        className="flex-1 rounded-md px-3 py-1.5 text-xs border outline-none"
                        style={{ background: "var(--surface-2)", borderColor: "var(--border)", color: "var(--text)" }}
                        value={newInteractionNote}
                        onChange={(e) => setNewInteractionNote(e.target.value)}
                      />
                      <button
                        type="submit"
                        disabled={addingInteraction}
                        className="px-4 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1"
                        style={{ background: "var(--accent)", color: "var(--bg)" }}
                      >
                        <Send className="w-3.5 h-3.5" />
                        Hinzufügen
                      </button>
                    </form>

                    {/* Timeline Items */}
                    <div className="space-y-3">
                      {lead.interactions?.length === 0 ? (
                        <p className="text-xs italic" style={{ color: "var(--text-3)" }}>
                          Noch keine Interaktionen aufgezeichnet.
                        </p>
                      ) : (
                        lead.interactions?.map((item: any) => (
                          <div
                            key={item.id}
                            className="p-4 rounded-lg border text-xs space-y-1.5"
                            style={{ background: "var(--surface-2)", borderColor: "var(--border)" }}
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-[11px]" style={{ color: "var(--accent)" }}>
                                {INTERACTION_LABELS[item.type as InteractionType] || item.type}
                              </span>
                              <span className="text-[10px]" style={{ color: "var(--text-3)" }}>
                                {timeAgo(item.createdAt)}
                              </span>
                            </div>
                            <p style={{ color: "var(--text-2)" }}>{item.note}</p>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                // Gemini Transcripts Tab Content
                <div className="space-y-6 max-w-4xl">
                  {/* Inline Audio Upload Widget */}
                  <div className="rounded-xl border p-5 space-y-4" style={{ background: "var(--surface-2)", borderColor: "var(--border)" }}>
                    <div className="flex items-center gap-2">
                      <Brain className="w-4 h-4" style={{ color: "var(--status-warm-tx)" }} />
                      <h4 className="text-xs font-bold" style={{ color: "var(--text)" }}>Audiodatei direkt hier hochladen & transkribieren</h4>
                    </div>

                    <label
                      className="flex flex-col items-center justify-center border-2 border-dashed rounded-lg p-5 cursor-pointer transition-colors hover:bg-[var(--surface-3)]"
                      style={{ borderColor: "var(--border-2)" }}
                    >
                      <Upload className="w-6 h-6 mb-2" style={{ color: "var(--text-3)" }} />
                      <div className="text-center">
                        <p className="text-xs font-semibold" style={{ color: "var(--text)" }}>Audiodatei (MP3, WAV, M4A) hochladen</p>
                        <p className="text-[10px]" style={{ color: "var(--text-3)" }}>Transkript wird automatisch erstellt und an den Lead angehängt</p>
                      </div>
                      <input
                        type="file"
                        accept="audio/*"
                        onChange={handleAudioUpload}
                        disabled={uploadingCall}
                        className="hidden"
                      />
                    </label>

                    {uploadingCall && (
                      <div className="flex items-center gap-2 justify-center text-xs font-semibold" style={{ color: "var(--accent)" }}>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Gemini transkribiert & analysiert Audiodatei…
                      </div>
                    )}

                    {uploadError && (
                      <div className="p-3 rounded text-xs font-medium border" style={{ background: "var(--status-lost-bg)", color: "var(--status-lost-tx)", borderColor: "rgba(224,104,104,0.2)" }}>
                        {uploadError}
                      </div>
                    )}
                  </div>

                  {/* Recordings Feed */}
                  <div className="space-y-4">
                    <h3 className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--text-2)" }}>
                      Gespeicherte Gemini Transkripte ({recordings.length})
                    </h3>

                    {loadingRecordings ? (
                      <p className="text-xs italic" style={{ color: "var(--text-3)" }}>Transkripte werden geladen…</p>
                    ) : recordings.length === 0 ? (
                      <p className="text-xs italic" style={{ color: "var(--text-3)" }}>Noch keine Call-Transkripte für diesen Lead aufgezeichnet.</p>
                    ) : (
                      <div className="space-y-4">
                        {recordings.map((rec) => {
                          const badge = sentimentBadge[rec.aiSentiment] || sentimentBadge.NEUTRAL;
                          const isExpanded = selectedRecordingId === rec.id;
                          const extracted = rec.aiExtractedData || {};
                          const nextSteps = Array.isArray(rec.aiNextSteps) ? rec.aiNextSteps : [];

                          return (
                            <div
                              key={rec.id}
                              className="rounded-lg border overflow-hidden transition-all"
                              style={{ background: "var(--surface-2)", borderColor: "var(--border)" }}
                            >
                              {/* Header Trigger */}
                              <div
                                onClick={() => setSelectedRecordingId(isExpanded ? null : rec.id)}
                                className="p-4 flex items-center justify-between gap-3 cursor-pointer hover:bg-[var(--surface-3)]"
                              >
                                <div className="space-y-0.5">
                                  <h4 className="font-semibold text-xs" style={{ color: "var(--text)" }}>{rec.fileName}</h4>
                                  <p className="text-[10px]" style={{ color: "var(--text-3)" }}>{formatDate(rec.createdAt)} · {timeAgo(rec.createdAt)}</p>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ background: badge.bg, color: badge.tx }}>
                                    {badge.label}
                                  </span>
                                  <Eye className="w-3.5 h-3.5" style={{ color: "var(--text-3)" }} />
                                </div>
                              </div>

                              {/* Expanded Content Details */}
                              {isExpanded && (
                                <div className="p-4 border-t space-y-4 text-xs" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
                                  {/* AI Summary */}
                                  <div className="p-3.5 rounded border space-y-1.5" style={{ background: "var(--surface-2)", borderColor: "var(--border)" }}>
                                    <h5 className="font-semibold text-[11px] flex items-center gap-1" style={{ color: "var(--status-warm-tx)" }}>
                                      <Brain className="w-3.5 h-3.5" /> Zusammenfassung
                                    </h5>
                                    <p style={{ color: "var(--text-2)" }}>{rec.aiSummary || "Keine Zusammenfassung."}</p>
                                  </div>

                                  {/* Grid for steps & details */}
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div className="p-3.5 rounded border space-y-1.5" style={{ background: "var(--surface-2)", borderColor: "var(--border)" }}>
                                      <h5 className="font-semibold text-[11px] flex items-center gap-1" style={{ color: "var(--status-new-tx)" }}>
                                        <CheckCircle className="w-3.5 h-3.5" /> Nächste Schritte
                                      </h5>
                                      <ul className="space-y-1">
                                        {nextSteps.map((step: string, i: number) => (
                                          <li key={i} style={{ color: "var(--text-2)" }}>• {step}</li>
                                        ))}
                                      </ul>
                                    </div>

                                    <div className="p-3.5 rounded border space-y-1.5" style={{ background: "var(--surface-2)", borderColor: "var(--border)" }}>
                                      <h5 className="font-semibold text-[11px] flex items-center gap-1" style={{ color: "var(--status-planned-tx)" }}>
                                        <Activity className="w-3.5 h-3.5" /> Extrahierte Details
                                      </h5>
                                      {extracted.contactName && <p style={{ color: "var(--text-2)" }}>Ansprechpartner: <span className="font-semibold">{extracted.contactName}</span></p>}
                                      {extracted.appointmentDate && <p style={{ color: "var(--text-2)" }}>Termin: <span className="font-semibold">{extracted.appointmentDate}</span></p>}
                                      {extracted.interestLevel && <p style={{ color: "var(--text-2)" }}>Interesse: <span className="font-semibold">{extracted.interestLevel}</span></p>}
                                    </div>
                                  </div>

                                  {/* Transcript block */}
                                  <div className="space-y-1">
                                    <h5 className="font-semibold text-[11px] flex items-center gap-1" style={{ color: "var(--text-3)" }}>
                                      <FileText className="w-3.5 h-3.5" /> Vollständiges Transkript
                                    </h5>
                                    <div
                                      className="p-3 rounded border text-[11px] font-mono leading-relaxed max-h-40 overflow-y-auto whitespace-pre-wrap"
                                      style={{ background: "var(--surface-2)", borderColor: "var(--border)", color: "var(--text-3)" }}
                                    >
                                      {rec.transcription}
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

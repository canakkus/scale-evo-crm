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
  Eye,
  Brain,
  CheckCircle,
  FileText,
  Activity,
  Loader2,
  FileAudio,
  UtensilsCrossed,
  ExternalLink,
  RefreshCw,
  Navigation,
  Radio,
  Check,
  Copy,
  Maximize,
  Minimize,
} from "lucide-react";
import { StatusBadge } from "@/components/ui/status-badge";
import { CustomAudioPlayer } from "@/components/ui/custom-audio-player";
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
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [notesText, setNotesText] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);
  const [checkingMenu, setCheckingMenu] = useState(false);

  // Tab State: "timeline" or "gemini"
  const [activeTab, setActiveTab] = useState<"timeline" | "gemini">("timeline");

  // Call recordings for this lead
  const [recordings, setRecordings] = useState<any[]>([]);
  const [loadingRecordings, setLoadingRecordings] = useState(false);
  const [selectedRecordingId, setSelectedRecordingId] = useState<string | null>(null);

  // Upload Call State
  const [uploadingCall, setUploadingCall] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [isDragging, setIsDragging] = useState(false);

  // New Interaction Form
  const [newInteractionType, setNewInteractionType] = useState<InteractionType>("PHONE");
  const [newInteractionNote, setNewInteractionNote] = useState("");
  const [addingInteraction, setAddingInteraction] = useState(false);

  // Edit Interaction State
  const [editingInteractionId, setEditingInteractionId] = useState<string | null>(null);
  const [editInteractionNote, setEditInteractionNote] = useState("");
  const [savingInteractionId, setSavingInteractionId] = useState<string | null>(null);

  // Lead Editing State
  const [isEditing, setIsEditing] = useState(false);
  const [editCompanyName, setEditCompanyName] = useState("");
  const [editAcquisitionType, setEditAcquisitionType] = useState<string>("CALL");
  const [editNfcDemoUrl, setEditNfcDemoUrl] = useState("");
  const [editIndustry, setEditIndustry] = useState("");
  const [editAddress, setEditAddress] = useState("");
  const [editCity, setEditCity] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editWebsite, setEditWebsite] = useState("");
  const [editInstagram, setEditInstagram] = useState("");
  const [editTreatwellUrl, setEditTreatwellUrl] = useState("");
  const [editContactPerson, setEditContactPerson] = useState("");
  const [editGoogleMapsUrl, setEditGoogleMapsUrl] = useState("");
  const [editNextFollowUpAt, setEditNextFollowUpAt] = useState("");
  const [savingDetails, setSavingDetails] = useState(false);
  const [copiedNfc, setCopiedNfc] = useState(false);

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

          // Initialize edit values
          setEditCompanyName(data.lead.companyName || "");
          setEditAcquisitionType(data.lead.acquisitionType || "CALL");
          setEditNfcDemoUrl(data.lead.nfcDemoUrl || "");
          setEditIndustry(data.lead.industry || "");
          setEditAddress(data.lead.address || "");
          setEditCity(data.lead.city || "");
          setEditPhone(data.lead.phone || "");
          setEditEmail(data.lead.email || "");
          setEditWebsite(data.lead.website || "");
          setEditInstagram(data.lead.instagram || "");
          setEditTreatwellUrl(data.lead.treatwellUrl || "");
          setEditContactPerson(data.lead.contactPerson || "");
          setEditGoogleMapsUrl(data.lead.googleMapsUrl || "");
          setEditNextFollowUpAt(
            data.lead.nextFollowUpAt
              ? new Date(new Date(data.lead.nextFollowUpAt).getTime() - new Date().getTimezoneOffset() * 60000)
                  .toISOString()
                  .slice(0, 16)
              : ""
          );
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

  async function handleSaveLeadDetails() {
    if (!lead) return;
    setSavingDetails(true);
    try {
      const res = await fetch(`/api/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName: editCompanyName,
          acquisitionType: editAcquisitionType,
          nfcDemoUrl: editNfcDemoUrl,
          industry: editIndustry,
          address: editAddress,
          city: editCity,
          phone: editPhone,
          email: editEmail,
          website: editWebsite,
          instagram: editInstagram,
          treatwellUrl: editTreatwellUrl,
          contactPerson: editContactPerson,
          googleMapsUrl: editGoogleMapsUrl,
          nextFollowUpAt: editNextFollowUpAt ? new Date(editNextFollowUpAt).toISOString() : null,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setLead(data.lead);
        setIsEditing(false);
        onUpdate();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSavingDetails(false);
    }
  }

  async function handleCheckMenu() {
    if (!lead) return;
    setCheckingMenu(true);
    try {
      const res = await fetch(`/api/leads/${lead.id}/check-menu`, {
        method: "POST",
      });
      if (res.ok) {
        const data = await res.json();
        if (data.lead) {
          setLead(data.lead);
          onUpdate();
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setCheckingMenu(false);
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

  async function handleUpdateInteraction(interactionId: string) {
    if (!editInteractionNote.trim() || !lead) return;
    setSavingInteractionId(interactionId);
    
    try {
      const res = await fetch(`/api/interactions/${interactionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: editInteractionNote }),
      });
      
      if (res.ok) {
        const data = await res.json();
        setLead({
          ...lead,
          interactions: lead.interactions.map((i: any) => i.id === interactionId ? data.interaction : i)
        });
        setEditingInteractionId(null);
        onUpdate();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSavingInteractionId(null);
    }
  }

  const processAudioUpload = async (file: File) => {
    if (!lead) return;
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
  };

  const handleAudioUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      await processAudioUpload(e.target.files[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!uploadingCall) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (uploadingCall || !lead) return;

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (
        file.type.startsWith("audio/") ||
        file.name.endsWith(".m4a") ||
        file.name.endsWith(".mp3") ||
        file.name.endsWith(".wav") ||
        file.name.endsWith(".ogg")
      ) {
        await processAudioUpload(file);
      } else {
        setUploadError("Bitte lade eine gültige Audiodatei (MP3, WAV, M4A, OGG) hoch.");
      }
    }
  };

  const sentimentBadge: Record<string, { bg: string; tx: string; label: string }> = {
    POSITIVE: { bg: "var(--status-warm-bg)", tx: "var(--status-warm-tx)", label: "Positiv" },
    NEUTRAL:  { bg: "var(--status-new-bg)", tx: "var(--status-new-tx)", label: "Neutral" },
    NEGATIVE: { bg: "var(--status-lost-bg)", tx: "var(--status-lost-tx)", label: "Negativ" },
    MIXED:    { bg: "var(--status-planned-bg)", tx: "var(--status-planned-tx)", label: "Gemischt" },
  };

  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fade-in ${isFullscreen ? 'p-0' : 'p-4 sm:p-6'}`}>
      <div className={`w-full flex flex-col shadow-2xl overflow-hidden border ${isFullscreen ? 'h-full rounded-none max-w-none border-none' : 'max-w-6xl max-h-[90vh] rounded-2xl'}`} style={{ background: "var(--bg)", borderColor: "var(--border)" }}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b shrink-0" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
          <div className="flex items-center gap-3">
            <h2 className="font-heading text-xl font-bold" style={{ color: "var(--text)" }}>
              {lead?.companyName || "Lädt…"}
            </h2>
            {lead && <StatusBadge status={lead.status} />}
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setIsFullscreen(!isFullscreen)}
              className="p-1.5 rounded-lg transition-colors hover:bg-[var(--surface-3)]"
              style={{ color: "var(--text-2)" }}
            >
              {isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg transition-colors hover:bg-[var(--surface-3)]"
              style={{ color: "var(--text-2)" }}
            >
              <X className="w-6 h-6" />
            </button>
          </div>
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

            {/* Details List / Edit Form */}
            {!isEditing ? (
              <div className="space-y-5 text-sm">
                <div className="flex items-center justify-between border-b pb-3 mb-3" style={{ borderColor: "var(--border)" }}>
                  <h3 className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--text-3)" }}>
                    Lead-Informationen
                  </h3>
                  <button
                    onClick={() => setIsEditing(true)}
                    className="text-xs font-bold uppercase px-3 py-1.5 rounded-md transition-colors hover:bg-[var(--surface-3)]"
                    style={{ background: "var(--surface-2)", color: "var(--accent)" }}
                  >
                    Bearbeiten
                  </button>
                </div>

                {/* Akquise-Kanal */}
                <div className="flex flex-col gap-1">
                  <span className="font-semibold text-xs text-[var(--text-3)]">Akquise-Kanal:</span>
                  <div>
                    <span
                      className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-md"
                      style={{
                        background: lead.acquisitionType === "WALK_IN" ? "rgba(168, 85, 247, 0.1)" : "rgba(59, 130, 246, 0.1)",
                        color: lead.acquisitionType === "WALK_IN" ? "rgb(192, 132, 252)" : "rgb(96, 165, 250)",
                      }}
                    >
                      {lead.acquisitionType === "WALK_IN" ? "Walk-In" : "Cold Call"}
                    </span>
                  </div>
                </div>

                {/* NFC Demo URL */}
                {lead.nfcDemoUrl && (
                  <div className="flex flex-col gap-1.5 p-3 rounded-lg border" style={{ background: "var(--surface-2)", borderColor: "var(--border)" }}>
                    <span className="font-semibold text-xs uppercase tracking-wider" style={{ color: "var(--text-3)" }}>NFC Demo URL:</span>
                    <div className="flex items-center justify-between gap-2">
                      <a
                        href={lead.nfcDemoUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sm font-mono hover:underline truncate max-w-[170px]"
                        style={{ color: "var(--accent)" }}
                      >
                        {lead.nfcDemoUrl.replace(/^https?:\/\//, "")}
                      </a>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(lead.nfcDemoUrl);
                            setCopiedNfc(true);
                            setTimeout(() => setCopiedNfc(false), 2000);
                          }}
                          className="p-1.5 rounded-md hover:bg-[var(--surface-3)] transition-colors"
                          title="NFC Link kopieren"
                          style={{ color: copiedNfc ? "var(--status-warm-tx)" : "var(--text-2)" }}
                        >
                          {copiedNfc ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                        </button>
                        <a
                          href={lead.nfcDemoUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="p-1.5 rounded-md hover:bg-[var(--surface-3)] transition-colors"
                          title="NFC Demo öffnen"
                          style={{ color: "var(--text-2)" }}
                        >
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      </div>
                    </div>
                  </div>
                )}

                {lead.companyName && (
                  <div className="flex flex-col gap-1">
                    <span className="font-semibold text-xs text-[var(--text-3)]">Firma:</span>
                    <span className="font-medium" style={{ color: "var(--text)" }}>{lead.companyName}</span>
                  </div>
                )}

                {lead.industry && (
                  <div className="flex flex-col gap-1">
                    <span className="font-semibold text-xs text-[var(--text-3)]">Branche:</span>
                    <span style={{ color: "var(--text)" }}>{lead.industry}</span>
                  </div>
                )}

                {(lead.address || lead.city) && (
                  <div className="flex flex-col gap-1">
                    <span className="font-semibold text-xs text-[var(--text-3)]">Adresse:</span>
                    <div className="flex items-start justify-between gap-2" style={{ color: "var(--text)" }}>
                      <div className="flex items-start gap-1.5">
                        <MapPin className="w-4 h-4 shrink-0 mt-0.5" style={{ color: "var(--text-3)" }} />
                        <span>{lead.address ? `${lead.address}, ${lead.city}` : lead.city}</span>
                      </div>
                      <a
                        href={
                          lead.googleMapsUrl ||
                          `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([lead.companyName, lead.address, lead.city].filter(Boolean).join(", "))}`
                        }
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold border shrink-0 hover:bg-[var(--surface-3)] transition-colors text-sky-400"
                        style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}
                        title="Route auf Google Maps öffnen"
                      >
                        <Navigation className="w-3 h-3" />
                        <span>Maps</span>
                      </a>
                    </div>
                  </div>
                )}

                {lead.googleMapsUrl && (
                  <div className="flex flex-col gap-1">
                    <span className="font-semibold text-xs text-[var(--text-3)]">Google Maps:</span>
                    <div className="flex items-center gap-2">
                      <Globe className="w-4 h-4 shrink-0" style={{ color: "var(--text-3)" }} />
                      <a href={lead.googleMapsUrl} target="_blank" rel="noreferrer" className="hover:underline truncate" style={{ color: "var(--accent)" }}>
                        Auf Google Maps öffnen
                      </a>
                    </div>
                  </div>
                )}

                {lead.phone && (
                  <div className="flex flex-col gap-1">
                    <span className="font-semibold text-xs text-[var(--text-3)]">Telefon:</span>
                    <div className="flex items-center gap-2">
                      <Phone className="w-4 h-4 shrink-0" style={{ color: "var(--text-3)" }} />
                      <a href={`tel:${lead.phone}`} className="hover:underline font-mono" style={{ color: "var(--accent)" }}>
                        {lead.phone}
                      </a>
                    </div>
                  </div>
                )}

                {lead.email && (
                  <div className="flex flex-col gap-1">
                    <span className="font-semibold text-xs text-[var(--text-3)]">E-Mail:</span>
                    <div className="flex items-center gap-2">
                      <Mail className="w-4 h-4 shrink-0" style={{ color: "var(--text-3)" }} />
                      <a href={`mailto:${lead.email}`} className="hover:underline truncate" style={{ color: "var(--accent)" }}>
                        {lead.email}
                      </a>
                    </div>
                  </div>
                )}

                {lead.website && (
                  <div className="flex flex-col gap-1">
                    <span className="font-semibold text-xs text-[var(--text-3)]">Webseite:</span>
                    <div className="flex items-center gap-2">
                      <Globe className="w-4 h-4 shrink-0" style={{ color: "var(--text-3)" }} />
                      <a href={lead.website.startsWith("http") ? lead.website : `https://${lead.website}`} target="_blank" rel="noreferrer" className="hover:underline truncate" style={{ color: "var(--accent)" }}>
                        {lead.website.replace(/^https?:\/\//, "")}
                      </a>
                    </div>
                  </div>
                )}

                {lead.instagram && (
                  <div className="flex flex-col gap-1">
                    <span className="font-semibold text-xs text-[var(--text-3)]">Instagram:</span>
                    <div className="flex items-center gap-2">
                      <Camera className="w-4 h-4 shrink-0" style={{ color: "var(--text-3)" }} />
                      <a
                        href={`https://instagram.com/${lead.instagram.replace(/^@/, "")}`}
                        target="_blank"
                        rel="noreferrer"
                        className="hover:underline truncate"
                        style={{ color: "var(--accent)" }}
                      >
                        {lead.instagram.startsWith("@") ? lead.instagram : `@${lead.instagram}`}
                      </a>
                    </div>
                  </div>
                )}

                {lead.treatwellUrl && (
                  <div className="flex flex-col gap-1">
                    <span className="font-semibold text-xs text-[var(--text-3)]">Treatwell:</span>
                    <div className="flex items-center gap-2">
                      <Globe className="w-4 h-4 shrink-0" style={{ color: "var(--text-3)" }} />
                      <a
                        href={lead.treatwellUrl.startsWith("http") ? lead.treatwellUrl : `https://${lead.treatwellUrl}`}
                        target="_blank"
                        rel="noreferrer"
                        className="hover:underline truncate"
                        style={{ color: "var(--accent)" }}
                      >
                        Treatwell Profil
                      </a>
                    </div>
                  </div>
                )}

                {lead.googleRating != null && (
                  <div className="flex flex-col gap-1">
                    <span className="font-semibold text-xs text-[var(--text-3)]">Google-Bewertung:</span>
                    <div className="flex items-center gap-2">
                      <Star className="w-4 h-4 shrink-0 fill-amber-400 text-amber-400" />
                      <span className="font-semibold" style={{ color: "var(--text)" }}>
                        {lead.googleRating.toFixed(1)}
                      </span>
                      {lead.googleReviewCount != null && (
                        <span style={{ color: "var(--text-3)" }}>({lead.googleReviewCount} Bewertungen)</span>
                      )}
                    </div>
                  </div>
                )}

                {lead.contactPerson && (
                  <div className="flex flex-col gap-1 pt-3 border-t" style={{ borderColor: "var(--border)" }}>
                    <span className="font-semibold text-xs text-[var(--text-3)]">Ansprechpartner:</span>
                    <div className="flex items-center gap-2">
                      <User className="w-4 h-4 shrink-0" style={{ color: "var(--text-3)" }} />
                      <span className="font-medium" style={{ color: "var(--text)" }}>{lead.contactPerson}</span>
                    </div>
                  </div>
                )}

                {lead.nextFollowUpAt && (
                  <div className="flex flex-col gap-1 pt-3 border-t" style={{ borderColor: "var(--border)" }}>
                    <span className="font-semibold text-xs text-[var(--text-3)]">Follow-Up am:</span>
                    <div className="flex items-center gap-2" style={{ color: "var(--text)" }}>
                      <Calendar className="w-4 h-4 shrink-0" style={{ color: "var(--text-3)" }} />
                      <span className="font-medium" style={{ color: "var(--text)" }}>
                        {new Intl.DateTimeFormat("de-AT", { dateStyle: "medium", timeStyle: "short" }).format(new Date(lead.nextFollowUpAt))} Uhr
                      </span>
                    </div>
                  </div>
                )}

                {/* Speisekarte (Gemini AI Detection) */}
                <div className="pt-4 border-t mt-4 space-y-3" style={{ borderColor: "var(--border)" }}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 font-semibold" style={{ color: "var(--text)" }}>
                      <UtensilsCrossed className="w-4 h-4" style={{ color: "var(--accent)" }} />
                      <span>Speisekarte (KI-Check)</span>
                    </div>
                    {lead.hasMenu === true ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                        Online
                      </span>
                    ) : lead.hasMenu === false ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-red-500/10 text-red-500 border border-red-500/20">
                        Keine Karte
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-zinc-500/10 text-zinc-500 border border-zinc-500/20">
                        Nicht geprüft
                      </span>
                    )}
                  </div>

                  {lead.menuSnippet && (
                    <p className="text-sm leading-relaxed p-3 rounded-lg border" style={{ background: "var(--surface-2)", borderColor: "var(--border)", color: "var(--text-2)" }}>
                      {lead.menuSnippet}
                    </p>
                  )}

                  {lead.menuUrl && (
                    <a
                      href={lead.menuUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1.5 text-sm hover:underline"
                      style={{ color: "var(--accent)" }}
                    >
                      <ExternalLink className="w-4 h-4" />
                      <span>Speisekarte öffnen</span>
                    </a>
                  )}

                  {lead.menuCheckedAt && (
                    <div className="text-xs" style={{ color: "var(--text-3)" }}>
                      Zuletzt geprüft: {formatDate(lead.menuCheckedAt)}
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={handleCheckMenu}
                    disabled={checkingMenu || !lead.website}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border transition-colors hover:bg-[var(--surface-3)] disabled:opacity-50"
                    style={{ background: "var(--surface-2)", borderColor: "var(--border-2)", color: "var(--text)" }}
                  >
                    <RefreshCw className={`w-4 h-4 ${checkingMenu ? "animate-spin text-[var(--accent)]" : ""}`} />
                    <span>{checkingMenu ? "Prüfe Speisekarte..." : "Speisekarte neu prüfen"}</span>
                  </button>
                  {!lead.website && (
                    <span className="block text-xs text-center" style={{ color: "var(--text-3)" }}>
                      (Website erforderlich für KI-Check)
                    </span>
                  )}
                </div>
              </div>
            ) : (
              // Edit Form
              <div className="space-y-5 text-sm">
                <div className="flex items-center justify-between border-b pb-3 mb-3" style={{ borderColor: "var(--border)" }}>
                  <h3 className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--text-3)" }}>
                    Lead bearbeiten
                  </h3>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold mb-1.5" style={{ color: "var(--text-3)" }}>Firma</label>
                    <input
                      type="text"
                      className="w-full rounded-lg px-3 py-2 text-sm border outline-none"
                      style={{ background: "var(--surface-2)", borderColor: "var(--border)", color: "var(--text)" }}
                      value={editCompanyName}
                      onChange={(e) => setEditCompanyName(e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold mb-1.5" style={{ color: "var(--text-3)" }}>Akquise-Kanal</label>
                    <select
                      className="w-full rounded-lg px-3 py-2 text-sm border outline-none font-medium"
                      style={{ background: "var(--surface-2)", borderColor: "var(--border)", color: "var(--text)" }}
                      value={editAcquisitionType}
                      onChange={(e) => setEditAcquisitionType(e.target.value)}
                    >
                      <option value="CALL">Cold Call</option>
                      <option value="WALK_IN">Walk-In</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold mb-1.5" style={{ color: "var(--text-3)" }}>NFC Demo URL</label>
                    <input
                      type="url"
                      placeholder="https://demo.scale-evo.com/..."
                      className="w-full rounded-lg px-3 py-2 text-sm border outline-none font-mono"
                      style={{ background: "var(--surface-2)", borderColor: "var(--border)", color: "var(--text)" }}
                      value={editNfcDemoUrl}
                      onChange={(e) => setEditNfcDemoUrl(e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold mb-1.5" style={{ color: "var(--text-3)" }}>Branche</label>
                    <input
                      type="text"
                      className="w-full rounded-lg px-3 py-2 text-sm border outline-none"
                      style={{ background: "var(--surface-2)", borderColor: "var(--border)", color: "var(--text)" }}
                      value={editIndustry}
                      onChange={(e) => setEditIndustry(e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold mb-1.5" style={{ color: "var(--text-3)" }}>Adresse</label>
                    <input
                      type="text"
                      className="w-full rounded-lg px-3 py-2 text-sm border outline-none"
                      style={{ background: "var(--surface-2)", borderColor: "var(--border)", color: "var(--text)" }}
                      value={editAddress}
                      onChange={(e) => setEditAddress(e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold mb-1.5" style={{ color: "var(--text-3)" }}>Stadt</label>
                    <input
                      type="text"
                      className="w-full rounded-lg px-3 py-2 text-sm border outline-none"
                      style={{ background: "var(--surface-2)", borderColor: "var(--border)", color: "var(--text)" }}
                      value={editCity}
                      onChange={(e) => setEditCity(e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold mb-1.5" style={{ color: "var(--text-3)" }}>Google Maps Link</label>
                    <input
                      type="text"
                      placeholder="https://google.com/maps/..."
                      className="w-full rounded-lg px-3 py-2 text-sm border outline-none font-mono"
                      style={{ background: "var(--surface-2)", borderColor: "var(--border)", color: "var(--text)" }}
                      value={editGoogleMapsUrl}
                      onChange={(e) => setEditGoogleMapsUrl(e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold mb-1.5" style={{ color: "var(--text-3)" }}>Telefon</label>
                    <input
                      type="text"
                      className="w-full rounded-lg px-3 py-2 text-sm border outline-none font-mono"
                      style={{ background: "var(--surface-2)", borderColor: "var(--border)", color: "var(--text)" }}
                      value={editPhone}
                      onChange={(e) => setEditPhone(e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold mb-1.5" style={{ color: "var(--text-3)" }}>E-Mail</label>
                    <input
                      type="email"
                      className="w-full rounded-lg px-3 py-2 text-sm border outline-none"
                      style={{ background: "var(--surface-2)", borderColor: "var(--border)", color: "var(--text)" }}
                      value={editEmail}
                      onChange={(e) => setEditEmail(e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold mb-1.5" style={{ color: "var(--text-3)" }}>Webseite</label>
                    <input
                      type="text"
                      className="w-full rounded-lg px-3 py-2 text-sm border outline-none"
                      style={{ background: "var(--surface-2)", borderColor: "var(--border)", color: "var(--text)" }}
                      value={editWebsite}
                      onChange={(e) => setEditWebsite(e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold mb-1.5" style={{ color: "var(--text-3)" }}>Instagram</label>
                    <input
                      type="text"
                      className="w-full rounded-lg px-3 py-2 text-sm border outline-none"
                      style={{ background: "var(--surface-2)", borderColor: "var(--border)", color: "var(--text)" }}
                      value={editInstagram}
                      onChange={(e) => setEditInstagram(e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold mb-1.5" style={{ color: "var(--text-3)" }}>Treatwell Link</label>
                    <input
                      type="text"
                      placeholder="https://www.treatwell.at/ort/..."
                      className="w-full rounded-lg px-3 py-2 text-sm border outline-none"
                      style={{ background: "var(--surface-2)", borderColor: "var(--border)", color: "var(--text)" }}
                      value={editTreatwellUrl}
                      onChange={(e) => setEditTreatwellUrl(e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold mb-1.5" style={{ color: "var(--text-3)" }}>Ansprechpartner</label>
                    <input
                      type="text"
                      className="w-full rounded-lg px-3 py-2 text-sm border outline-none"
                      style={{ background: "var(--surface-2)", borderColor: "var(--border)", color: "var(--text)" }}
                      value={editContactPerson}
                      onChange={(e) => setEditContactPerson(e.target.value)}
                    />
                  </div>
                  
                  <div>
                    <label className="block text-xs font-semibold mb-1.5" style={{ color: "var(--text-3)" }}>Follow-Up Datum & Uhrzeit</label>
                    <input
                      type="datetime-local"
                      className="w-full rounded-lg px-3 py-2 text-sm border outline-none"
                      style={{ background: "var(--surface-2)", borderColor: "var(--border)", color: "var(--text)" }}
                      value={editNextFollowUpAt}
                      onChange={(e) => setEditNextFollowUpAt(e.target.value)}
                    />
                  </div>
                </div>

                <div className="flex items-center gap-3 pt-4 border-t animate-fade-in" style={{ borderColor: "var(--border)" }}>
                  <button
                    onClick={handleSaveLeadDetails}
                    disabled={savingDetails}
                    className="flex-1 text-center font-bold px-4 py-2.5 rounded-lg text-sm hover:opacity-90"
                    style={{ background: "var(--accent)", color: "var(--bg)" }}
                  >
                    {savingDetails ? "Speichert…" : "Speichern"}
                  </button>
                  <button
                    onClick={() => setIsEditing(false)}
                    className="flex-1 text-center font-bold px-4 py-2.5 rounded-lg text-sm hover:bg-[var(--surface-4)]"
                    style={{ background: "var(--surface-3)", color: "var(--text)" }}
                  >
                    Abbrechen
                  </button>
                </div>
              </div>
            )}
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
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 items-start">
                  {/* Left sub-column: Notes */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--text-2)" }}>
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
                      rows={14}
                      className="w-full rounded-md p-4 text-xs border outline-none resize-none leading-relaxed"
                      style={{ background: "var(--surface-2)", borderColor: "var(--border)", color: "var(--text)" }}
                      value={notesText}
                      onChange={(e) => setNotesText(e.target.value)}
                      placeholder="Notizen zum Lead..."
                    />
                  </div>

                  {/* Right sub-column: Timeline */}
                  <div className="space-y-4 xl:border-l xl:pl-8" style={{ borderColor: "var(--border)" }}>
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
                        className="px-4 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1 transition-all active:scale-95 disabled:opacity-70 disabled:cursor-not-allowed disabled:active:scale-100"
                        style={{ background: "var(--accent)", color: "var(--bg)" }}
                      >
                        {addingInteraction ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            Speichert...
                          </>
                        ) : (
                          <>
                            <Send className="w-3.5 h-3.5" />
                            Hinzufügen
                          </>
                        )}
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
                              <div className="flex items-center gap-2">
                                <span className="text-[10px]" style={{ color: "var(--text-3)" }}>
                                  {timeAgo(item.createdAt)}
                                </span>
                                {editingInteractionId !== item.id && (
                                  <button
                                    onClick={() => {
                                      setEditingInteractionId(item.id);
                                      setEditInteractionNote(item.note);
                                    }}
                                    className="text-[10px] hover:underline"
                                    style={{ color: "var(--accent)" }}
                                  >
                                    Bearbeiten
                                  </button>
                                )}
                              </div>
                            </div>
                            
                            {editingInteractionId === item.id ? (
                              <div className="mt-2 space-y-2">
                                <textarea
                                  className="w-full rounded px-2.5 py-1.5 text-xs border outline-none resize-none"
                                  style={{ background: "var(--surface-3)", borderColor: "var(--border)", color: "var(--text)" }}
                                  rows={3}
                                  value={editInteractionNote}
                                  onChange={(e) => setEditInteractionNote(e.target.value)}
                                />
                                <div className="flex items-center gap-2">
                                  <button
                                    onClick={() => handleUpdateInteraction(item.id)}
                                    disabled={savingInteractionId === item.id}
                                    className="px-2 py-1 rounded text-[10px] font-semibold"
                                    style={{ background: "var(--accent)", color: "var(--bg)" }}
                                  >
                                    {savingInteractionId === item.id ? "Speichert..." : "Speichern"}
                                  </button>
                                  <button
                                    onClick={() => setEditingInteractionId(null)}
                                    className="px-2 py-1 rounded text-[10px] font-semibold hover:opacity-80 transition-opacity"
                                    style={{ background: "var(--surface-3)", color: "var(--text)" }}
                                  >
                                    Abbrechen
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <p style={{ color: "var(--text-2)" }} className="whitespace-pre-wrap">{item.note}</p>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                // Gemini Transcripts Tab Content
                <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 items-start">
                  {/* Left sub-column: Upload Audio (4 cols of 12) */}
                  <div className="xl:col-span-4 space-y-4">
                    <div className="rounded-xl border p-5 space-y-4" style={{ background: "var(--surface-2)", borderColor: "var(--border)" }}>
                      <div className="flex items-center gap-2">
                        <Brain className="w-4 h-4" style={{ color: "var(--status-warm-tx)" }} />
                        <h4 className="text-xs font-bold" style={{ color: "var(--text)" }}>Audiodatei hochladen & transkribieren</h4>
                      </div>

                      <label
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                        className={`flex flex-col items-center justify-center border-2 border-dashed rounded-lg p-5 cursor-pointer transition-all ${
                          isDragging
                            ? "border-[var(--accent)] bg-[var(--surface-3)] scale-[1.02]"
                            : "border-[var(--border-2)] hover:bg-[var(--surface-3)]"
                        }`}
                      >
                        <Upload className="w-6 h-6 mb-2" style={{ color: "var(--text-3)" }} />
                        <div className="text-center">
                          <p className="text-xs font-semibold" style={{ color: "var(--text)" }}>Audiodatei (MP3, WAV, M4A) hochladen</p>
                          <p className="text-[10px]" style={{ color: "var(--text-3)" }}>Oder hierher ziehen (Drag & Drop)</p>
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
                  </div>

                  {/* Right sub-column: Recordings List (8 cols of 12) */}
                  <div className="xl:col-span-8 space-y-4 xl:border-l xl:pl-8" style={{ borderColor: "var(--border)" }}>
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
                          const extracted = (typeof rec.aiExtractedData === "object" && rec.aiExtractedData) ? rec.aiExtractedData : {};
                          const nextSteps = Array.isArray(rec.aiNextSteps)
                            ? rec.aiNextSteps
                            : typeof rec.aiNextSteps === "string"
                              ? [rec.aiNextSteps]
                              : [];
                          const aiFeedback = (typeof rec.aiFeedback === "object" && rec.aiFeedback) ? rec.aiFeedback : null;
                          const feedbackTips: string[] = Array.isArray(aiFeedback?.tips)
                            ? aiFeedback.tips
                            : typeof aiFeedback?.tips === "string"
                              ? [aiFeedback.tips]
                              : [];

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
                                  {/* Audio Player */}
                                  {rec.audioFile ? (
                                    <div className="space-y-2">
                                      <h5 className="font-semibold text-[11px] flex items-center gap-1.5" style={{ color: "var(--accent)" }}>
                                        <FileAudio className="w-3.5 h-3.5" /> Aufnahme abspielen
                                      </h5>
                                      <CustomAudioPlayer
                                        src={`/api/cold-calls/recordings/${rec.id}/audio`}
                                        title={rec.fileName || "Call-Aufnahme"}
                                        fileName={rec.fileName}
                                      />
                                    </div>
                                  ) : (
                                    <div className="p-3.5 rounded border text-[10px] italic" style={{ background: "var(--surface-2)", borderColor: "var(--border)", color: "var(--text-3)" }}>
                                      Keine abspielbare Audiodatei vorhanden (vor Einführung der Player-Funktion hochgeladen).
                                    </div>
                                  )}

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

                                  {/* Rhetoric Feedback */}
                                  {aiFeedback && (
                                    <div className="p-3.5 rounded border space-y-3" style={{ background: "var(--surface-2)", borderColor: "var(--border)" }}>
                                      <h5 className="font-semibold text-[11px] flex items-center gap-1.5" style={{ color: "var(--status-warm-tx)" }}>
                                        <Sparkles className="w-3.5 h-3.5" /> Rhetorik- & Sprechstil-Analyse
                                      </h5>
                                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-[11px]">
                                        <div className="space-y-0.5">
                                          <span className="font-semibold text-[10px]" style={{ color: "var(--text-3)" }}>Redegeschwindigkeit:</span>
                                          <p style={{ color: "var(--text-2)" }}>{aiFeedback.pace || "—"}</p>
                                        </div>
                                        <div className="space-y-0.5">
                                          <span className="font-semibold text-[10px]" style={{ color: "var(--text-3)" }}>Füllwörter & Stottern:</span>
                                          <p style={{ color: "var(--text-2)" }}>{aiFeedback.stuttering || "—"}</p>
                                        </div>
                                        <div className="space-y-0.5">
                                          <span className="font-semibold text-[10px]" style={{ color: "var(--text-3)" }}>Gelassenheit & Tonfall:</span>
                                          <p style={{ color: "var(--text-2)" }}>{aiFeedback.tone || "—"}</p>
                                        </div>
                                      </div>

                                      {feedbackTips.length > 0 && (
                                        <div className="border-t pt-2 mt-2 space-y-1" style={{ borderColor: "var(--border)" }}>
                                          <span className="font-semibold text-[10px]" style={{ color: "var(--text-3)" }}>Rhetorik-Tipps zur Verbesserung:</span>
                                          <ul className="space-y-1 mt-1">
                                            {feedbackTips.map((tip: string, idx: number) => (
                                              <li key={idx} style={{ color: "var(--text-2)" }}>• {tip}</li>
                                            ))}
                                          </ul>
                                        </div>
                                      )}
                                    </div>
                                  )}

                                  {/* Transcript block */}
                                  <div className="space-y-1">
                                    <h5 className="font-semibold text-[11px] flex items-center gap-1" style={{ color: "var(--text-3)" }}>
                                      <FileText className="w-3.5 h-3.5" /> Vollständiges Transkript
                                    </h5>
                                    <div
                                      className="p-3 rounded border text-[11px] font-mono leading-relaxed max-h-60 overflow-y-auto whitespace-pre-wrap"
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
    </div>
  );
}

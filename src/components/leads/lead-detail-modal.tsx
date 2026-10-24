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
  Check,
  Copy,
  Maximize2,
  Minimize2,
  Archive,
  RotateCcw,
  PanelRight,
  PanelRightClose,
  ChevronDown,
  Pencil,
  ArrowLeft,
} from "lucide-react";
import { StatusBadge } from "@/components/ui/status-badge";
import { LeadPriorityBadge } from "@/components/leads/lead-priority-badge";
import { OutreachLeadPanel } from "@/components/outreach/outreach-lead-panel";
import { CustomAudioPlayer } from "@/components/ui/custom-audio-player";
import { LeadAttachments } from "./lead-attachments";
import { LeadAuditSection } from "./lead-audit-section";
import { PlanCallPanel } from "@/components/calendar/plan-call-panel";
import { STATUS_LABELS, INTERACTION_LABELS } from "@/lib/constants";
import { formatDate, timeAgo, normalizeInstagramHandle, instagramProfileUrl } from "@/lib/utils";
import { extractCustomOutreachScript } from "@/lib/outreach-script";
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
  const [checkingMenu, setCheckingMenu] = useState(false);
  const [customOutreachScript, setCustomOutreachScript] = useState<string | null>(null);
  const [preloadedOutreachText, setPreloadedOutreachText] = useState<string | null>(null);
  const [copiedPitch, setCopiedPitch] = useState(false);
  const [pitchFullscreen, setPitchFullscreen] = useState(false);
  const [teleprompterFontSize, setTeleprompterFontSize] = useState<number>(24);

  // Tab State: "timeline", "gemini" or "outreach"
  const [activeTab, setActiveTab] = useState<"timeline" | "gemini" | "outreach">("timeline");

  // Call recordings for this lead
  const [recordings, setRecordings] = useState<any[]>([]);
  const [loadingRecordings, setLoadingRecordings] = useState(false);
  const [selectedRecordingId, setSelectedRecordingId] = useState<string | null>(null);

  // Upload Call State
  const [uploadingCall, setUploadingCall] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [isDragging, setIsDragging] = useState(false);

  // Apple-style Collapsible Inspector Drawer (Right Side)
  const [inspectorOpen, setInspectorOpen] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("lead_detail_inspector_open");
      if (saved !== null) {
        setInspectorOpen(saved === "true");
      }
    } catch {}
  }, []);

  const toggleInspector = () => {
    setInspectorOpen((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("lead_detail_inspector_open", String(next));
      } catch {}
      return next;
    });
  };

  // Keyboard shortcut: Escape closes modal or teleprompter
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (pitchFullscreen) {
          setPitchFullscreen(false);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [pitchFullscreen, onClose]);

  // Edit Interaction State
  const [editingInteractionId, setEditingInteractionId] = useState<string | null>(null);
  const [editInteractionNote, setEditInteractionNote] = useState("");
  const [savingInteractionId, setSavingInteractionId] = useState<string | null>(null);

  // Lead Editing State
  const [isEditing, setIsEditing] = useState(false);
  const [editCompanyName, setEditCompanyName] = useState("");
  const [editAcquisitionType, setEditAcquisitionType] = useState<string>("CALL");
  const [editIsFocus, setEditIsFocus] = useState(false);
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
          const script = extractCustomOutreachScript(data.lead.notes);
          setCustomOutreachScript(script);

          // Initialize edit values
          setEditCompanyName(data.lead.companyName || "");
          setEditAcquisitionType(data.lead.acquisitionType || "CALL");
          setEditIsFocus(Boolean(data.lead.isFocus));
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
    const prevLead = lead;
    const prevEditIsFocus = editIsFocus;
    const isNowNotRelevant = newStatus === "NOT_RELEVANT";
    const wasNotRelevant = lead.status === "NOT_RELEVANT";
    const restoredPrio = (lead.score ?? 0) >= 70 ? "HIGH" : (lead.score ?? 0) >= 40 ? "MEDIUM" : "LOW";

    setLead({
      ...lead,
      status: newStatus,
      ...(isNowNotRelevant
        ? {
            priority: "LOW",
            prioritySource: "SYSTEM",
            priorityRatedAt: null,
            priorityRatedByName: null,
            priorityRatedBy: null,
            isFocus: false,
          }
        : wasNotRelevant
          ? {
              priority: restoredPrio,
              prioritySource: "SYSTEM",
            }
          : {}),
    });
    if (isNowNotRelevant) {
      setEditIsFocus(false);
    }

    try {
      const res = await fetch(`/api/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error("Failed to update status");
      const data = await res.json().catch(() => null);
      if (data?.lead) {
        setLead((curr: any) =>
          curr
            ? {
                ...curr,
                status: data.lead.status ?? newStatus,
                priority: data.lead.priority ?? curr.priority,
                prioritySource: data.lead.prioritySource ?? curr.prioritySource,
                priorityRatedAt:
                  data.lead.priorityRatedAt !== undefined ? data.lead.priorityRatedAt : curr.priorityRatedAt,
                priorityRatedByName:
                  data.lead.priorityRatedByName !== undefined
                    ? data.lead.priorityRatedByName
                    : curr.priorityRatedByName,
                priorityRatedBy: isNowNotRelevant ? null : curr.priorityRatedBy,
                isFocus: data.lead.isFocus !== undefined ? data.lead.isFocus : curr.isFocus,
              }
            : curr
        );
      }
      onUpdate();
    } catch (err) {
      console.error(err);
      setLead(prevLead);
      setEditIsFocus(prevEditIsFocus);
    }
  }

  async function handleAcquisitionTypeChange(newType: string) {
    if (!lead) return;
    try {
      const res = await fetch(`/api/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acquisitionType: newType }),
      });
      if (res.ok) {
        setLead({ ...lead, acquisitionType: newType });
        setEditAcquisitionType(newType);
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
        const updatedScript = extractCustomOutreachScript(notesText);
        setCustomOutreachScript(updatedScript);
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
          isFocus: editIsFocus,
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
    <div className="fixed inset-0 z-50 flex flex-col bg-[var(--bg)] text-[var(--text)] overflow-hidden animate-fade-in">
      {/* ─── Apple Header Row 1: Primary Bar ───────────────────────────────── */}
      <div
        className="flex items-center justify-between px-4 sm:px-6 py-2.5 border-b shrink-0 gap-3"
        style={{ borderColor: "var(--border)", background: "var(--surface)" }}
      >
        {/* Left Side: Back/Close Button + Title + Focus Star + Status Badge */}
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors hover:bg-[var(--surface-3)] shrink-0"
            style={{ borderColor: "var(--border)", color: "var(--text-2)", background: "var(--surface-2)" }}
            title="Schließen (Esc)"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Zurück</span>
          </button>

          <div className="flex items-center gap-2 min-w-0">
            <h2 className="font-heading text-base sm:text-lg font-bold truncate" style={{ color: "var(--text)" }}>
              {lead?.companyName || (loading ? "Lädt Lead Details…" : "Lead")}
            </h2>

            {lead && (
              <button
                type="button"
                disabled={lead.status === "NOT_RELEVANT" && !lead.isFocus}
                onClick={async () => {
                  if (lead.status === "NOT_RELEVANT" && !lead.isFocus) return;
                  const nextVal = !lead.isFocus;
                  setLead({ ...lead, isFocus: nextVal });
                  await fetch(`/api/leads/${lead.id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ isFocus: nextVal }),
                  });
                  onUpdate();
                }}
                title={
                  lead.status === "NOT_RELEVANT" && !lead.isFocus
                    ? "Irrelevante Leads können keinen 2-Wochen-Fokus erhalten"
                    : lead.isFocus
                    ? "2-Wochen-Fokus entfernen"
                    : "Für 2-Wochen-Fokus vormerken"
                }
                className={`p-1.5 rounded-md transition-all shrink-0 ${
                  lead.status === "NOT_RELEVANT" && !lead.isFocus
                    ? "text-[var(--text-3)] opacity-20 cursor-not-allowed"
                    : lead.isFocus
                    ? "text-amber-400 bg-amber-400/15"
                    : "text-[var(--text-3)] hover:text-amber-400 hover:bg-[var(--surface-3)]"
                }`}
              >
                <Star className={`w-4 h-4 ${lead.isFocus ? "fill-amber-400 text-amber-400" : ""}`} />
              </button>
            )}
          </div>

          {lead && (
            <div className="hidden sm:flex items-center gap-2 shrink-0">
              <StatusBadge status={lead.status} />
              {["NOT_RELEVANT", "LOST", "VISITED_NO_INTEREST"].includes(lead.status) ? (
                <button
                  type="button"
                  onClick={() => handleStatusChange("NEW")}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border transition-colors bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20"
                  title="Aus dem Archiv wiederherstellen (Status: Neu)"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span className="hidden md:inline">Wiederherstellen</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => handleStatusChange("NOT_RELEVANT")}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border transition-colors hover:bg-amber-500/15 hover:text-amber-400 hover:border-amber-500/30"
                  style={{ borderColor: "var(--border)", color: "var(--text-2)", background: "var(--surface-2)" }}
                  title="Als 'Nicht relevant' ins Archiv verschieben"
                >
                  <Archive className="w-3.5 h-3.5" />
                  <span className="hidden md:inline">Ins Archiv</span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Right Side: Quick Action Hub + Priority + Inspector Toggle */}
        <div className="flex items-center gap-2 shrink-0">
          {lead && (
            <div className="shrink-0">
              <LeadPriorityBadge
                leadId={lead.id}
                status={lead.status}
                priority={lead.priority}
                prioritySource={lead.prioritySource}
                priorityRatedByName={lead.priorityRatedByName || lead.priorityRatedBy?.displayName || lead.priorityRatedBy?.email}
                priorityRatedAt={lead.priorityRatedAt}
                variant="table"
                onArchive={() => handleStatusChange("NOT_RELEVANT")}
                onUpdate={(newPrio, newSource, serverLead) => {
                  setLead((prev: any) => ({
                    ...prev,
                    priority: newPrio,
                    prioritySource: newSource,
                    priorityRatedByName: serverLead?.priorityRatedByName || (newSource === "USER" ? (prev.priorityRatedByName || "Du") : null),
                    priorityRatedAt: serverLead?.priorityRatedAt || (newSource === "USER" ? new Date().toISOString() : null),
                  }));
                  onUpdate();
                }}
              />
            </div>
          )}

          {lead?.phone && (
            <a
              href={`tel:${lead.phone}`}
              className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/25 transition-all shadow-sm shrink-0"
              title={`Anrufen: ${lead.phone}`}
            >
              <Phone className="w-3.5 h-3.5" />
              <span className="hidden md:inline font-mono">{lead.phone}</span>
            </a>
          )}

          {lead?.website && (
            <a
              href={lead.website.startsWith("http") ? lead.website : `https://${lead.website}`}
              target="_blank"
              rel="noreferrer"
              className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-[var(--border)] text-[var(--text-2)] hover:text-[var(--text)] hover:bg-[var(--surface-2)] transition-colors shrink-0"
              title="Website öffnen"
            >
              <Globe className="w-3.5 h-3.5" />
              <span className="hidden lg:inline">{lead.website.replace(/^https?:\/\//, "")}</span>
              <ExternalLink className="w-3 h-3 opacity-60" />
            </a>
          )}

          {(lead?.address || lead?.city || lead?.googleMapsUrl) && (
            <a
              href={
                lead.googleMapsUrl ||
                `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([lead?.companyName, lead?.address, lead?.city].filter(Boolean).join(", "))}`
              }
              target="_blank"
              rel="noreferrer"
              className="hidden md:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border shrink-0 hover:bg-[var(--surface-3)] transition-colors text-sky-400"
              style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}
              title="Route auf Google Maps öffnen"
            >
              <Navigation className="w-3.5 h-3.5" />
              <span className="hidden lg:inline">Maps</span>
            </a>
          )}

          {/* Inspector Toggle Button */}
          <button
            type="button"
            onClick={toggleInspector}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all shrink-0 ${
              inspectorOpen
                ? "bg-[var(--accent)] text-[var(--bg)] border-[var(--accent)] shadow-sm"
                : "bg-[var(--surface-2)] text-[var(--text)] border-[var(--border)] hover:bg-[var(--surface-3)]"
            }`}
            title="Details & Bearbeiten (Inspector anzeigen/ausblenden)"
          >
            <PanelRight className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{inspectorOpen ? "Details schließen" : "Details & Edit"}</span>
            {isEditing && <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse ml-0.5" />}
          </button>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg transition-colors hover:bg-[var(--surface-3)] shrink-0 ml-1"
            style={{ color: "var(--text-2)" }}
            title="Schließen (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* ─── Apple Header Row 2: Secondary Meta Strip ──────────────────────── */}
      {lead && (
        <div
          className="flex items-center justify-between px-4 sm:px-6 py-2 border-b gap-3 text-xs shrink-0 overflow-x-auto"
          style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}
        >
          {/* Quick Selectors & Info Chips */}
          <div className="flex items-center gap-2.5 shrink-0">
            {/* Status Selector */}
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-[11px] font-semibold text-[var(--text-3)]">Status:</span>
              <select
                className="rounded-md px-2 py-1 text-xs font-medium border outline-none cursor-pointer"
                style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text)" }}
                value={lead.status}
                onChange={(e) => handleStatusChange(e.target.value as LeadStatus)}
              >
                {Object.entries(STATUS_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>
                    {key === "NOT_RELEVANT" ? `${label} (📦 Archiv)` : label}
                  </option>
                ))}
              </select>
            </div>

            {/* Akquise-Kanal Selector */}
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-[11px] font-semibold text-[var(--text-3)]">Kanal:</span>
              <select
                className="rounded-md px-2 py-1 text-xs font-medium border outline-none cursor-pointer"
                style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text)" }}
                value={lead.acquisitionType || "CALL"}
                onChange={(e) => handleAcquisitionTypeChange(e.target.value)}
              >
                <option value="CALL">📞 Cold Call</option>
                <option value="WALK_IN">🚶 Walk-In</option>
                <option value="DM">💬 Instagram DM</option>
                <option value="EMAIL">✉️ E-Mail</option>
              </select>
            </div>

            {/* Ansprechpartner Chip */}
            {lead.contactPerson && (
              <div
                className="flex items-center gap-1 px-2.5 py-1 rounded-md border text-xs shrink-0"
                style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text)" }}
              >
                <User className="w-3 h-3 text-[var(--accent)]" />
                <span className="font-medium">{lead.contactPerson}</span>
              </div>
            )}

            {/* Stadt / Adresse Chip */}
            {(lead.city || lead.address) && (
              <div
                className="hidden sm:flex items-center gap-1 px-2.5 py-1 rounded-md border text-xs shrink-0"
                style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text-2)" }}
              >
                <MapPin className="w-3 h-3 text-[var(--text-3)]" />
                <span>{lead.city || lead.address}</span>
              </div>
            )}

            {/* Google Rating Chip */}
            {lead.googleRating != null && (
              <div
                className="hidden md:flex items-center gap-1 px-2.5 py-1 rounded-md border text-xs shrink-0"
                style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text)" }}
              >
                <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                <span className="font-semibold">{lead.googleRating.toFixed(1)}</span>
                {lead.googleReviewCount != null && (
                  <span className="text-[10px] text-[var(--text-3)]">({lead.googleReviewCount})</span>
                )}
              </div>
            )}

            {/* Follow-Up Chip */}
            {lead.nextFollowUpAt && (
              <div className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-amber-500/10 border border-amber-500/25 text-amber-300 text-xs shrink-0">
                <Calendar className="w-3 h-3 text-amber-400" />
                <span>Follow-Up: {new Intl.DateTimeFormat("de-AT", { dateStyle: "medium", timeStyle: "short" }).format(new Date(lead.nextFollowUpAt))} Uhr</span>
              </div>
            )}

            {/* NFC Demo Link Chip */}
            {lead.nfcDemoUrl && (
              <a
                href={lead.nfcDemoUrl}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 px-2.5 py-1 rounded-md border text-xs shrink-0 hover:underline"
                style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--accent)" }}
              >
                <Sparkles className="w-3 h-3 text-amber-400" />
                <span>NFC Demo ↗</span>
              </a>
            )}
          </div>

          {/* Right: Created by info */}
          {lead.createdBy && (
            <div className="hidden lg:flex items-center gap-1.5 text-[11px] text-[var(--text-3)] shrink-0">
              <span>Erstellt von:</span>
              <span className="font-semibold text-[var(--text)]">
                {lead.createdBy.displayName || (lead.createdBy.email ? lead.createdBy.email.split("@")[0] : "—")}
              </span>
            </div>
          )}
        </div>
      )}

      {/* ─── Main Body: Full-Width Workspace + Right Inspector Drawer ───────── */}
      {loading || !lead ? (
        <div className="flex-1 flex flex-col items-center justify-center" style={{ color: "var(--text-3)" }}>
          <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin mb-3" style={{ borderColor: "var(--border-2)", borderTopColor: "var(--accent)" }} />
          <span>Lädt Lead Details…</span>
        </div>
      ) : (
        <div className="flex-1 flex overflow-hidden min-h-0">
          {/* Primary Workspace: Takes 100% flex width! */}
          <main className="flex-1 min-w-0 flex flex-col overflow-hidden bg-[var(--bg)]">
            {/* Tab Bar */}
            <div
              className="flex items-center border-b px-4 sm:px-6 py-2 shrink-0 gap-1"
              style={{ borderColor: "var(--border)", background: "var(--surface)" }}
            >
              <button
                onClick={() => setActiveTab("timeline")}
                className={`px-4 py-2 text-xs font-semibold border-b-2 transition-all flex items-center gap-1.5 ${
                  activeTab === "timeline"
                    ? "border-[var(--accent)] text-[var(--text)]"
                    : "border-transparent text-[var(--text-2)] hover:text-[var(--text)]"
                }`}
              >
                <FileText className="w-3.5 h-3.5 opacity-70" />
                <span>Notizen & Timeline</span>
              </button>

              <button
                onClick={() => setActiveTab("outreach")}
                className={`px-4 py-2 text-xs font-semibold border-b-2 transition-all flex items-center gap-1.5 ${
                  activeTab === "outreach"
                    ? "border-[var(--accent)] text-[var(--text)]"
                    : "border-transparent text-[var(--text-2)] hover:text-[var(--text)]"
                }`}
              >
                <Send className="w-3.5 h-3.5" style={{ color: "var(--status-contacted-tx)" }} />
                <span>Outreach Copilot</span>
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
                <span>Gemini Transkripte ({recordings.length})</span>
              </button>
            </div>

            {/* Tab Content Box */}
            <div className={`flex-1 min-h-0 ${activeTab === "outreach" ? "overflow-hidden p-4 sm:p-6 flex flex-col" : "overflow-y-auto p-4 sm:p-6"}`}>
              {/* Outreach Tab - kept mounted so Copilot chat history and edits are never lost on tab switch */}
              <div className={activeTab === "outreach" ? "flex-1 min-h-0 flex flex-col h-full" : "hidden"}>
                <OutreachLeadPanel
                  key={lead.id}
                  leadId={lead.id}
                  companyName={lead.companyName}
                  instagram={lead.instagram ?? null}
                  website={lead.website ?? null}
                  initialScriptText={preloadedOutreachText}
                  onLiveScriptEdit={(scriptText) => {
                    setCustomOutreachScript(scriptText);
                  }}
                  onScriptSaved={(scriptText, updatedNotes) => {
                    setCustomOutreachScript(scriptText);
                    if (updatedNotes) {
                      setNotesText(updatedNotes);
                      setLead((prev: any) => (prev ? { ...prev, notes: updatedNotes } : prev));
                    }
                    onUpdate();
                  }}
                  onSent={() => {
                    onUpdate();
                  }}
                />
              </div>

              {activeTab === "timeline" ? (
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 items-start">
                  {/* Left sub-column: Notes */}
                  <div className="min-w-0 space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--text-2)" }}>
                        Notizen & Besonderheiten
                      </label>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            if (customOutreachScript) setPreloadedOutreachText(customOutreachScript);
                            setActiveTab("outreach");
                          }}
                          className="text-xs font-semibold px-2.5 py-1.5 rounded transition-colors border hover:bg-[var(--surface-3)] flex items-center gap-1.5 text-orange-400"
                          style={{ borderColor: "rgba(249, 115, 22, 0.35)", background: "var(--surface-2)" }}
                          title="Zum Outreach-Copilot springen"
                        >
                          <Send className="w-3 h-3" />
                          <span>Zum Outreach</span>
                        </button>
                        <button
                          onClick={handleSaveNotes}
                          disabled={savingNotes}
                          className="text-xs font-semibold px-3 py-1.5 rounded transition-colors hover:bg-[var(--surface-3)]"
                          style={{ background: "var(--surface-2)", color: "var(--accent)" }}
                        >
                          {savingNotes ? "Speichert…" : "Notiz Speichern"}
                        </button>
                      </div>
                    </div>

                    {/* Mirror des Custom Outreach-Skripts (NUR wenn ein echtes Custom-Skript existiert!) */}
                    {customOutreachScript && (
                      <div
                        className="rounded-xl border p-3.5 space-y-2.5 transition-all shadow-sm animate-fade-in"
                        style={{
                          background: "linear-gradient(180deg, var(--surface-2) 0%, var(--surface) 100%)",
                          borderColor: "rgba(249, 115, 22, 0.4)",
                        }}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 text-xs font-bold text-orange-400">
                            <Sparkles className="w-3.5 h-3.5" />
                            <span>Custom Outreach-Skript</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            {/* Fullscreen Button */}
                            <button
                              type="button"
                              onClick={() => setPitchFullscreen(true)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold border transition-all hover:bg-[var(--surface-3)] text-orange-400"
                              style={{
                                borderColor: "rgba(249, 115, 22, 0.35)",
                                background: "var(--surface)",
                              }}
                              title="Skript im Vollbild-Teleprompter öffnen"
                            >
                              <Maximize2 className="w-3.5 h-3.5" />
                              <span>Vollbild</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                navigator.clipboard.writeText(customOutreachScript);
                                setCopiedPitch(true);
                                setTimeout(() => setCopiedPitch(false), 2000);
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold border transition-all hover:bg-[var(--surface-3)]"
                              style={{
                                borderColor: "var(--border)",
                                background: "var(--surface)",
                                color: "var(--text)",
                              }}
                              title="Skript kopieren"
                            >
                              {copiedPitch ? (
                                <>
                                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                                  <span className="text-emerald-400 font-bold">Kopiert!</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3.5 h-3.5 text-orange-400" />
                                  <span>Kopieren</span>
                                </>
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setPreloadedOutreachText(customOutreachScript);
                                setActiveTab("outreach");
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold text-white transition-all hover:opacity-90 shadow-sm"
                              style={{ background: "linear-gradient(135deg, #f97316 0%, #ea580c 100%)" }}
                              title="Skript direkt im Outreach-Editor öffnen"
                            >
                              <Send className="w-3 h-3" />
                              <span>In Outreach öffnen</span>
                            </button>
                          </div>
                        </div>

                        <div
                          onClick={() => {
                            navigator.clipboard.writeText(customOutreachScript);
                            setCopiedPitch(true);
                            setTimeout(() => setCopiedPitch(false), 2000);
                          }}
                          className="group relative p-3 rounded-lg border text-xs leading-relaxed cursor-pointer transition-all hover:border-orange-500/60 hover:bg-orange-500/5 select-none"
                          style={{
                            background: "var(--surface-3)",
                            borderColor: "var(--border)",
                            color: "var(--text)",
                          }}
                          title="👉 Klicken zum schnellen Kopieren des gesamten Skripts"
                        >
                          <p className="font-medium text-[var(--text)] italic leading-relaxed whitespace-pre-wrap">
                            „{customOutreachScript}“
                          </p>
                          <div className="mt-2 pt-2 border-t flex items-center justify-between text-[11px] text-[var(--text-3)] group-hover:text-orange-400 transition-colors" style={{ borderColor: "var(--border)" }}>
                            <span className="flex items-center gap-1">
                              <Copy className="w-3 h-3" />
                              Klicken zum Kopieren
                            </span>
                            <span className="text-emerald-400 font-semibold opacity-0 group-hover:opacity-100 transition-opacity">
                              {copiedPitch ? "✓ In Zwischenablage kopiert!" : "1-Klick Copy"}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}

                    <textarea
                      rows={customOutreachScript ? 8 : 14}
                      className="w-full rounded-md p-4 text-xs border outline-none resize-none leading-relaxed"
                      style={{ background: "var(--surface-2)", borderColor: "var(--border)", color: "var(--text)" }}
                      value={notesText}
                      onChange={(e) => setNotesText(e.target.value)}
                      placeholder="Notizen zum Lead..."
                    />
                  </div>

                  {/* Right sub-column: Timeline, Audit & Attachments */}
                  <div className="min-w-0 space-y-4 xl:border-l xl:pl-8" style={{ borderColor: "var(--border)" }}>
                    {/* Timeline Items */}
                    {lead.interactions && lead.interactions.length > 0 && (
                      <div className="space-y-3">
                        <h3 className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--text-2)" }}>
                          Kontakt-Verlauf ({lead.interactions.length})
                        </h3>
                        <div className="space-y-3">
                          {lead.interactions.map((item: any) => (
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
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Website-Probleme & Audit (lazy) */}
                    {lead.website && (
                      <LeadAuditSection
                        leadId={lead.id}
                        initialStatus={lead.auditStatus}
                        initialSeverity={lead.auditSeverity}
                        onChanged={onUpdate}
                      />
                    )}

                    {/* Bilder & Screenshots */}
                    <LeadAttachments
                      leadId={lead.id}
                      attachments={lead.attachments || []}
                      onUpdate={() => {
                        onUpdate();
                        fetch(`/api/leads/${lead.id}`)
                          .then((r) => r.json())
                          .then((d) => {
                            if (d.lead) setLead(d.lead);
                          })
                          .catch(console.error);
                      }}
                    />
                  </div>
                </div>
              ) : activeTab === "gemini" ? (
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
              ) : null}
            </div>
          </main>

          {/* ─── Apple Collapsible Inspector Drawer (Right Side) ────────────── */}
          {inspectorOpen && (
            <aside
              className="w-full sm:w-[380px] xl:w-[420px] shrink-0 border-l overflow-y-auto p-5 space-y-6 shadow-xl animate-fade-in"
              style={{
                borderColor: "var(--border)",
                background: "var(--surface)",
              }}
            >
              {/* Drawer Header */}
              <div className="flex items-center justify-between border-b pb-3" style={{ borderColor: "var(--border)" }}>
                <div className="flex items-center gap-2">
                  <PanelRight className="w-4 h-4" style={{ color: "var(--accent)" }} />
                  <h3 className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--text)" }}>
                    Lead-Inspector
                  </h3>
                </div>
                <div className="flex items-center gap-2">
                  {!isEditing ? (
                    <button
                      type="button"
                      onClick={() => setIsEditing(true)}
                      className="inline-flex items-center gap-1 text-xs font-bold uppercase px-3 py-1.5 rounded-md transition-colors hover:bg-[var(--surface-3)]"
                      style={{ background: "var(--surface-2)", color: "var(--accent)" }}
                    >
                      <Pencil className="w-3 h-3" />
                      <span>Bearbeiten</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setIsEditing(false)}
                      className="text-xs font-bold uppercase px-3 py-1.5 rounded-md transition-colors hover:bg-[var(--surface-3)]"
                      style={{ background: "var(--surface-2)", color: "var(--text-3)" }}
                    >
                      Abbrechen
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={toggleInspector}
                    className="p-1.5 rounded-md text-[var(--text-3)] hover:text-[var(--text)] hover:bg-[var(--surface-2)] transition-colors"
                    title="Inspector schließen"
                  >
                    <PanelRightClose className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Cold Call planen Panel */}
              <PlanCallPanel leadId={lead.id} leadName={lead.companyName} />

              {/* Status & Priorität Management */}
              <div className="p-4 rounded-xl border space-y-4" style={{ background: "var(--surface-2)", borderColor: "var(--border)" }}>
                {/* Status Switcher */}
                <div>
                  <label className="block text-xs font-semibold mb-2" style={{ color: "var(--text-2)" }}>
                    Status ändern
                  </label>
                  <select
                    className="w-full rounded-md px-3 py-2 text-xs font-medium border outline-none cursor-pointer"
                    style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text)" }}
                    value={lead.status}
                    onChange={(e) => handleStatusChange(e.target.value as LeadStatus)}
                  >
                    {Object.entries(STATUS_LABELS).map(([key, label]) => (
                      <option key={key} value={key}>
                        {key === "NOT_RELEVANT" ? `${label} (📦 Archiv)` : label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Priorität & Rating */}
                <LeadPriorityBadge
                  leadId={lead.id}
                  status={lead.status}
                  priority={lead.priority}
                  prioritySource={lead.prioritySource}
                  priorityRatedByName={lead.priorityRatedByName || lead.priorityRatedBy?.displayName || lead.priorityRatedBy?.email}
                  priorityRatedAt={lead.priorityRatedAt}
                  variant="detail"
                  onArchive={() => handleStatusChange("NOT_RELEVANT")}
                  onUpdate={(newPrio, newSource, serverLead) => {
                    setLead((prev: any) => ({
                      ...prev,
                      priority: newPrio,
                      prioritySource: newSource,
                      priorityRatedByName: serverLead?.priorityRatedByName || (newSource === "USER" ? (prev.priorityRatedByName || "Du") : null),
                      priorityRatedAt: serverLead?.priorityRatedAt || (newSource === "USER" ? new Date().toISOString() : null),
                    }));
                    onUpdate();
                  }}
                />

                {/* Akquise-Weg Switcher */}
                <div>
                  <label className="block text-xs font-semibold mb-2" style={{ color: "var(--text-2)" }}>
                    Akquise-Weg wählen
                  </label>
                  <select
                    className="w-full rounded-md px-3 py-2 text-xs font-medium border outline-none cursor-pointer"
                    style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text)" }}
                    value={lead.acquisitionType || "CALL"}
                    onChange={(e) => handleAcquisitionTypeChange(e.target.value)}
                  >
                    <option value="CALL">📞 Cold Call</option>
                    <option value="WALK_IN">🚶 Walk-In</option>
                    <option value="DM">💬 Instagram DM</option>
                    <option value="EMAIL">✉️ E-Mail Akquise</option>
                  </select>
                </div>
              </div>

              {/* Inspector Content: Details View vs. Full Edit Form */}
              {!isEditing ? (
                <div className="space-y-5 text-sm">
                  {/* Akquise-Kanal & Fokus */}
                  <div className="flex flex-col gap-1">
                    <span className="font-semibold text-xs text-[var(--text-3)]">Akquise-Kanal:</span>
                    <div className="flex items-center gap-2">
                      <span
                        className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-md"
                        style={{
                          background:
                            lead.acquisitionType === "DM"
                              ? "var(--channel-dm-bg)"
                              : lead.acquisitionType === "EMAIL"
                              ? "rgba(245, 158, 11, 0.15)"
                              : lead.acquisitionType === "WALK_IN"
                              ? "rgba(168, 85, 247, 0.1)"
                              : "rgba(59, 130, 246, 0.1)",
                          color:
                            lead.acquisitionType === "DM"
                              ? "var(--channel-dm-tx)"
                              : lead.acquisitionType === "EMAIL"
                              ? "#f59e0b"
                              : lead.acquisitionType === "WALK_IN"
                              ? "rgb(192, 132, 252)"
                              : "rgb(96, 165, 250)",
                        }}
                      >
                        {lead.acquisitionType === "DM"
                          ? "Instagram DM"
                          : lead.acquisitionType === "EMAIL"
                          ? "E-Mail Akquise"
                          : lead.acquisitionType === "WALK_IN"
                          ? "Walk-In"
                          : "Cold Call"}
                      </span>
                      {lead.isFocus && (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/30">
                          ⭐ 2-Wochen-Fokus
                        </span>
                      )}
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
                          className="text-sm font-mono hover:underline truncate max-w-[200px]"
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
                          href={instagramProfileUrl(lead.instagram) ?? "#"}
                          target="_blank"
                          rel="noreferrer"
                          className="hover:underline truncate"
                          style={{ color: "var(--accent)" }}
                        >
                          {normalizeInstagramHandle(lead.instagram)
                            ? `@${normalizeInstagramHandle(lead.instagram)}`
                            : lead.instagram}
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

                  {/* Lead Meta: Timestamps & Erstellt von */}
                  <div className="pt-4 border-t mt-4 space-y-2.5 text-xs" style={{ borderColor: "var(--border)" }}>
                    <div className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-[11px]" style={{ color: "var(--text-3)" }}>
                      <Clock className="w-3.5 h-3.5" />
                      <span>Lead-Metadaten & Historie</span>
                    </div>

                    <div className="p-3 rounded-lg border space-y-2" style={{ background: "var(--surface-2)", borderColor: "var(--border)" }}>
                      {/* Erstellt von */}
                      <div className="flex items-center justify-between">
                        <span style={{ color: "var(--text-3)" }}>Erstellt von:</span>
                        <div className="flex items-center gap-1.5">
                          <div
                            className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0 border"
                            style={{
                              background: "var(--surface-3)",
                              borderColor: "var(--border)",
                              color: "var(--accent)",
                            }}
                          >
                            {(lead.createdBy?.displayName || lead.createdBy?.email || "U").charAt(0).toUpperCase()}
                          </div>
                          <span className="font-semibold" style={{ color: "var(--text)" }}>
                            {lead.createdBy?.displayName || (lead.createdBy?.email ? lead.createdBy.email.split("@")[0] : "—")}
                          </span>
                        </div>
                      </div>

                      {/* Erstellt am / Timestamps */}
                      <div className="flex items-center justify-between">
                        <span style={{ color: "var(--text-3)" }}>Erstellt am:</span>
                        <span className="font-mono text-[11px] font-medium" style={{ color: "var(--text-2)" }}>
                          {lead.createdAt
                            ? `${formatDate(lead.createdAt)} · ${new Intl.DateTimeFormat("de-AT", { hour: "2-digit", minute: "2-digit" }).format(new Date(lead.createdAt))} Uhr`
                            : "—"}
                        </span>
                      </div>

                      {lead.updatedAt && (
                        <div className="flex items-center justify-between">
                          <span style={{ color: "var(--text-3)" }}>Zuletzt aktualisiert:</span>
                          <span className="font-mono text-[11px] font-medium" style={{ color: "var(--text-2)" }}>
                            {`${formatDate(lead.updatedAt)} · ${new Intl.DateTimeFormat("de-AT", { hour: "2-digit", minute: "2-digit" }).format(new Date(lead.updatedAt))} Uhr`}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                // Edit Form
                <div className="space-y-4 text-sm animate-fade-in">
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
                      <option value="DM">Instagram DM</option>
                      <option value="EMAIL">E-Mail Akquise</option>
                    </select>
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <label
                      className={`flex items-center gap-2 text-xs font-semibold ${
                        lead?.status === "NOT_RELEVANT" ? "opacity-40 cursor-not-allowed" : "cursor-pointer"
                      }`}
                      style={{ color: "var(--text)" }}
                    >
                      <input
                        type="checkbox"
                        checked={editIsFocus}
                        disabled={lead?.status === "NOT_RELEVANT"}
                        onChange={(e) => setEditIsFocus(e.target.checked)}
                        className="rounded border-[var(--border)] accent-amber-400"
                      />
                      <span>⭐ Für 2-Wochen-Fokus vormerken</span>
                    </label>
                    {lead?.status === "NOT_RELEVANT" && (
                      <span className="text-[10px] text-[var(--text-3)]">(Irrelevante Leads haben keinen Fokus)</span>
                    )}
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

                  <div className="flex items-center gap-3 pt-3 border-t" style={{ borderColor: "var(--border)" }}>
                    <button
                      onClick={handleSaveLeadDetails}
                      disabled={savingDetails}
                      className="flex-1 text-center font-bold px-4 py-2.5 rounded-lg text-sm hover:opacity-90 transition-opacity"
                      style={{ background: "var(--accent)", color: "var(--bg)" }}
                    >
                      {savingDetails ? "Speichert…" : "Speichern"}
                    </button>
                    <button
                      onClick={() => setIsEditing(false)}
                      className="flex-1 text-center font-bold px-4 py-2.5 rounded-lg text-sm hover:bg-[var(--surface-4)] transition-colors"
                      style={{ background: "var(--surface-3)", color: "var(--text)" }}
                    >
                      Abbrechen
                    </button>
                  </div>
                </div>
              )}
            </aside>
          )}
        </div>
      )}

      {/* ─── Pitch Teleprompter / Fullscreen Modal Overlay ──────────────────── */}
      {pitchFullscreen && (() => {
        const scriptText = customOutreachScript;
        if (!scriptText || !lead) return null;
        return (
          <div className="fixed inset-0 z-[70] flex flex-col bg-black/92 backdrop-blur-md text-white animate-fade-in p-6 sm:p-10 select-none">
            {/* Top Bar */}
            <div className="flex items-center justify-between pb-4 border-b border-white/10 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center font-bold text-sm bg-gradient-to-br from-orange-500 to-amber-600 text-white shadow-lg shadow-orange-500/20">
                  ⚡
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-bold text-white">{lead.companyName}</h3>
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-400 font-semibold border border-orange-500/30">
                      Teleprompter / Anruf-Modus
                    </span>
                  </div>
                  {lead.phone && (
                    <a
                      href={`tel:${lead.phone}`}
                      className="text-xs text-zinc-400 hover:text-orange-400 transition-colors flex items-center gap-1 mt-0.5"
                    >
                      <Phone className="w-3 h-3" />
                      <span>{lead.phone}</span>
                    </a>
                  )}
                </div>
              </div>

              {/* Action Controls */}
              <div className="flex items-center gap-2">
                {/* Font Size Adjuster */}
                <div className="flex items-center border border-white/15 rounded-lg overflow-hidden bg-white/5 mr-2">
                  <button
                    type="button"
                    onClick={() => setTeleprompterFontSize((s) => Math.max(16, s - 2))}
                    className="px-2.5 py-1 text-xs font-bold hover:bg-white/10 transition-colors"
                    title="Schrift verkleinern"
                  >
                    A-
                  </button>
                  <span className="px-2 text-[11px] font-mono text-zinc-400 border-x border-white/10">
                    {teleprompterFontSize}px
                  </span>
                  <button
                    type="button"
                    onClick={() => setTeleprompterFontSize((s) => Math.min(42, s + 2))}
                    className="px-2.5 py-1 text-xs font-bold hover:bg-white/10 transition-colors"
                    title="Schrift vergrößern"
                  >
                    A+
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(scriptText);
                    setCopiedPitch(true);
                    setTimeout(() => setCopiedPitch(false), 2000);
                  }}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-white/10 hover:bg-white/20 transition-all border border-white/15"
                >
                  {copiedPitch ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-emerald-400 font-bold">Kopiert!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-orange-400" />
                      <span>Kopieren</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setPitchFullscreen(false);
                    setPreloadedOutreachText(scriptText);
                    setActiveTab("outreach");
                  }}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-gradient-to-r from-orange-500 to-amber-600 text-white hover:opacity-95 shadow-md shadow-orange-500/20"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>In Outreach</span>
                </button>

                <button
                  type="button"
                  onClick={() => setPitchFullscreen(false)}
                  className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition-colors ml-1"
                  title="Vollbild schließen (Esc)"
                >
                  <Minimize2 className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Main Teleprompter Content */}
            <div className="flex-1 overflow-y-auto flex items-center justify-center p-4 sm:p-8">
              <div
                onClick={() => {
                  navigator.clipboard.writeText(scriptText);
                  setCopiedPitch(true);
                  setTimeout(() => setCopiedPitch(false), 2000);
                }}
                className="max-w-4xl w-full p-8 sm:p-12 rounded-2xl bg-white/[0.04] border border-white/10 hover:border-orange-500/40 cursor-pointer transition-all shadow-2xl leading-relaxed whitespace-pre-wrap select-text"
                style={{ fontSize: `${teleprompterFontSize}px` }}
                title="Klicken zum schnellen Kopieren"
              >
                „{scriptText}“
              </div>
            </div>

            {/* Bottom Status / Shortcut Hint */}
            <div className="pt-3 border-t border-white/10 flex items-center justify-between text-xs text-zinc-400 shrink-0">
              <span className="flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-orange-400" />
                <span>Custom Outreach-Skript</span>
              </span>
              <span>Drücke <kbd className="px-1.5 py-0.5 rounded bg-white/10 font-mono text-[11px] text-zinc-300">Esc</kbd> zum Schließen</span>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

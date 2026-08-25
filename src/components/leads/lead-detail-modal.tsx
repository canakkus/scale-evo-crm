"use client";

import { useState, useEffect } from "react";
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
} from "lucide-react";
import { StatusBadge, PriorityDot } from "@/components/ui/status-badge";
import { STATUS_LABELS, PREFERRED_CONTACT_METHOD_LABELS, INTERACTION_LABELS } from "@/lib/constants";
import { formatDate, timeAgo } from "@/lib/utils";
import type { LeadStatus, Priority, InteractionType } from "@prisma/client";

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

  // New Interaction Form
  const [newInteractionType, setNewInteractionType] = useState<InteractionType>("PHONE");
  const [newInteractionNote, setNewInteractionNote] = useState("");
  const [addingInteraction, setAddingInteraction] = useState(false);

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
  }, [leadId]);

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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "var(--overlay)", backdropFilter: "var(--overlay-blur)" }}>
      <div
        className="relative w-full max-w-4xl max-h-[90vh] flex flex-col rounded-xl border shadow-2xl overflow-hidden animate-fade-in"
        style={{ background: "var(--surface)", borderColor: "var(--border)" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b shrink-0" style={{ borderColor: "var(--border)" }}>
          <div className="flex items-center gap-3">
            <h2 className="font-heading text-xl font-bold" style={{ color: "var(--text)" }}>
              {lead?.companyName || "Lädt…"}
            </h2>
            {lead && <StatusBadge status={lead.status} />}
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md transition-colors hover:bg-[var(--surface-3)]"
            style={{ color: "var(--text-2)" }}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {loading || !lead ? (
          <div className="p-12 text-center" style={{ color: "var(--text-3)" }}>
            <div className="w-6 h-6 rounded-full border-2 border-t-transparent animate-spin mx-auto mb-2" style={{ borderColor: "var(--border-2)", borderTopColor: "var(--accent)" }} />
            Lädt Details…
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Left Column: Quick Info & Status */}
            <div className="space-y-6 md:col-span-1 border-r pr-6" style={{ borderColor: "var(--border)" }}>
              {/* Status Switcher */}
              <div>
                <label className="block text-xs font-semibold mb-2" style={{ color: "var(--text-2)" }}>
                  Status ändern
                </label>
                <select
                  className="w-full rounded-md px-3 py-2 text-xs font-medium border outline-none cursor-pointer"
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
              <div className="space-y-3 text-xs">
                {lead.industry && (
                  <div className="flex items-center gap-2" style={{ color: "var(--text-2)" }}>
                    <span className="font-medium" style={{ color: "var(--text-3)" }}>Branche:</span>
                    <span style={{ color: "var(--text)" }}>{lead.industry}</span>
                  </div>
                )}

                {lead.city && (
                  <div className="flex items-center gap-2" style={{ color: "var(--text-2)" }}>
                    <MapPin className="w-3.5 h-3.5" style={{ color: "var(--text-3)" }} />
                    <span style={{ color: "var(--text)" }}>{lead.address ? `${lead.address}, ${lead.city}` : lead.city}</span>
                  </div>
                )}

                {lead.phone && (
                  <div className="flex items-center gap-2">
                    <Phone className="w-3.5 h-3.5" style={{ color: "var(--text-3)" }} />
                    <a href={`tel:${lead.phone}`} className="hover:underline font-mono" style={{ color: "var(--accent)" }}>
                      {lead.phone}
                    </a>
                  </div>
                )}

                {lead.email && (
                  <div className="flex items-center gap-2">
                    <Mail className="w-3.5 h-3.5" style={{ color: "var(--text-3)" }} />
                    <a href={`mailto:${lead.email}`} className="hover:underline truncate" style={{ color: "var(--accent)" }}>
                      {lead.email}
                    </a>
                  </div>
                )}

                {lead.website && (
                  <div className="flex items-center gap-2">
                    <Globe className="w-3.5 h-3.5" style={{ color: "var(--text-3)" }} />
                    <a href={lead.website.startsWith("http") ? lead.website : `https://${lead.website}`} target="_blank" rel="noreferrer" className="hover:underline truncate" style={{ color: "var(--accent)" }}>
                      {lead.website.replace(/^https?:\/\//, "")}
                    </a>
                  </div>
                )}

                {lead.instagram && (
                  <div className="flex items-center gap-2">
                    <Camera className="w-3.5 h-3.5" style={{ color: "var(--text-3)" }} />
                    <span style={{ color: "var(--text)" }}>{lead.instagram}</span>
                  </div>
                )}

                {lead.googleRating != null && (
                  <div className="flex items-center gap-2">
                    <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                    <span className="font-semibold" style={{ color: "var(--text)" }}>
                      {lead.googleRating.toFixed(1)}
                    </span>
                    {lead.googleReviewCount != null && (
                      <span style={{ color: "var(--text-3)" }}>({lead.googleReviewCount} Bewertungen)</span>
                    )}
                  </div>
                )}

                {lead.contactPerson && (
                  <div className="flex items-center gap-2 pt-2 border-t" style={{ borderColor: "var(--border)" }}>
                    <User className="w-3.5 h-3.5" style={{ color: "var(--text-3)" }} />
                    <span style={{ color: "var(--text-2)" }}>Ansprechpartner:</span>
                    <span className="font-medium" style={{ color: "var(--text)" }}>{lead.contactPerson}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Middle & Right Column: Notes & Timeline */}
            <div className="space-y-6 md:col-span-2">
              {/* Notes Box */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold" style={{ color: "var(--text)" }}>
                    Notizen & Besonderheiten
                  </label>
                  <button
                    onClick={handleSaveNotes}
                    disabled={savingNotes}
                    className="text-xs font-medium px-2.5 py-1 rounded transition-colors hover:bg-[var(--surface-3)]"
                    style={{ background: "var(--surface-2)", color: "var(--accent)" }}
                  >
                    {savingNotes ? "Speichert…" : "Notiz Speichern"}
                  </button>
                </div>
                <textarea
                  rows={4}
                  className="w-full rounded-md p-3 text-xs border outline-none resize-none"
                  style={{ background: "var(--surface-2)", borderColor: "var(--border)", color: "var(--text)" }}
                  value={notesText}
                  onChange={(e) => setNotesText(e.target.value)}
                  placeholder="Notizen zum Lead..."
                />
              </div>

              {/* Interactions Timeline */}
              <div className="space-y-4 pt-4 border-t" style={{ borderColor: "var(--border)" }}>
                <h3 className="text-xs font-semibold" style={{ color: "var(--text)" }}>
                  Kontakt-Timeline ({lead.interactions?.length || 0})
                </h3>

                {/* Add Interaction Form */}
                <form onSubmit={handleAddInteraction} className="flex gap-2">
                  <select
                    className="rounded-md px-2 py-1.5 text-xs border outline-none"
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
                    className="px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1"
                    style={{ background: "var(--accent)", color: "var(--bg)" }}
                  >
                    <Send className="w-3 h-3" />
                    Hinzufügen
                  </button>
                </form>

                {/* Timeline Items */}
                <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
                  {lead.interactions?.length === 0 ? (
                    <p className="text-xs italic" style={{ color: "var(--text-3)" }}>
                      Noch keine Interaktionen aufgezeichnet.
                    </p>
                  ) : (
                    lead.interactions?.map((item: any) => (
                      <div
                        key={item.id}
                        className="p-3 rounded-lg border text-xs space-y-1"
                        style={{ background: "var(--surface-2)", borderColor: "var(--border)" }}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-[11px]" style={{ color: "var(--accent)" }}>
                            {INTERACTION_LABELS[item.type as InteractionType] || item.type}
                          </span>
                          <span className="text-[10px]" style={{ color: "var(--text-3)" }}>
                            {timeAgo(item.createdAt)}
                          </span>
                        </div>
                        <p style={{ color: "var(--text)" }}>{item.note}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

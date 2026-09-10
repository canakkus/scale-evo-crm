"use client";

import { useState } from "react";
import { X, Save, Sparkles } from "lucide-react";
import { PlacesAutofill } from "@/components/ui/places-autofill";
import type { PlaceSuggestion } from "@/lib/places";
import { INDUSTRIES, PREFERRED_CONTACT_METHOD_LABELS, STATUS_LABELS, ACQUISITION_TYPE_LABELS } from "@/lib/constants";
import type { AcquisitionType, LeadStatus, Priority, WebPresence } from "@prisma/client";

type LeadFormModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
};

export function LeadFormModal({ isOpen, onClose, onSuccess }: LeadFormModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [formData, setFormData] = useState({
    companyName: "",
    acquisitionType: "CALL" as AcquisitionType,
    nfcDemoUrl: "",
    industry: "Friseur",
    address: "",
    city: "",
    webPresence: "WEBSITE" as WebPresence,
    website: "",
    treatwellUrl: "",
    phone: "",
    email: "",
    instagram: "",
    googleMapsUrl: "",
    googleRating: "",
    googleReviewCount: "",
    contactPerson: "",
    preferredContactMethod: "" as string,
    contactNote: "",
    notes: "",
    status: "NEW" as LeadStatus,
    priority: "MEDIUM" as Priority,
  });

  if (!isOpen) return null;

  function handlePlaceSelect(place: PlaceSuggestion) {
    setFormData((prev) => ({
      ...prev,
      companyName: place.name || prev.companyName,
      address: place.address || prev.address,
      city: place.city || prev.city,
      phone: place.phone || prev.phone,
      website: place.website || prev.website,
      googleMapsUrl: place.googleMapsUri || prev.googleMapsUrl,
      googleRating: place.rating != null ? String(place.rating) : prev.googleRating,
      googleReviewCount: place.reviewCount != null ? String(place.reviewCount) : prev.googleReviewCount,
      industry: place.industry && INDUSTRIES.includes(place.industry) ? place.industry : prev.industry,
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formData.companyName.trim()) {
      setError("Firmenname darf nicht leer sein.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Fehler beim Erstellen.");
      }

      onSuccess();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Fehler beim Speichern.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "var(--overlay)", backdropFilter: "var(--overlay-blur)" }}>
      <div
        className="relative w-full max-w-2xl max-h-[90vh] flex flex-col rounded-xl border shadow-2xl overflow-hidden animate-fade-in"
        style={{ background: "var(--surface)", borderColor: "var(--border)" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b shrink-0" style={{ borderColor: "var(--border)" }}>
          <h2 className="font-heading text-lg font-bold" style={{ color: "var(--text)" }}>
            Neuen Lead erfassen
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded-md transition-colors hover:bg-[var(--surface-3)]"
            style={{ color: "var(--text-2)" }}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Places Autofill */}
          <div className="p-4 rounded-lg border" style={{ background: "var(--surface-2)", borderColor: "var(--border)" }}>
            <PlacesAutofill onSelect={handlePlaceSelect} />
          </div>

          {error && (
            <div className="p-3 rounded-md text-xs font-medium border" style={{ background: "var(--status-lost-bg)", color: "var(--status-lost-tx)", borderColor: "rgba(224,104,104,0.3)" }}>
              {error}
            </div>
          )}

          {/* Core Info */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-2)" }}>Firmenname *</label>
              <input
                required
                type="text"
                className="w-full rounded-md px-3 py-2 text-sm border outline-none"
                style={{ background: "var(--surface-2)", borderColor: "var(--border)", color: "var(--text)" }}
                value={formData.companyName}
                onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-2)" }}>Akquise-Kanal</label>
              <select
                className="w-full rounded-md px-3 py-2 text-sm border outline-none font-medium"
                style={{ background: "var(--surface-2)", borderColor: "var(--border)", color: "var(--text)" }}
                value={formData.acquisitionType}
                onChange={(e) => setFormData({ ...formData, acquisitionType: e.target.value as AcquisitionType })}
              >
                <option value="CALL">Cold Call</option>
                <option value="WALK_IN">Walk-In</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-2)" }}>NFC Demo URL (optional)</label>
              <input
                type="url"
                placeholder="https://demo.scale-evo.com/..."
                className="w-full rounded-md px-3 py-2 text-sm border outline-none font-mono text-xs"
                style={{ background: "var(--surface-2)", borderColor: "var(--border)", color: "var(--text)" }}
                value={formData.nfcDemoUrl}
                onChange={(e) => setFormData({ ...formData, nfcDemoUrl: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-2)" }}>Branche</label>
              <select
                className="w-full rounded-md px-3 py-2 text-sm border outline-none"
                style={{ background: "var(--surface-2)", borderColor: "var(--border)", color: "var(--text)" }}
                value={formData.industry}
                onChange={(e) => setFormData({ ...formData, industry: e.target.value })}
              >
                {INDUSTRIES.map((ind) => (
                  <option key={ind} value={ind}>{ind}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-2)" }}>Adresse</label>
              <input
                type="text"
                className="w-full rounded-md px-3 py-2 text-sm border outline-none"
                style={{ background: "var(--surface-2)", borderColor: "var(--border)", color: "var(--text)" }}
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-2)" }}>Stadt</label>
              <input
                type="text"
                className="w-full rounded-md px-3 py-2 text-sm border outline-none"
                style={{ background: "var(--surface-2)", borderColor: "var(--border)", color: "var(--text)" }}
                value={formData.city}
                onChange={(e) => setFormData({ ...formData, city: e.target.value })}
              />
            </div>
          </div>

          {/* Contact Details */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-2)" }}>Telefon</label>
              <input
                type="text"
                className="w-full rounded-md px-3 py-2 text-sm border outline-none"
                style={{ background: "var(--surface-2)", borderColor: "var(--border)", color: "var(--text)" }}
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-2)" }}>E-Mail</label>
              <input
                type="email"
                className="w-full rounded-md px-3 py-2 text-sm border outline-none"
                style={{ background: "var(--surface-2)", borderColor: "var(--border)", color: "var(--text)" }}
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-2)" }}>Website</label>
              <input
                type="url"
                className="w-full rounded-md px-3 py-2 text-sm border outline-none"
                style={{ background: "var(--surface-2)", borderColor: "var(--border)", color: "var(--text)" }}
                value={formData.website}
                onChange={(e) => setFormData({ ...formData, website: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-2)" }}>Instagram Handle / Link</label>
              <input
                type="text"
                className="w-full rounded-md px-3 py-2 text-sm border outline-none"
                style={{ background: "var(--surface-2)", borderColor: "var(--border)", color: "var(--text)" }}
                value={formData.instagram}
                onChange={(e) => setFormData({ ...formData, instagram: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-2)" }}>Ansprechpartner</label>
              <input
                type="text"
                className="w-full rounded-md px-3 py-2 text-sm border outline-none"
                style={{ background: "var(--surface-2)", borderColor: "var(--border)", color: "var(--text)" }}
                value={formData.contactPerson}
                onChange={(e) => setFormData({ ...formData, contactPerson: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-2)" }}>Bevorzugte Kontaktmethode</label>
              <select
                className="w-full rounded-md px-3 py-2 text-sm border outline-none"
                style={{ background: "var(--surface-2)", borderColor: "var(--border)", color: "var(--text)" }}
                value={formData.preferredContactMethod}
                onChange={(e) => setFormData({ ...formData, preferredContactMethod: e.target.value })}
              >
                <option value="">— Nicht angegeben —</option>
                {Object.entries(PREFERRED_CONTACT_METHOD_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Status & Notes */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-2)" }}>Status</label>
              <select
                className="w-full rounded-md px-3 py-2 text-sm border outline-none"
                style={{ background: "var(--surface-2)", borderColor: "var(--border)", color: "var(--text)" }}
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value as LeadStatus })}
              >
                {Object.entries(STATUS_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-2)" }}>Priorität</label>
              <select
                className="w-full rounded-md px-3 py-2 text-sm border outline-none"
                style={{ background: "var(--surface-2)", borderColor: "var(--border)", color: "var(--text)" }}
                value={formData.priority}
                onChange={(e) => setFormData({ ...formData, priority: e.target.value as Priority })}
              >
                <option value="LOW">Niedrig</option>
                <option value="MEDIUM">Mittel</option>
                <option value="HIGH">Hoch</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-2)" }}>Notizen / Notizen zur Kontaktaufnahme</label>
            <textarea
              rows={3}
              className="w-full rounded-md px-3 py-2 text-sm border outline-none resize-none"
              style={{ background: "var(--surface-2)", borderColor: "var(--border)", color: "var(--text)" }}
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Besonderheiten, Einwände, bestehende Website Mängel..."
            />
          </div>

          {/* Submit */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t" style={{ borderColor: "var(--border)" }}>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm rounded-md transition-colors hover:bg-[var(--surface-3)]"
              style={{ color: "var(--text-2)" }}
            >
              Abbrechen
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-all"
              style={{ background: "var(--accent)", color: "var(--bg)", opacity: loading ? 0.7 : 1 }}
            >
              <Save className="w-4 h-4" />
              {loading ? "Speichert…" : "Lead Speichern"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

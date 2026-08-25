"use client";

import { useState, useEffect } from "react";
import { X, Upload, FileAudio, Sparkles, Loader2, Check } from "lucide-react";

type AudioUploadModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
};

export function AudioUploadModal({ isOpen, onClose, onSuccess }: AudioUploadModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [leadId, setLeadId] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [leads, setLeads] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (isOpen) {
      fetch("/api/leads?limit=100")
        .then((res) => res.json())
        .then((data) => setLeads(data.leads || []))
        .catch((err) => console.error(err));
    }
  }, [isOpen]);

  if (!isOpen) return null;

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) {
      setError("Bitte wähle eine Audiodatei aus.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const formData = new FormData();
      formData.append("file", file);
      if (leadId) formData.append("leadId", leadId);
      if (companyName) formData.append("companyName", companyName);

      const res = await fetch("/api/cold-calls/transcribe", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Transkription fehlgeschlagen.");
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || "Fehler beim Upload & Analyse.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "var(--overlay)", backdropFilter: "var(--overlay-blur)" }}>
      <div
        className="relative w-full max-w-lg rounded-xl border shadow-2xl overflow-hidden animate-fade-in"
        style={{ background: "var(--surface)", borderColor: "var(--border)" }}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b shrink-0" style={{ borderColor: "var(--border)" }}>
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5" style={{ color: "var(--status-warm-tx)" }} />
            <h2 className="font-heading text-lg font-bold" style={{ color: "var(--text)" }}>
              Call-Aufnahme hochladen
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md transition-colors hover:bg-[var(--surface-3)]"
            style={{ color: "var(--text-2)" }}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* File Selector */}
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--text-2)" }}>
              Audiodatei (MP3, WAV, M4A, OGG)
            </label>
            <label
              className="flex flex-col items-center justify-center border-2 border-dashed rounded-lg p-6 cursor-pointer transition-colors hover:bg-[var(--surface-2)]"
              style={{ borderColor: file ? "var(--accent)" : "var(--border-2)" }}
            >
              <FileAudio className="w-8 h-8 mb-2" style={{ color: file ? "var(--accent)" : "var(--text-3)" }} />
              {file ? (
                <div className="text-center">
                  <p className="text-xs font-semibold" style={{ color: "var(--text)" }}>{file.name}</p>
                  <p className="text-[11px]" style={{ color: "var(--text-3)" }}>{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                </div>
              ) : (
                <div className="text-center">
                  <p className="text-xs font-medium" style={{ color: "var(--text)" }}>Klicke zum Auswählen oder Drag & Drop</p>
                  <p className="text-[10px]" style={{ color: "var(--text-3)" }}>Maximum 25 MB</p>
                </div>
              )}
              <input
                type="file"
                accept="audio/*"
                onChange={handleFileChange}
                className="hidden"
              />
            </label>
          </div>

          {/* Lead Selector */}
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-2)" }}>
              Mit Lead verknüpfen (Optional)
            </label>
            <select
              className="w-full rounded-md px-3 py-2 text-xs border outline-none cursor-pointer"
              style={{ background: "var(--surface-2)", borderColor: "var(--border)", color: "var(--text)" }}
              value={leadId}
              onChange={(e) => {
                setLeadId(e.target.value);
                const selected = leads.find((l) => l.id === e.target.value);
                if (selected) setCompanyName(selected.companyName);
              }}
            >
              <option value="">— Nicht zugeordnet / Allgemein —</option>
              {leads.map((lead) => (
                <option key={lead.id} value={lead.id}>
                  {lead.companyName} ({lead.city || "—"})
                </option>
              ))}
            </select>
          </div>

          {!leadId && (
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-2)" }}>
                Firmenname / Bezeichnung (Optional)
              </label>
              <input
                type="text"
                className="w-full rounded-md px-3 py-2 text-xs border outline-none"
                style={{ background: "var(--surface-2)", borderColor: "var(--border)", color: "var(--text)" }}
                placeholder='z. B. "Erstgespräch mit Salon X"'
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
              />
            </div>
          )}

          {error && (
            <div className="p-3 rounded-md text-xs font-medium border" style={{ background: "var(--status-lost-bg)", color: "var(--status-lost-tx)", borderColor: "rgba(224,104,104,0.3)" }}>
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-4 border-t" style={{ borderColor: "var(--border)" }}>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium rounded-md transition-colors hover:bg-[var(--surface-3)]"
              style={{ color: "var(--text-2)" }}
            >
              Abbrechen
            </button>
            <button
              type="submit"
              disabled={loading || !file}
              className="flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-md transition-all disabled:opacity-50"
              style={{ background: "var(--accent)", color: "var(--bg)" }}
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Gemini analysiert Call…
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4" />
                  Transkribieren & Analysieren
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

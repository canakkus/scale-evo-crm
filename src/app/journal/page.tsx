"use client";

import { useState, useEffect } from "react";
import { BookOpen, Save, Calendar } from "lucide-react";
import { formatDate } from "@/lib/utils";

export default function JournalPage() {
  const [entries, setEntries] = useState<any[]>([]);
  const [todayNotes, setTodayNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/journal")
      .then((res) => res.json())
      .then((data) => {
        setEntries(data.entries || []);
        if (data.entries?.length > 0) {
          const first = data.entries[0];
          const firstDate = new Date(first.date).toDateString();
          if (firstDate === new Date().toDateString()) {
            setTodayNotes(first.notes || "");
          }
        }
      })
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  }, []);

  async function handleSaveJournal() {
    setSaving(true);
    try {
      const res = await fetch("/api/journal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: todayNotes }),
      });
      if (res.ok) {
        const data = await res.json();
        // Refresh list
        const updatedRes = await fetch("/api/journal");
        const updatedData = await updatedRes.json();
        setEntries(updatedData.entries || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="font-heading text-2xl font-bold tracking-tight" style={{ color: "var(--text)" }}>
          Arbeits-Journal & Tages-Notizen
        </h1>
        <p className="mt-1 text-xs" style={{ color: "var(--text-2)" }}>
          Halte deine täglichen Gedanken, gelernten Lektionen und Fortschritte für die Agentur fest.
        </p>
      </div>

      {/* Today's Journal Entry Box */}
      <div className="rounded-xl border p-6 space-y-4" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold flex items-center gap-2" style={{ color: "var(--text)" }}>
            <BookOpen className="w-4 h-4" style={{ color: "var(--accent)" }} />
            Heutiges Logbuch ({formatDate(new Date())})
          </h2>
          <button
            onClick={handleSaveJournal}
            disabled={saving}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold"
            style={{ background: "var(--accent)", color: "var(--bg)" }}
          >
            <Save className="w-3.5 h-3.5" />
            {saving ? "Speichert…" : "Notiz Speichern"}
          </button>
        </div>

        <textarea
          rows={5}
          className="w-full rounded-md p-3 text-xs border outline-none resize-none"
          style={{ background: "var(--surface-2)", borderColor: "var(--border)", color: "var(--text)" }}
          placeholder="Was hast du heute gelernt? Welche Akquise-Erkenntnisse gab es?..."
          value={todayNotes}
          onChange={(e) => setTodayNotes(e.target.value)}
        />
      </div>

      {/* Past Entries */}
      <div className="space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--text-2)" }}>
          Vergangene Einträge ({entries.length})
        </h3>

        {loading ? (
          <div className="p-8 text-center text-xs" style={{ color: "var(--text-3)" }}>
            Einträge werden geladen…
          </div>
        ) : entries.length === 0 ? (
          <div className="p-8 text-center text-xs" style={{ color: "var(--text-3)" }}>
            Noch keine vergangenen Einträge vorhanden.
          </div>
        ) : (
          <div className="space-y-3">
            {entries.map((entry) => (
              <div key={entry.id} className="p-4 rounded-xl border space-y-2" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold flex items-center gap-1.5" style={{ color: "var(--text)" }}>
                    <Calendar className="w-3.5 h-3.5" style={{ color: "var(--accent)" }} />
                    {formatDate(entry.date)}
                  </span>
                </div>
                <p className="text-xs leading-relaxed whitespace-pre-wrap" style={{ color: "var(--text-2)" }}>
                  {entry.notes || "Keine Notizen erfasst."}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
